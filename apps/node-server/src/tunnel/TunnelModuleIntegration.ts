/**
 * Integration example showing how to use the new port forwarding architecture
 * Demonstrates clean separation of concerns with API-based detection and optional trace listening
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import type { TunnelProperties } from '@minimal-terminal-client/shared';
import TunnelPortService from './TunnelPortService.js';
import TraceListenerService from './TraceListenerService.js';
import { createInvoker } from '../rpc/CodespaceRPCInvoker.js';

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
  
  console.log('🚀 === CLEAN TUNNEL CONNECTION START ===');
  
  // Initialize the port service with clean configuration
  const portService = new TunnelPortService({
    enableTraceParsingFallback: options.enableDebugTracing || false,
    portDetectionTimeoutMs: options.portDetectionTimeoutMs || 5000,
    fallbackToPortScanning: options.fallbackToPortScanning ?? true
  });

  try {
    // Step 1: Initialize port service (sets up API-based detection)
    console.log('📡 Initializing port forwarding manager...');
    await portService.initialize(tunnelClient, tunnelManager, tunnelProperties);
    
    // Step 2: Detect RPC port using clean API-first approach
    console.log('🔍 Detecting RPC port (16634) using API methods...');
    const rpcDetection = await portService.detectRpcPort();
    
    let rpcPort: number | undefined;
    if (rpcDetection.success && rpcDetection.localPort) {
      rpcPort = rpcDetection.localPort;
      console.log(`✅ RPC port detected: ${rpcPort} (source: ${rpcDetection.source})`);
    } else {
      console.warn(`⚠️  RPC port detection failed: ${rpcDetection.error}`);
    }

    // Step 3: Start RPC invoker if we have RPC port
    if (rpcPort) {
      try {
        console.log('🚀 Creating RPC invoker...');
        await createInvoker(tunnelClient, tunnelProperties.connectAccessToken);
        console.log('✅ RPC invoker created successfully');
        console.log('🔄 RPC invoker available for SSH server operations');
      } catch (rpcError: any) {
        console.warn(`⚠️  RPC invoker creation failed: ${rpcError.message}`);
      }
    }

    // Step 4: Detect SSH port using clean API-first approach
    console.log('🔍 Detecting SSH port (2222/22) using API methods...');
    const sshDetection = await portService.detectSshPort();
    
    let sshPort: number | undefined;
    if (sshDetection.success && sshDetection.localPort) {
      sshPort = sshDetection.localPort;
      console.log(`✅ SSH port detected: ${sshPort} (source: ${sshDetection.source})`);
    } else {
      console.warn(`⚠️  SSH port detection failed: ${sshDetection.error}`);
    }

    // Step 5: Set up real-time port monitoring
    portService.onPortStateChange((state) => {
      console.log(`📊 Port state updated: ${state.userPorts.length} user ports, ${state.managementPorts.length} management ports`);
      
      // Update network icon or other UI elements here
      // This replaces the complex WebSocket port update logic
    });

    // Optional: Get debug trace service if enabled
    const traceService = portService.getTraceListener();
    if (traceService) {
      console.log('🎧 Trace listener active for debugging');
      
      // Example: Log trace statistics
      setTimeout(() => {
        const stats = traceService.getTraceStats();
        console.log('📈 Trace statistics:', stats);
      }, 10000);
    }

    console.log('✅ Clean tunnel connection established successfully');
    
    return {
      rpcPort,
      sshPort,
      portService,
      traceService
    };

  } catch (error: any) {
    console.error('❌ Clean tunnel connection failed:', error.message);
    
    // Cleanup on failure
    portService.cleanup();
    
    throw new Error(`Clean tunnel connection failed: ${error.message}`);
  }
}

/**
 * Example of monitoring port changes in real-time
 */
export function setupPortMonitoring(portService: TunnelPortService): () => void {
  console.log('📡 Setting up real-time port monitoring...');
  
  return portService.onPortStateChange((state) => {
    console.log('🔄 Port state changed:');
    console.log(`  - User ports: ${state.userPorts.length}`);
    console.log(`  - Management ports: ${state.managementPorts.length}`);
    console.log(`  - RPC port: ${state.rpcPort ? state.rpcPort.localPort : 'not detected'}`);
    console.log(`  - SSH port: ${state.sshPort ? state.sshPort.localPort : 'not detected'}`);
    console.log(`  - Last updated: ${state.lastUpdated.toISOString()}`);
    
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
  console.log(`🗼 Updating network icon: ${portCount} active ports`);
  // This would update the actual UI network icon
}

function updatePortDialog(ports: any[]): void {
  console.log(`📋 Updating port dialog: ${ports.length} ports available`);
  // This would update the actual port dialog UI
}

/**
 * Example of requesting specific port forwarding
 */
export async function requestSpecificPortForwarding(
  portService: TunnelPortService, 
  remotePort: number
): Promise<number | null> {
  console.log(`📡 Requesting port forwarding for remote port ${remotePort}...`);
  
  const result = await portService.requestPortForwarding(remotePort);
  
  if (result.success && result.localPort) {
    console.log(`✅ Port ${remotePort} forwarded to local port ${result.localPort}`);
    return result.localPort;
  } else {
    console.warn(`⚠️  Failed to forward port ${remotePort}: ${result.error}`);
    return null;
  }
}

/**
 * Example of debugging with trace data
 */
export function exportDebugTraceData(portService: TunnelPortService): string | null {
  const traceData = portService.exportTraceData();
  
  if (traceData) {
    console.log('📄 Exporting trace data for debugging...');
    // This could be saved to a file or sent to support
    return traceData;
  } else {
    console.log('⚠️  No trace data available (trace listener not enabled)');
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
  console.log('🧹 Cleaning up tunnel connection...');
  
  // Unsubscribe from port monitoring
  if (portMonitoringUnsubscribe) {
    portMonitoringUnsubscribe();
  }
  
  // Cleanup port service (disables trace listener if active)
  portService.cleanup();
  
  console.log('✅ Tunnel connection cleanup completed');
}