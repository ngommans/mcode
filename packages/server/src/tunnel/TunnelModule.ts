/**
 * Clean Tunnel Module - Updated implementation using new port forwarding architecture
 * Replaces TunnelModule.ts with clean API-based port detection
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { ManagementApiVersions, TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { Tunnel, TunnelAccessScopes, TunnelProtocol } from '@microsoft/dev-tunnels-contracts';
import type { TunnelProperties, TunnelConnectionResult, PortInformation, TunnelPort as SharedTunnelPort } from 'tcode-shared';
import TunnelPortService from './TunnelPortService.js';
import { createInvoker, type CodespaceRPCInvoker } from '../rpc/CodespaceRPCInvoker.js';
import { PortMapping } from './PortForwardingManager.js';

import { logger } from '../utils/logger.js';
import { extractErrorMessage } from '../utils/typeSafeTunnel.js';

// Helper function to convert PortMapping to SharedTunnelPort
function convertPortMappingToSharedTunnelPort(mapping: PortMapping, clusterId: string, tunnelId: string): SharedTunnelPort {
  return {
    portNumber: mapping.localPort,
    protocol: mapping.protocol || 'unknown',
    clusterId,
    tunnelId
  };
}


interface TunnelReference {
  tunnelId: string;
  clusterId: string;
}

interface TunnelRequestOptions {
  tokenScopes: string[];
  accessToken: string;
}

interface UserAgent {
  name: string;
  version: string;
}

interface SSHServerInfo {
  port: number;
  user: string;
  isRunning: boolean;
}

interface RPCInvokerResult {
  sshServerInfo?: SSHServerInfo;
  rpcConnection?: CodespaceRPCInvoker;
  error?: string;
}

/**
 * Clean tunnel connection using the new port forwarding architecture
 */
