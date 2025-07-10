/**
 * Clean Tunnel Module - Updated implementation using new port forwarding architecture
 * Replaces TunnelModule.ts with clean API-based port detection
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { ManagementApiVersions, TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { TunnelAccessScopes, TunnelProtocol } from '@microsoft/dev-tunnels-contracts';
import type { TunnelProperties, TunnelConnectionResult, PortInformation } from 'tcode-shared';
import TunnelPortService from './TunnelPortService.js';
import { createInvoker, type CodespaceRPCInvoker } from '../rpc/CodespaceRPCInvoker.js';

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
  console.log('🚀 === CLEAN TUNNEL CONNECTION START ===');
  console.log('Using new API-based port detection architecture');

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
    console.log('📡 Fetching tunnel object for connection...');
    const tunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
    
    if (!tunnel) {
      throw new Error('Failed to retrieve tunnel from management client');
    }
    
    tunnel.accessTokens = {
      connect: tunnelProperties.connectAccessToken,
      "manage:ports": tunnelProperties.managePortsAccessToken,
    };

    // Initialize port service first
    console.log('🔧 Initializing port forwarding service...');
    portService = new TunnelPortService({
      enableTraceParsingFallback: true, // Keep as fallback for debugging
      portDetectionTimeoutMs: 5000,
      fallbackToPortScanning: true
    });

    // Create tunnel client
    client = new TunnelRelayTunnelClient();
    
    console.log('🔌 Connecting tunnel client...');
    await client.connect(tunnel);
    console.log('✅ Tunnel client connected successfully');

    // Initialize port service with connected clients
    await portService.initialize(client, tunnelManagementClient, tunnelProperties);
    console.log('✅ Port service initialized successfully');

    // Get initial port information using new API
    const initialPortState = portService.getPortForwardingState();
    portInfo.allPorts = [...initialPortState.userPorts, ...initialPortState.managementPorts] as any[];
    portInfo.userPorts = initialPortState.userPorts as any[];
    portInfo.managementPorts = initialPortState.managementPorts as any[];

    console.log(`📊 Initial port state: ${portInfo.userPorts.length} user ports, ${portInfo.managementPorts.length} management ports`);

    // Step 1: RPC Connection and SSH Server Start (following GitHub CLI pattern)
    console.log('🚀 === PRIMARY: RPC INVOKER PHASE ===');
    const rpcResult = await createRPCConnectionAndStartSSH(portService, tunnelProperties);
    
    if (rpcResult.sshServerInfo && rpcResult.sshServerInfo.isRunning) {
      console.log(`✅ RPC SSH server started successfully:`, rpcResult.sshServerInfo);
      console.log(`🎯 Using RPC-provided SSH port: ${rpcResult.sshServerInfo.port}`);
      
      // Step 2: Request SSH Port Forwarding using clean API
      console.log('🚀 === REQUESTING SSH PORT FORWARDING ===');
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
      console.log('🔍 Detecting SSH port using clean API...');
      const sshDetection = await portService.detectSshPort();
      
      if (sshDetection.success && sshDetection.localPort) {
        console.log(`✅ SSH port detected: ${sshDetection.localPort} (source: ${sshDetection.source})`);
        
        return {
          success: true,
          client,
          portInfo: await getUpdatedPortInfo(portService),
          sshPort: sshDetection.localPort,
          rpcConnection: rpcResult.rpcConnection,
          cleanup: () => cleanupConnection(client, portService)
        };
      } else {
        console.warn(`⚠️  SSH port detection failed: ${sshDetection.error}`);
        console.log('🔄 Falling back to secondary SSH detection phase...');
      }
    }

    // Fallback: Secondary SSH Detection Phase
    console.log('🔄 === SECONDARY: SSH DETECTION PHASE ===');
    const fallbackSSHResult = await checkExistingSSHServerClean(portService);
    
    if (fallbackSSHResult) {
      console.log(`✅ Found existing SSH server on port ${fallbackSSHResult.localPort}`);
      
      return {
        success: true,
        client,
        portInfo: await getUpdatedPortInfo(portService),
        sshPort: fallbackSSHResult.localPort,
        rpcConnection: rpcResult.rpcConnection,
        cleanup: () => cleanupConnection(client, portService)
      };
    }

    // If we get here, SSH detection failed but we still have a working tunnel
    console.log('⚠️  SSH server not detected, but tunnel connection is working');
    
    return {
      success: true,
      client,
      portInfo: await getUpdatedPortInfo(portService),
      sshPort: undefined,
      rpcConnection: rpcResult.rpcConnection,
      cleanup: () => cleanupConnection(client, portService)
    };

  } catch (error: any) {
    console.error('❌ Clean tunnel connection failed:', error.message);
    
    // Cleanup on failure
    if (portService) {
      portService.cleanup();
    }
    if (client) {
      try {
        // TunnelRelayTunnelClient doesn't have close method, it has disconnect
        if (typeof (client as any).disconnect === 'function') {
          await (client as any).disconnect();
        }
      } catch (closeError) {
        console.error('Error closing client:', closeError);
      }
    }
    
    return {
      success: false,
      error: error.message,
      client: null,
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
  tunnelProperties: TunnelProperties
): Promise<RPCInvokerResult> {
  try {
    console.log('🔍 Detecting RPC port using clean API...');
    
    // Use new port service to detect RPC port
    const rpcDetection = await portService.detectRpcPort();
    
    if (!rpcDetection.success || !rpcDetection.localPort) {
      console.warn(`⚠️  RPC port detection failed: ${rpcDetection.error}`);
      return { error: `RPC port detection failed: ${rpcDetection.error}` };
    }

    console.log(`✅ RPC port detected: ${rpcDetection.localPort} (source: ${rpcDetection.source})`);

    // Create RPC invoker (this will use the detected RPC port internally)
    console.log('🚀 Creating RPC invoker...');
    // Get tunnel client from port service for RPC invoker
    const tunnelClient = (portService as any).tunnelClient;
    if (!tunnelClient) {
      throw new Error('Tunnel client not available from port service');
    }
    
    const rpcInvoker = await createInvoker(
      tunnelClient,
      tunnelProperties.connectAccessToken
    );

    console.log('✅ RPC invoker created successfully');

    // Start SSH server via RPC
    console.log('🚀 Starting SSH server via RPC...');
    const sshResult = await rpcInvoker.startSSHServer();

    if (sshResult.success) {
      console.log(`✅ SSH server started via RPC: port ${sshResult.port}, user ${sshResult.user}`);
      return {
        sshServerInfo: {
          port: sshResult.port,
          user: sshResult.user,
          isRunning: true
        },
        rpcConnection: rpcInvoker
      };
    } else {
      console.warn(`⚠️  SSH server start failed: ${sshResult.message}`);
      return { error: `SSH server start failed: ${sshResult.message}` };
    }

  } catch (error: any) {
    console.error('❌ RPC connection and SSH start failed:', error.message);
    return { error: error.message };
  }
}

/**
 * Check for existing SSH server using clean API
 */
