/**
 * Test script for the new clean tunnel connection architecture
 * Run this to test the API-based port detection and clean service architecture
 */

import { connectToTunnel } from '../tunnel/TunnelModule.js';
import type { TunnelProperties, TunnelConnectionResult } from 'tcode-shared';
import { TraceLevel } from '@microsoft/dev-tunnels-ssh';
import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import * as net from 'net';
import { logger } from '../utils/logger';


async function testCleanTunnelConnection(): Promise<void> {
  logger.info('🧪 === TESTING CLEAN TUNNEL CONNECTION ARCHITECTURE ===');
  logger.info('This test will use the new API-based port detection instead of trace parsing');
  
  // Mock tunnel properties - replace with real values for testing
  const mockTunnelProperties: TunnelProperties = {
    tunnelId: process.env.TUNNEL_ID || 'your-tunnel-id',
    clusterId: process.env.CLUSTER_ID || 'your-cluster-id',
    connectAccessToken: process.env.CONNECT_TOKEN || 'your-connect-token',
    managePortsAccessToken: process.env.MANAGE_PORTS_TOKEN || 'your-manage-ports-token',
    serviceUri: process.env.SERVICE_URI || 'https://tunnel-service-uri',
    domain: process.env.DOMAIN || 'tunnel-domain'
  };

  const userAgent = {
    name: 'minimal-terminal-client-test',
    version: '1.0.0'
  };

  logger.info('🔧 Configuration:');
  logger.info(`  - Tunnel ID: ${mockTunnelProperties.tunnelId}`);
  logger.info(`  - Cluster ID: ${mockTunnelProperties.clusterId}`);
  logger.info(`  - Service URI: ${mockTunnelProperties.serviceUri}`);
  logger.info(`  - Connect Token: ${mockTunnelProperties.connectAccessToken ? '[PROVIDED]' : '[MISSING]'}`);
  logger.info(`  - Manage Ports Token: ${mockTunnelProperties.managePortsAccessToken ? '[PROVIDED]' : '[MISSING]'}`);

  if (!process.env.CONNECT_TOKEN) {
    logger.warn('⚠️  WARNING: Using mock tunnel properties. Set environment variables for real testing:');
    logger.warn('  - TUNNEL_ID, CLUSTER_ID, CONNECT_TOKEN, MANAGE_PORTS_TOKEN, SERVICE_URI, DOMAIN');
    logger.info('');
  }

  try {
    logger.info('🚀 Starting clean tunnel connection test...');
    
    const startTime = Date.now();
    const result: TunnelConnectionResult = await connectToTunnel(userAgent, mockTunnelProperties);
    const duration = Date.now() - startTime;
    
    logger.info(`⏱️  Connection attempt completed in ${duration}ms`);
    logger.info('');
    
    if (result.success) {
      logger.info('✅ === TUNNEL CONNECTION SUCCESSFUL ===');
      logger.info(`🔌 Tunnel client: ${result.client ? 'Connected' : 'Not available'}`);
      logger.info(`🗼 SSH port: ${result.sshPort || 'Not detected'}`);
      logger.info(`🤖 RPC connection: ${result.rpcConnection ? 'Active' : 'Not available'}`);
      
      logger.info('📊 Port Information:');
      logger.info(`  - Total ports: ${result.portInfo.allPorts.length}`);
      logger.info(`  - User ports: ${result.portInfo.userPorts.length}`);
      logger.info(`  - Management ports: ${result.portInfo.managementPorts.length}`);
      
      if (result.portInfo.allPorts.length > 0) {
        logger.info('📋 Port Details:');
        for (const port of result.portInfo.allPorts) {
          logger.info(`  - Port ${port.portNumber || 'local port unknown'} (${port.protocol || 'unknown protocol'})`);
        }
      }
      
      // Test RPC connection if available
      if (result.rpcConnection) {
        logger.info('');
        logger.info('🧪 Testing RPC connection...');
        try {
          result.rpcConnection.getCurrentPrivateKey();
          logger.info('✅ RPC test successful');
        } catch (rpcError: unknown) {
          logger.warn(`⚠️  RPC test failed: ${rpcError instanceof Error ? rpcError.message : String(rpcError)}`);
        }
      }
      
      // Test SSH connection if port is available
      if (result.sshPort) {
        logger.info('');
        logger.info('🧪 Testing SSH port connectivity...');
        const sshConnectable = await testPortConnection('127.0.0.1', result.sshPort);
        logger.info(`${sshConnectable ? '✅' : '❌'} SSH port ${result.sshPort} ${sshConnectable ? 'is' : 'is not'} connectable`);
      }
      
      logger.info('');
      logger.info('🧹 Cleaning up connection...');
      result.cleanup();
      logger.info('✅ Cleanup completed');
      
    } else {
      logger.error('❌ === TUNNEL CONNECTION FAILED ===');
      logger.error(`Error: ${result.error}`);
      
      if (result.client) {
        logger.warn('⚠️  Partial connection established - cleaning up...');
        result.cleanup();
      }
    }
    
  } catch (error: unknown) {
    logger.error('💥 === TUNNEL CONNECTION TEST CRASHED ===');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(`Error: ${errorMessage}`);
    logger.error('Stack trace:');
    if (errorStack) {
      logger.error(errorStack);
    }
  }
  
  logger.info('');
  logger.info('🏁 Clean tunnel connection test completed');
}