export async function connectToTunnel(
  userAgent: UserAgent,
  tunnelProperties: TunnelProperties
): Promise<TunnelConnectionResult> {
  logger.info('🚀 === CLEAN TUNNEL CONNECTION START ===');
  logger.info('Using new API-based port detection architecture');

  const tunnelReference: TunnelReference = {
    tunnelId: tunnelProperties.tunnelId,
    clusterId: tunnelProperties.clusterId,
  };

  const tunnelManagementClient = new TunnelManagementHttpClient(
    userAgent,
    ManagementApiVersions.Version20230927preview,
    () => Promise.resolve(tunnelProperties.serviceUri)
  );

  const tunnelRequestOptions: TunnelRequestOptions = {
    tokenScopes: [TunnelAccessScopes.Connect, TunnelAccessScopes.ManagePorts],
    accessToken: tunnelProperties.connectAccessToken,
  };

  let client: TunnelRelayTunnelClient | null = null;
  let portService: TunnelPortService | null = null;
  const portInfo: PortInformation = { userPorts: [], managementPorts: [], allPorts: [] };

  try {
    logger.info('📡 Fetching tunnel object for connection...');
    const tunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
    
    if (!tunnel) {
      throw new Error('Failed to retrieve tunnel from management client');
    }
    
    tunnel.accessTokens = {
      connect: tunnelProperties.connectAccessToken,
      "manage:ports": tunnelProperties.managePortsAccessToken,
    };

    // Initialize port service first
    logger.info('🔧 Initializing port forwarding service...');
    portService = new TunnelPortService({
      enableTraceParsingFallback: true, // Keep as fallback for debugging
      portDetectionTimeoutMs: 5000,
      fallbackToPortScanning: true
    });

    // Create tunnel client
    client = new TunnelRelayTunnelClient();
    
    logger.info('🔌 Connecting tunnel client...');
    await client.connect(tunnel);
    logger.info('✅ Tunnel client connected successfully');

    // Initialize port service with connected clients
    await portService.initialize(client, tunnelManagementClient, tunnelProperties);
    logger.info('✅ Port service initialized successfully');

    // Get initial port information using new API
    const initialPortState = portService.getPortForwardingState();
    // PortForwardingState doesn't have allPorts, construct it from user + management ports
    const allPortMappings = [...initialPortState.userPorts, ...initialPortState.managementPorts];
    portInfo.allPorts = allPortMappings.map(p => convertPortMappingToSharedTunnelPort(p, tunnelProperties.clusterId, tunnelProperties.tunnelId));
    portInfo.userPorts = initialPortState.userPorts.map(p => convertPortMappingToSharedTunnelPort(p, tunnelProperties.clusterId, tunnelProperties.tunnelId));
    portInfo.managementPorts = initialPortState.managementPorts.map(p => convertPortMappingToSharedTunnelPort(p, tunnelProperties.clusterId, tunnelProperties.tunnelId));

    logger.info(`📊 Initial port state: ${portInfo.userPorts.length} user ports, ${portInfo.managementPorts.length} management ports`);

    // Step 1: RPC Connection and SSH Server Start (following GitHub CLI pattern)
    logger.info('🚀 === PRIMARY: RPC INVOKER PHASE ===');
    const rpcResult = await createRPCConnectionAndStartSSH(portService, tunnelProperties, client);
    
    if (rpcResult.sshServerInfo && rpcResult.sshServerInfo.isRunning) {
      logger.info(`✅ RPC SSH server started successfully:`, { sshServerInfo: rpcResult.sshServerInfo });
      logger.info(`🎯 Using RPC-provided SSH port: ${rpcResult.sshServerInfo.port}`);
      
      // Step 2: Request SSH Port Forwarding using clean API
      logger.info('🚀 === REQUESTING SSH PORT FORWARDING ===');
      const remoteSSHPort = rpcResult.sshServerInfo.port;
      
      // Create tunnel port if it doesn't exist
      await ensureSSHTunnelPortExists(
        tunnelManagementClient, 
        tunnel, 
        remoteSSHPort, 
        tunnelProperties
      );
      
      // Use GitHub CLI pattern: RefreshPorts + WaitForForwardedPort
      await triggerPortForwardingRefresh(client);
      
      // Use new port service to detect SSH port
      logger.info('🔍 Detecting SSH port using clean API...');
      const sshDetection = await portService.detectSshPort();
      
      if (sshDetection.success && sshDetection.localPort) {
        logger.info(`✅ SSH port detected: ${sshDetection.localPort} (source: ${sshDetection.source})`);
        
        return {
          success: true,
          client: client,
          portInfo: await getUpdatedPortInfo(portService, tunnelProperties),
          sshPort: sshDetection.localPort,
          rpcConnection: rpcResult.rpcConnection,
          cleanup: () => cleanupConnection(client, portService)
        };
      } else {
        logger.warn(`⚠️  SSH port detection failed: ${sshDetection.error}`);
        logger.info('🔄 Falling back to secondary SSH detection phase...');
      }
    }

    // Fallback: Secondary SSH Detection Phase
    logger.info('🔄 === SECONDARY: SSH DETECTION PHASE ===');
    const fallbackSSHResult = await checkExistingSSHServerClean(portService);
    
    if (fallbackSSHResult) {
      logger.info(`✅ Found existing SSH server on port ${fallbackSSHResult.localPort}`);
      
      return {
        success: true,
        client,
        portInfo: await getUpdatedPortInfo(portService, tunnelProperties),
        sshPort: fallbackSSHResult.localPort,
        rpcConnection: rpcResult.rpcConnection,
        cleanup: () => cleanupConnection(client, portService)
      };
    }

    // If we get here, SSH detection failed but we still have a working tunnel
    logger.warn('⚠️  SSH server not detected, but tunnel connection is working');
    
    return {
      success: true,
      client,
      portInfo: await getUpdatedPortInfo(portService, tunnelProperties),
      sshPort: undefined,
      rpcConnection: rpcResult.rpcConnection,
      cleanup: () => cleanupConnection(client, portService)
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ Clean tunnel connection failed:', { error: errorMessage });
    
    // Cleanup on failure
    if (portService) {
      portService.cleanup();
    }
    if (client) {
      try {
        // TunnelRelayTunnelClient doesn't have close method, it has dispose
        await client.dispose();
      } catch (closeError) {
        logger.error('Error closing client:', { closeError });
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      client: undefined,
      portInfo,
      cleanup: () => {}
    };
  }
}

/**
 * Create RPC connection and start SSH server using clean port detection
 */
async function createRPCConnectionAndStartSSH(
  portService: TunnelPortService,
  tunnelProperties: TunnelProperties,
  tunnelClient: TunnelRelayTunnelClient
): Promise<RPCInvokerResult> {
  try {
    logger.info('🔍 Detecting RPC port using clean API...');
    
    // Use new port service to detect RPC port
    const rpcDetection = await portService.detectRpcPort();
    
    if (!rpcDetection.success || !rpcDetection.localPort) {
      logger.warn(`⚠️  RPC port detection failed: ${rpcDetection.error}`);
      return { error: `RPC port detection failed: ${rpcDetection.error}` };
    }

    logger.info(`✅ RPC port detected: ${rpcDetection.localPort} (source: ${rpcDetection.source})`);

    // Create RPC invoker (this will use the detected RPC port internally)
    logger.info('🚀 Creating RPC invoker...');
    const rpcInvoker = await createInvoker(
      tunnelClient,
      tunnelProperties.connectAccessToken
    );

    logger.info('✅ RPC invoker created successfully');

    // Start SSH server via RPC
    logger.info('🚀 Starting SSH server via RPC...');
    const sshResult = await rpcInvoker.startSSHServer();

    if (sshResult.success) {
      logger.info(`✅ SSH server started via RPC: port ${sshResult.port}, user ${sshResult.user}`);
      return {
        sshServerInfo: {
          port: sshResult.port,
          user: sshResult.user,
          isRunning: true
        },
        rpcConnection: rpcInvoker
      };
    } else {
      logger.warn(`⚠️  SSH server start failed: ${sshResult.message}`);
      return { error: `SSH server start failed: ${sshResult.message}` };
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ RPC connection and SSH start failed:', { error: errorMessage });
    return { error: errorMessage };
  }
}

/**
 * Check for existing SSH server using clean API
 */
async function checkExistingSSHServerClean(
  portService: TunnelPortService
): Promise<{ localPort: number; remotePort: number } | null> {
  try {
    logger.info('🔍 Checking for existing SSH server using clean API...');
    
    // Try to detect SSH port (this will check existing state and attempt new detection)
    const sshDetection = await portService.detectSshPort();
    
    if (sshDetection.success && sshDetection.localPort && sshDetection.mapping) {
      logger.info(`✅ Found existing SSH server: ${sshDetection.localPort} -> ${sshDetection.mapping.remotePort}`);
      return {
        localPort: sshDetection.localPort,
        remotePort: sshDetection.mapping.remotePort
      };
    }
    
    logger.warn('⚠️  No existing SSH server found');
    return null;
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ Existing SSH server check failed:', { error: errorMessage });
    return null;
  }
}

/**
 * Ensure SSH tunnel port exists (create if needed)
 */
async function ensureSSHTunnelPortExists(
  tunnelManagementClient: TunnelManagementHttpClient,
  tunnel: Tunnel,
  remoteSSHPort: number,
  tunnelProperties: TunnelProperties
): Promise<void> {
  try {
    logger.info(`🔧 Ensuring tunnel port exists for remote port ${remoteSSHPort}...`);
    
    // Check if tunnel port already exists
    const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
      tokenScopes: [TunnelAccessScopes.ManagePorts],
      accessToken: tunnelProperties.managePortsAccessToken,
    });
    
    const portExists = existingPorts.find(p => p.portNumber === remoteSSHPort);
    
    if (!portExists) {
      logger.info(`Creating tunnel port ${remoteSSHPort} for SSH server...`);
      
      // CRITICAL: Use HTTP protocol instead of SSH to enable local port forwarding
      const tunnelPort = { 
        portNumber: remoteSSHPort, 
        protocol: TunnelProtocol.Http,  // ✅ HTTP protocol enables forwarding
        description: `SSH server on port ${remoteSSHPort}`
      };
      
      const createPortOptions = {
        tokenScopes: [TunnelAccessScopes.ManagePorts],
        accessToken: tunnelProperties.managePortsAccessToken,
      };
      
      await tunnelManagementClient.createTunnelPort(tunnel, tunnelPort, createPortOptions);
      logger.info(`✅ Tunnel port ${remoteSSHPort} created successfully`);
    } else {
      logger.info(`✅ Tunnel port ${remoteSSHPort} already exists`);
    }
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Failed to create tunnel port ${remoteSSHPort}:`, { error: errorMessage });
    logger.warn(`📡 Continuing anyway - tunnel might handle dynamic forwarding...`);
  }
}

/**
 * Trigger port forwarding refresh using GitHub CLI pattern
 */
async function triggerPortForwardingRefresh(client: TunnelRelayTunnelClient): Promise<void> {
  try {
    logger.info(`📡 Following GitHub CLI pattern: RefreshPorts + WaitForForwardedPort`);
    
    // Call RefreshPorts to trigger the codespace to send tcpip-forward request
    await client.refreshPorts();
    logger.info(`✅ RefreshPorts() completed - should trigger tcpip-forward from codespace`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('⚠️  Port forwarding refresh failed:', { error: errorMessage });
    logger.warn('📡 Continuing anyway - tunnel might auto-refresh...');
  }
}

/**
 * Get updated port information from the port service
 */
async function getUpdatedPortInfo(portService: TunnelPortService, tunnelProperties: TunnelProperties): Promise<PortInformation> {
  try {
    // Refresh port state to get latest information
    await portService.refreshPortState();
    
    const state = portService.getPortForwardingState();
    
    return {
      userPorts: state.userPorts.map(p => convertPortMappingToSharedTunnelPort(p, tunnelProperties.clusterId, tunnelProperties.tunnelId)),
      managementPorts: state.managementPorts.map(p => convertPortMappingToSharedTunnelPort(p, tunnelProperties.clusterId, tunnelProperties.tunnelId)),
      allPorts: [...state.userPorts, ...state.managementPorts].map(p => convertPortMappingToSharedTunnelPort(p, tunnelProperties.clusterId, tunnelProperties.tunnelId))
    };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('⚠️  Failed to get updated port info:', { error: errorMessage });
    return { userPorts: [], managementPorts: [], allPorts: [] };
  }
}

/**
 * Clean up connection resources
 */
function cleanupConnection(
  client: TunnelRelayTunnelClient | null, 
  portService: TunnelPortService | null
): void {
  logger.info('🧹 Cleaning up clean tunnel connection...');
  
  if (portService) {
    portService.cleanup();
  }
  
  if (client) {
    client.dispose().catch((error) => {
      logger.error('Error disconnecting tunnel client:', { error: extractErrorMessage(error) });
    }).finally(() => {
      logger.info('✅ Clean tunnel connection cleanup completed');
    });
  }
}

export { TunnelPortService };