async function checkExistingSSHServerClean(
  portService: TunnelPortService
): Promise<{ localPort: number; remotePort: number } | null> {
  try {
    console.log('🔍 Checking for existing SSH server using clean API...');
    
    // Try to detect SSH port (this will check existing state and attempt new detection)
    const sshDetection = await portService.detectSshPort();
    
    if (sshDetection.success && sshDetection.localPort && sshDetection.mapping) {
      console.log(`✅ Found existing SSH server: ${sshDetection.localPort} -> ${sshDetection.mapping.remotePort}`);
      return {
        localPort: sshDetection.localPort,
        remotePort: sshDetection.mapping.remotePort
      };
    }
    
    console.log('⚠️  No existing SSH server found');
    return null;
    
  } catch (error: any) {
    console.error('❌ Existing SSH server check failed:', error.message);
    return null;
  }
}

/**
 * Ensure SSH tunnel port exists (create if needed)
 */
async function ensureSSHTunnelPortExists(
  tunnelManagementClient: TunnelManagementHttpClient,
  tunnel: any,
  remoteSSHPort: number,
  tunnelProperties: TunnelProperties
): Promise<void> {
  try {
    console.log(`🔧 Ensuring tunnel port exists for remote port ${remoteSSHPort}...`);
    
    // Check if tunnel port already exists
    const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
      tokenScopes: [TunnelAccessScopes.ManagePorts],
      accessToken: tunnelProperties.managePortsAccessToken,
    });
    
    const portExists = existingPorts.find(p => p.portNumber === remoteSSHPort);
    
    if (!portExists) {
      console.log(`Creating tunnel port ${remoteSSHPort} for SSH server...`);
      
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
      console.log(`✅ Tunnel port ${remoteSSHPort} created successfully`);
    } else {
      console.log(`✅ Tunnel port ${remoteSSHPort} already exists`);
    }
    
  } catch (error: any) {
    console.error(`❌ Failed to create tunnel port ${remoteSSHPort}:`, error.message);
    console.log(`📡 Continuing anyway - tunnel might handle dynamic forwarding...`);
  }
}

