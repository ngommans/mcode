/**
 * Test script for the new clean tunnel connection architecture
 * Run this to test the API-based port detection and clean service architecture
 */

import { connectToTunnel } from '../tunnel/TunnelModuleClean.js';
import type { TunnelProperties, TunnelConnectionResult } from 'tcode-shared';

async function testCleanTunnelConnection(): Promise<void> {
  console.log('🧪 === TESTING CLEAN TUNNEL CONNECTION ARCHITECTURE ===');
  console.log('This test will use the new API-based port detection instead of trace parsing');
  
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

  console.log('🔧 Configuration:');
  console.log(`  - Tunnel ID: ${mockTunnelProperties.tunnelId}`);
  console.log(`  - Cluster ID: ${mockTunnelProperties.clusterId}`);
  console.log(`  - Service URI: ${mockTunnelProperties.serviceUri}`);
  console.log(`  - Connect Token: ${mockTunnelProperties.connectAccessToken ? '[PROVIDED]' : '[MISSING]'}`);
  console.log(`  - Manage Ports Token: ${mockTunnelProperties.managePortsAccessToken ? '[PROVIDED]' : '[MISSING]'}`);

  if (!process.env.CONNECT_TOKEN) {
    console.log('⚠️  WARNING: Using mock tunnel properties. Set environment variables for real testing:');
    console.log('  - TUNNEL_ID, CLUSTER_ID, CONNECT_TOKEN, MANAGE_PORTS_TOKEN, SERVICE_URI, DOMAIN');
    console.log('');
  }

  try {
    console.log('🚀 Starting clean tunnel connection test...');
    
    const startTime = Date.now();
    const result: TunnelConnectionResult = await connectToTunnel(userAgent, mockTunnelProperties);
    const duration = Date.now() - startTime;
    
    console.log(`⏱️  Connection attempt completed in ${duration}ms`);
    console.log('');
    
    if (result.success) {
      console.log('✅ === TUNNEL CONNECTION SUCCESSFUL ===');
      console.log(`🔌 Tunnel client: ${result.client ? 'Connected' : 'Not available'}`);
      console.log(`🗼 SSH port: ${result.sshPort || 'Not detected'}`);
      console.log(`🤖 RPC connection: ${result.rpcConnection ? 'Active' : 'Not available'}`);
      
      console.log('📊 Port Information:');
      console.log(`  - Total ports: ${result.portInfo.allPorts.length}`);
      console.log(`  - User ports: ${result.portInfo.userPorts.length}`);
      console.log(`  - Management ports: ${result.portInfo.managementPorts.length}`);
      
      if (result.portInfo.allPorts.length > 0) {
        console.log('📋 Port Details:');
        for (const port of result.portInfo.allPorts) {
          console.log(`  - Port ${(port as any).remotePort || port.portNumber}: ${(port as any).localPort || 'local port unknown'} (${(port as any).protocol || 'unknown protocol'})`);
        }
      }
      
      // Test RPC connection if available
      if (result.rpcConnection) {
        console.log('');
        console.log('🧪 Testing RPC connection...');
        try {
          // Test keep-alive
          result.rpcConnection.keepAlive();
          console.log('✅ RPC keep-alive test successful');
        } catch (rpcError: any) {
          console.warn(`⚠️  RPC test failed: ${rpcError.message}`);
        }
      }
      
      // Test SSH connection if port is available
      if (result.sshPort) {
        console.log('');
        console.log('🧪 Testing SSH port connectivity...');
        const sshConnectable = await testPortConnection('127.0.0.1', result.sshPort);
        console.log(`${sshConnectable ? '✅' : '❌'} SSH port ${result.sshPort} ${sshConnectable ? 'is' : 'is not'} connectable`);
      }
      
      console.log('');
      console.log('🧹 Cleaning up connection...');
      result.cleanup();
      console.log('✅ Cleanup completed');
      
    } else {
      console.log('❌ === TUNNEL CONNECTION FAILED ===');
      console.log(`Error: ${result.error}`);
      
      if (result.client) {
        console.log('⚠️  Partial connection established - cleaning up...');
        result.cleanup();
      }
    }
    
  } catch (error: any) {
    console.error('💥 === TUNNEL CONNECTION TEST CRASHED ===');
    console.error(`Error: ${error.message}`);
    console.error('Stack trace:');
    console.error(error.stack);
  }
  
  console.log('');
  console.log('🏁 Clean tunnel connection test completed');
}

/**
 * Test if a port is accepting connections
 */
async function testPortConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
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
  console.log('🧪 === TESTING TRACE LISTENER SERVICE ===');
  
  const { TraceListenerService } = await import('../tunnel/TraceListenerService');
  
  const traceListener = new TraceListenerService({
    enablePortParsing: true,
    enableConnectionLogging: true,
    logLevel: 'all',
    maxTraceHistory: 100
  });
  
  // Simulate some trace messages
  console.log('📝 Simulating trace messages...');
  
  // Mock tunnel client for testing
  const mockClient = {
    trace: () => {}
  };
  
  traceListener.attachToClient(mockClient as any);
  
  // Simulate trace calls
  (mockClient as any).trace('info', 'test', 'Forwarding from 127.0.0.1:12345 to host port 16634.');
  (mockClient as any).trace('info', 'test', 'Forwarding from 127.0.0.1:54321 to host port 2222.');
  (mockClient as any).trace('info', 'test', 'Connection established to tunnel');
  
  // Wait a moment for processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check results
  const stats = traceListener.getTraceStats();
  console.log('📊 Trace statistics:', stats);
  
  const portMappings = traceListener.extractPortMappingsFromTraces();
  console.log('🔌 Extracted port mappings:', portMappings);
  
  traceListener.detachFromClient(mockClient as any);
  console.log('✅ Trace listener test completed');
}

// Main test execution
async function runAllTests() {
  console.log('🧪 === RUNNING ALL CLEAN ARCHITECTURE TESTS ===');
  console.log('');
  
  // Test 1: Trace listener (safe to run without real connections)
  await testTraceListener();
  console.log('');
  
  // Test 2: Full tunnel connection (requires real tunnel properties)
  if (process.env.CONNECT_TOKEN) {
    await testCleanTunnelConnection();
  } else {
    console.log('⏭️  Skipping full tunnel connection test (no CONNECT_TOKEN provided)');
    console.log('   To run full test, set environment variables and run again');
  }
  
  console.log('');
  console.log('🏁 All tests completed');
}

// Export for use as module
export { testCleanTunnelConnection, testTraceListener, runAllTests };

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}