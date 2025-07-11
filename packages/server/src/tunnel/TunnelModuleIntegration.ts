/**
 * Integration example showing how to use the new port forwarding architecture
 * Demonstrates clean separation of concerns with API-based detection and optional trace listening
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import type { TunnelProperties } from 'tcode-shared';
import TunnelPortService from './TunnelPortService.js';
import TraceListenerService from './TraceListenerService.js';
import { createInvoker } from '../rpc/CodespaceRPCInvoker.js';

import { logger } from '../utils/logger';

export interface CleanTunnelConnectionOptions {
  enableDebugTracing?: boolean;
  portDetectionTimeoutMs?: number;
  fallbackToPortScanning?: boolean;
}

/**
 * Clean tunnel connection implementation using the new architecture
 * Replaces the complex inline trace parsing with proper service abstractions
 */
export async function establishCleanTunnelConnection(
  tunnelClient: TunnelRelayTunnelClient,
  tunnelManager: TunnelManagementHttpClient,
  tunnelProperties: TunnelProperties,
  options: CleanTunnelConnectionOptions = {}
): Promise<{
  rpcPort?: number;
  sshPort?: number;
  portService: TunnelPortService;
  traceService?: TraceListenerService;
}> {
  
  logger.info('🚀 === CLEAN TUNNEL CONNECTION START ===');
  
  // Initialize the port service with clean configuration
  const portService = new TunnelPortService({
    enableTraceParsingFallback: options.enableDebugTracing || false,
    portDetectionTimeoutMs: options.portDetectionTimeoutMs || 5000,
    fallbackToPortScanning: options.fallbackToPortScanning ?? true
  });

  try {
    // Step 1: Initialize port service (sets up API-based detection)
    logger.info('📡 Initializing port forwarding manager...');
    await portService.initialize(tunnelClient, tunnelManager, tunnelProperties);
    
    // Step 2: Detect RPC port using clean API-first approach
    logger.info('🔍 Detecting RPC port (16634) using API methods...');
    const rpcDetection = await portService.detectRpcPort();
    
    let rpcPort: number | undefined;
    if (rpcDetection.success && rpcDetection.localPort) {
      rpcPort = rpcDetection.localPort;
      logger.info(`✅ RPC port detected: ${rpcPort} (source: ${rpcDetection.source})`);
    } else {
      logger.warn(`⚠️  RPC port detection failed: ${rpcDetection.error}`);
    }

    // Step 3: Start RPC invoker if we have RPC port
    if (rpcPort) {
      try {
        logger.info('🚀 Creating RPC invoker...');
        await createInvoker(tunnelClient, tunnelProperties.connectAccessToken);
        logger.info('✅ RPC invoker created successfully');
        logger.info('🔄 RPC invoker available for SSH server operations');
      } catch (rpcError: any) {
        logger.warn(`⚠️  RPC invoker creation failed: ${rpcError.message}`);
      }
    }

    // Step 4: Detect SSH port using clean API-first approach
    logger.info('🔍 Detecting SSH port (2222/22) using API methods...');
    const sshDetection = await portService.detectSshPort();
    
    let sshPort: number | undefined;
    if (sshDetection.success && sshDetection.localPort) {
      sshPort = sshDetection.localPort;
      logger.info(`✅ SSH port detected: ${sshPort} (source: ${sshDetection.source})`);
    } else {
      logger.warn(`⚠️  SSH port detection failed: ${sshDetection.error}`);
    }

    // Step 5: Set up real-time port monitoring
    portService.onPortStateChange((state) => {
      logger.info(`📊 Port state updated: ${state.userPorts.length} user ports, ${state.managementPorts.length} management ports`);
      
      // Update network icon or other UI elements here
      // This replaces the complex WebSocket port update logic
    });

    // Optional: Get debug trace service if enabled
    const traceService = portService.getTraceListener();
    if (traceService) {
      logger.info('🎧 Trace listener active for debugging');
      
      // Example: Log trace statistics
      setTimeout(() => {
        const stats = traceService.getTraceStats();
        logger.info('📈 Trace statistics:', { stats });
      }, 10000);
    }

    logger.info('✅ Clean tunnel connection established successfully');
    
    return {
      rpcPort,
      sshPort,
      portService,
      traceService
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ Clean tunnel connection failed:', { error: errorMessage });
    
    // Cleanup on failure
    portService.cleanup();
    
    throw new Error(`Clean tunnel connection failed: ${errorMessage}`);
  }
}

/**
 * Example of monitoring port changes in real-time
 */
export function setupPortMonitoring(portService: TunnelPortService): () => void {
  logger.info('📡 Setting up real-time port monitoring...');
  
  return portService.onPortStateChange((state) => {
    logger.info('🔄 Port state changed:');
    logger.info(`  - User ports: ${state.userPorts.length}`);
    logger.info(`  - Management ports: ${state.managementPorts.length}`);
    logger.info(`  - RPC port: ${state.rpcPort ? state.rpcPort.localPort : 'not detected'}`);
    logger.info(`  - SSH port: ${state.sshPort ? state.sshPort.localPort : 'not detected'}`);
    logger.info(`  - Last updated: ${state.lastUpdated.toISOString()}`);
    
    // Example: Update UI network icon
    const totalPorts = state.userPorts.length + state.managementPorts.length;
    updateNetworkIcon(totalPorts);
    
    // Example: Update port dialog
    updatePortDialog(state.userPorts.concat(state.managementPorts));
  });
}

/**
 * Example UI update functions (placeholders)
 */
function updateNetworkIcon(portCount: number): void {
  logger.info(`🗼 Updating network icon: ${portCount} active ports`);
  // This would update the actual UI network icon
}

function updatePortDialog(ports: any[]): void {
  logger.info(`📋 Updating port dialog: ${ports.length} ports available`);
  // This would update the actual port dialog UI
}

/**
 * Example of requesting specific port forwarding
 */
export async function requestSpecificPortForwarding(
  portService: TunnelPortService, 
  remotePort: number
): Promise<number | null> {
  logger.info(`📡 Requesting port forwarding for remote port ${remotePort}...`);
  
  const result = await portService.requestPortForwarding(remotePort);
  
  if (result.success && result.localPort) {
    logger.info(`✅ Port ${remotePort} forwarded to local port ${result.localPort}`);
    return result.localPort;
  } else {
    logger.warn(`⚠️  Failed to forward port ${remotePort}: ${result.error}`);
    return null;
  }
}

/**
 * Example of debugging with trace data
 */
export function exportDebugTraceData(portService: TunnelPortService): string | null {
  const traceData = portService.exportTraceData();
  
  if (traceData) {
    logger.info('📄 Exporting trace data for debugging...');
    // This could be saved to a file or sent to support
    return traceData;
  } else {
    logger.warn('⚠️  No trace data available (trace listener not enabled)');
    return null;
  }
}

/**
 * Clean shutdown procedure
 */
export function cleanupTunnelConnection(
  portService: TunnelPortService,
  portMonitoringUnsubscribe?: () => void
): void {
  logger.info('🧹 Cleaning up tunnel connection...');
  
  // Unsubscribe from port monitoring
  if (portMonitoringUnsubscribe) {
    portMonitoringUnsubscribe();
  }
  
  // Cleanup port service (disables trace listener if active)
  portService.cleanup();
  
  logger.info('✅ Tunnel connection cleanup completed');
}