/**
 * Trigger port forwarding refresh using GitHub CLI pattern
 */
async function triggerPortForwardingRefresh(client: TunnelRelayTunnelClient): Promise<void> {
  try {
    console.log(`📡 Following GitHub CLI pattern: RefreshPorts + WaitForForwardedPort`);
    
    // Call RefreshPorts to trigger the codespace to send tcpip-forward request
    if (typeof (client as any).refreshPorts === 'function') {
      await (client as any).refreshPorts();
      console.log(`✅ RefreshPorts() completed - should trigger tcpip-forward from codespace`);
    } else {
      console.log(`⚠️  refreshPorts method not available, trying alternatives...`);
      
      // Try alternative method names
      if (typeof (client as any).RefreshPorts === 'function') {
        await (client as any).RefreshPorts();
        console.log(`✅ RefreshPorts() (capitalized) completed`);
      } else if (typeof (client as any).refresh === 'function') {
        await (client as any).refresh();
        console.log(`✅ refresh() completed`);
      } else {
        console.log(`⚠️  No refresh methods found - relying on automatic refresh`);
      }
    }
    
  } catch (error: any) {
    console.warn('⚠️  Port forwarding refresh failed:', error.message);
    console.log('📡 Continuing anyway - tunnel might auto-refresh...');
  }
}

/**
 * Get updated port information from the port service
 */
async function getUpdatedPortInfo(portService: TunnelPortService): Promise<PortInformation> {
  try {
    // Refresh port state to get latest information
    await portService.refreshPortState();
    
    const state = portService.getPortForwardingState();
    
    return {
      userPorts: state.userPorts as any[],
      managementPorts: state.managementPorts as any[],
      allPorts: [...state.userPorts, ...state.managementPorts] as any[]
    };
    
  } catch (error: any) {
    console.warn('⚠️  Failed to get updated port info:', error.message);
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
  console.log('🧹 Cleaning up clean tunnel connection...');
  
  if (portService) {
    portService.cleanup();
  }
  
  if (client) {
    try {
      // TunnelRelayTunnelClient doesn't have close method, it has disconnect
      if (typeof (client as any).disconnect === 'function') {
        (client as any).disconnect().catch((error: any) => {
          console.error('Error disconnecting tunnel client:', error);
        });
      }
    } catch (error) {
      console.error('Error disconnecting tunnel client:', error);
    }
  }
  
  console.log('✅ Clean tunnel connection cleanup completed');
}

export { TunnelPortService };