/**
 * Test if a port is accepting connections
 */
async function testPortConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 3000);
    
    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

/**
 * Test trace listener functionality separately
 */
async function testTraceListener() {
  logger.info('🧪 === TESTING TRACE LISTENER SERVICE ===');
  
  const { TraceListenerService } = await import('../tunnel/TraceListenerService');
  
  const traceListener = new TraceListenerService({
    enablePortParsing: true,
    enableConnectionLogging: true,
    logLevel: 'all',
    maxTraceHistory: 100
  });
  
  // Simulate some trace messages
  logger.info('📝 Simulating trace messages...');
  
  // Mock tunnel client for testing
  const mockClient = {
    trace: (_level: TraceLevel, _eventId: number, _msg: string, _err?: Error) => {}
  };
  
  traceListener.attachToClient(mockClient as TunnelRelayTunnelClient);
  
  // Simulate trace calls using TraceLevel enum values
  // Note: TraceLevel.Info is typically 4 in the enum
  mockClient.trace(TraceLevel.Info, 1001, 'Forwarding from 127.0.0.1:12345 to host port 16634.');
  mockClient.trace(TraceLevel.Info, 1001, 'Forwarding from 127.0.0.1:54321 to host port 2222.');
  mockClient.trace(TraceLevel.Info, 1002, 'Connection established to tunnel');
  
  // Wait a moment for processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check results
  const stats = traceListener.getTraceStats();
  logger.info('📊 Trace statistics:', { stats });
  
  const portMappings = traceListener.extractPortMappingsFromTraces();
  logger.info('🔌 Extracted port mappings:', { portMappings });
  
  traceListener.detachFromClient(mockClient as TunnelRelayTunnelClient);
  logger.info('✅ Trace listener test completed');
}

// Main test execution
async function runAllTests() {
  logger.info('🧪 === RUNNING ALL CLEAN ARCHITECTURE TESTS ===');
  logger.info('');
  
  // Test 1: Trace listener (safe to run without real connections)
  await testTraceListener();
  logger.info('');
  
  // Test 2: Full tunnel connection (requires real tunnel properties)
  if (process.env.CONNECT_TOKEN) {
    await testCleanTunnelConnection();
  } else {
    logger.warn('⏭️  Skipping full tunnel connection test (no CONNECT_TOKEN provided)');
    logger.warn('   To run full test, set environment variables and run again');
  }
  
  logger.info('');
  logger.info('🏁 All tests completed');
}

// Export for use as module
export { testCleanTunnelConnection, testTraceListener, runAllTests };

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}