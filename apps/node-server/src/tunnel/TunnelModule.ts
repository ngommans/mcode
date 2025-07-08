/**
 * Tunnel management module for codespace connections
 * Converted from the original codespaceTunnelModule.js
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { ManagementApiVersions, TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { TunnelAccessScopes, TunnelProtocol } from '@microsoft/dev-tunnels-contracts';
import type { TunnelProperties, TunnelConnectionResult, PortInformation } from 'tcode-shared';
import * as grpc from '@grpc/grpc-js';
import * as net from 'net';
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
  rpcConnection?: grpc.Client;
  error?: string;
}

// Constants moved to RPC module

/**
 * Check if SSH server is already running and accessible via existing port forwarding
 */
async function checkExistingSSHServer(tunnelClient: TunnelRelayTunnelClient): Promise<SSHServerInfo | null> {
  try {
    console.log('🔍 === SSH SERVER DETECTION START ===');
    console.log('Checking for existing SSH server...');
    
    // Check if port 22 is already being forwarded with timeout
    try {
      console.log('⏱️  Waiting for SSH port 22 forwarding (timeout: 3s)...');
      
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('SSH port detection timeout')), 3000);
      });
      
      await Promise.race([
        tunnelClient.waitForForwardedPort(22),
        timeoutPromise
      ]);
      
      console.log('✅ Port 22 is being forwarded');
      console.log('🔍 Scanning common SSH forwarding ports...');
      
      // Since waitForForwardedPort doesn't return the local port,
      // we'll need to check common forwarding ports or use a different approach
      const commonPorts = [2222, 2223, 2224, 22]; // Common SSH forwarding ports
      
      for (const port of commonPorts) {
        console.log(`🔌 Testing SSH connectivity on port ${port}...`);
        const isConnectable = await testPortConnection('127.0.0.1', port);
        if (isConnectable) {
          console.log(`✅ Found accessible SSH server on port ${port}`);
          console.log('🔍 === SSH SERVER DETECTION SUCCESS ===');
          return {
            port: port,
            user: 'node', // Default user, should be detected via RPC
            isRunning: true
          };
        } else {
          console.log(`❌ Port ${port} not accessible`);
        }
      }
      console.log('❌ No accessible SSH ports found despite port 22 being forwarded');
    } catch (error: any) {
      console.log(`⏱️  SSH port detection timeout: ${error.message}`);
      console.log('🔄 Proceeding to RPC phase...');
    }
    
    return null;
  } catch (error) {
    console.log('No existing SSH server found or not accessible:', error);
    return null;
  }
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
    }, 2000);
    
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
 * Create RPC invoker and attempt to start SSH server
 */
async function createRPCInvokerAndStartSSH(
  tunnelClient: TunnelRelayTunnelClient,
  tunnelProperties: TunnelProperties
): Promise<RPCInvokerResult> {
  let rpcInvoker: CodespaceRPCInvoker | null = null;
  
  try {
    console.log('Creating RPC invoker for codespace internal services...');
    
    // Create the RPC invoker using the new implementation
    // Pass the connect access token for authentication
    rpcInvoker = await createInvoker(tunnelClient, tunnelProperties.connectAccessToken);
    console.log('RPC invoker created successfully');
    
    // Attempt to start SSH server
    console.log('Starting SSH server via RPC...');
    const sessionId = `tunnel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sshResult = await rpcInvoker.startSSHServerWithOptions({
      sessionId
    });
    
    console.log('SSH server start result:', sshResult);
    
    if (sshResult.success) {
      return {
        rpcConnection: rpcInvoker as any, // Type compatibility
        sshServerInfo: {
          port: sshResult.port,
          user: sshResult.user,
          isRunning: true
        }
      };
    } else {
      return {
        error: `SSH server start failed: ${sshResult.message || 'Unknown error'}`,
        rpcConnection: rpcInvoker as any
      };
    }
    
  } catch (error: any) {
    console.error('Failed to create RPC invoker and start SSH:', error.message);
    
    // Clean up RPC invoker if it was created
    if (rpcInvoker) {
      try {
        await rpcInvoker.close();
      } catch (cleanupError) {
        console.error('Failed to clean up RPC invoker:', cleanupError);
      }
    }
    
    return {
      error: `RPC setup failed: ${error.message}`
    };
  }
}

export async function forwardSshPortOverTunnel(tunnelProperties: TunnelProperties, options: { debugMode?: boolean } = {}): Promise<TunnelConnectionResult> {
  const userAgent: UserAgent = {
    name: "codespace-tunnel-client",
    version: "1.0.0",
  };

  const tunnelManagementClient = new TunnelManagementHttpClient(
    userAgent,
    ManagementApiVersions.Version20230927preview,
    () => Promise.resolve(`Bearer ${tunnelProperties.managePortsAccessToken}`)
  );

  const tunnelReference: TunnelReference = {
    tunnelId: tunnelProperties.tunnelId,
    clusterId: tunnelProperties.clusterId,
  };

  const tunnelRequestOptions: TunnelRequestOptions = {
    tokenScopes: [TunnelAccessScopes.Connect, TunnelAccessScopes.ManagePorts],
    accessToken: tunnelProperties.connectAccessToken,
  };

  let client: TunnelRelayTunnelClient | null = null;
  let portInfo: PortInformation = { userPorts: [], managementPorts: [], allPorts: [] };

  try {
    console.log('Fetching full tunnel object for port forwarding...');
    const tunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
    
    if (!tunnel) {
      throw new Error('Failed to retrieve tunnel from management client');
    }
    
    tunnel.accessTokens = {
      connect: tunnelProperties.connectAccessToken,
      "manage:ports": tunnelProperties.managePortsAccessToken,
    };

    const sshPort = 22;

    // Get all existing ports and categorize them
    const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
      tokenScopes: [TunnelAccessScopes.ManagePorts],
      accessToken: tunnelProperties.managePortsAccessToken,
    });
    
    // Categorize ports (cast to any to handle type differences)
    portInfo.allPorts = existingPorts as any[];
    portInfo.userPorts = existingPorts.filter(port => 
      port.labels && port.labels.includes('UserForwardedPort')
    ) as any[];
    portInfo.managementPorts = existingPorts.filter(port => 
      port.labels && port.labels.includes('InternalPort')
    ) as any[];

    console.log(`Found ${portInfo.userPorts.length} user ports, ${portInfo.managementPorts.length} management ports`);

    const port22Exists = existingPorts.find(p => p.portNumber === sshPort);

    if (!port22Exists) {
      console.log(`Creating tunnel port ${sshPort}...`);
      const tunnelPort = { portNumber: sshPort, protocol: TunnelProtocol.Ssh, sshUser: "node" };
      const createPortOptions = {
        tokenScopes: [TunnelAccessScopes.ManagePorts],
        accessToken: tunnelProperties.managePortsAccessToken,
      };
      await tunnelManagementClient.createTunnelPort(tunnel, tunnelPort, createPortOptions);
      console.log(`Tunnel port ${sshPort} created.`);
    } else {
      console.log(`Tunnel port ${sshPort} already exists.`);
    }

    client = new TunnelRelayTunnelClient();
    // Track SSH port forwarding from trace messages
    let detectedSSHPort: number | null = null;
    
    // Always enable trace listening for SSH port detection (but limit logging based on debug mode)
    console.log('🔧 Activating trace listener for SSH port detection');
    client.trace = (_level: any, _eventId: any, msg: any, err?: any) => {
      // Only log detailed traces in debug mode
      if (options.debugMode) {
        console.log(`Tunnel Client Trace: ${msg}`);
        if (err) console.error(err);
      }
        
      // Parse trace messages to detect SSH port forwarding (always enabled)
      if (typeof msg === 'string') {
        // Debug: log messages that contain SSH-related ports (only in debug mode)
        if (options.debugMode && (msg.includes('port 22') || msg.includes('port 2222'))) {
          console.log(`🔍 DEBUG: Found SSH port message: "${msg}"`);
        }
          
          // Look for ALL port forwarding patterns to understand what's happening
          // Pattern 1: "Forwarding from 127.0.0.1:XXXXX to host port YYYY."
        const allForwardMatch1 = msg.match(/Forwarding from 127\.0\.0\.1:(\d+) to host port (\d+)\.?/);
        if (allForwardMatch1) {
          const localPort = parseInt(allForwardMatch1[1], 10);
          const remotePort = parseInt(allForwardMatch1[2], 10);
          if (options.debugMode) {
            console.log(`🎯 DETECTED (All Ports): Remote port ${remotePort} forwarded to local port ${localPort}`);
          }
          
          // Check if this is our SSH port
          if (remotePort === 22 || remotePort === 2222) {
            console.log(`🎯 SSH PORT DETECTED: Remote port ${remotePort} -> local port ${localPort}`);
            detectedSSHPort = localPort;
          }
        }
          
          // Pattern 2: Without period at end
          const allForwardMatch2 = msg.match(/Forwarding from 127\.0\.0\.1:(\d+) to host port (\d+)$/);
          if (allForwardMatch2) {
            const localPort = parseInt(allForwardMatch2[1], 10);
            const remotePort = parseInt(allForwardMatch2[2], 10);
            console.log(`🎯 DETECTED (All Ports No Period): Remote port ${remotePort} forwarded to local port ${localPort}`);
            
            // Check if this is our SSH port
            if (remotePort === 22 || remotePort === 2222) {
              console.log(`🎯 SSH PORT DETECTED: Remote port ${remotePort} -> local port ${localPort}`);
              detectedSSHPort = localPort;
            }
          }
          
          // Pattern 3: More flexible pattern that allows for whitespace variations
          const allForwardMatch3 = msg.match(/Forwarding\s+from\s+127\.0\.0\.1:(\d+)\s+to\s+host\s+port\s+(\d+)/);
          if (allForwardMatch3) {
            const localPort = parseInt(allForwardMatch3[1], 10);
            const remotePort = parseInt(allForwardMatch3[2], 10);
            console.log(`🎯 DETECTED (All Ports Flexible): Remote port ${remotePort} forwarded to local port ${localPort}`);
            
            // Check if this is our SSH port
            if (remotePort === 22 || remotePort === 2222) {
              console.log(`🎯 SSH PORT DETECTED: Remote port ${remotePort} -> local port ${localPort}`);
              detectedSSHPort = localPort;
            }
          }
          
          // Also look for RPC port forwarding
          const rpcForwardMatch = msg.match(/Forwarding from 127\.0\.0\.1:(\d+) to host port 16634\./);
          if (rpcForwardMatch) {
            const localPort = parseInt(rpcForwardMatch[1], 10);
            console.log(`🎯 DETECTED: RPC port 16634 forwarded to local port ${localPort}`);
          }
        }
      };

    console.log('Connecting tunnel client for port forwarding...');
    const updatedTunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
    
    if (!updatedTunnel) {
      throw new Error('Failed to retrieve updated tunnel from management client');
    }
    
    updatedTunnel.accessTokens = {
      connect: tunnelProperties.connectAccessToken,
      "manage:ports": tunnelProperties.managePortsAccessToken,
    };

    await client.connect(updatedTunnel);
    console.log('Tunnel client connected for port forwarding.');
    
    // Extract the actual local port that SSH is forwarded to
    let extractedLocalPort = 2222; // Default fallback
    
    // CORRECTED ORDER: Follow GitHub CLI pattern
    // Step 1: Immediately try RPC connection (like GitHub CLI does)
    console.log('🚀 === PRIMARY: RPC INVOKER PHASE ===');
    const rpcResult = await createRPCInvokerAndStartSSH(client, tunnelProperties);
    
    if (rpcResult.sshServerInfo && rpcResult.sshServerInfo.isRunning) {
      console.log(`✅ RPC SSH server started successfully:`, rpcResult.sshServerInfo);
      console.log(`🎯 Using RPC-provided SSH port: ${rpcResult.sshServerInfo.port}`);
      
      // CRITICAL: Create tunnel port for actual SSH server port and request forwarding
      console.log('🚀 === REQUESTING SSH PORT FORWARDING ===');
      const remoteSSHPort = rpcResult.sshServerInfo.port;
      console.log(`📡 SSH server is running on remote port ${remoteSSHPort}`);
      
      // Step 1: Create tunnel port for the actual SSH server port (if it doesn't exist)
      console.log(`🔧 Ensuring tunnel port exists for remote port ${remoteSSHPort}...`);
      try {
        // Check if tunnel port already exists for this port
        const existingPorts = await tunnelManagementClient.listTunnelPorts(updatedTunnel, {
          tokenScopes: [TunnelAccessScopes.ManagePorts],
          accessToken: tunnelProperties.managePortsAccessToken,
        });
        
        const portExists = existingPorts.find(p => p.portNumber === remoteSSHPort);
        
        if (!portExists) {
          console.log(`Creating tunnel port ${remoteSSHPort} for SSH server...`);
          // CRITICAL: Use HTTP protocol instead of SSH to enable local port forwarding
          // SSH protocol ports don't get forwarded locally - they're for direct connections
          const tunnelPort = { 
            portNumber: remoteSSHPort, 
            protocol: TunnelProtocol.Http,  // ✅ HTTP protocol enables forwarding
            // Note: Remove sshUser for HTTP protocol
            description: `SSH server on port ${remoteSSHPort}`
          };
          const createPortOptions = {
            tokenScopes: [TunnelAccessScopes.ManagePorts],
            accessToken: tunnelProperties.managePortsAccessToken,
          };
          await tunnelManagementClient.createTunnelPort(updatedTunnel, tunnelPort, createPortOptions);
          console.log(`✅ Tunnel port ${remoteSSHPort} created successfully`);
        } else {
          console.log(`✅ Tunnel port ${remoteSSHPort} already exists`);
        }
        
      } catch (portCreateError: any) {
        console.error(`❌ Failed to create tunnel port ${remoteSSHPort}:`, portCreateError.message);
        console.log(`📡 Continuing anyway - tunnel might handle dynamic forwarding...`);
      }
      
      // Step 2: FOLLOW GITHUB CLI PATTERN - Use tunnel client APIs to trigger automatic forwarding
      console.log(`📡 Following GitHub CLI pattern: RefreshPorts + WaitForForwardedPort`);
      
      try {
        // GitHub CLI sequence from portforwarder.go:
        // 1. CreateTunnelPort (already done above)
        // 2. Connect to tunnel (already done in main connection)
        // 3. RefreshPorts() - THIS TRIGGERS THE tcpip-forward!
        // 4. WaitForForwardedPort() - waits for the forwarding to be ready
        
        console.log(`📡 Step 1: Calling RefreshPorts() to inform codespace of new port...`);
        
        // Call RefreshPorts to trigger the codespace to send tcpip-forward request
        if (typeof (client as any).refreshPorts === 'function') {
          await (client as any).refreshPorts();
          console.log(`✅ RefreshPorts() completed - should trigger tcpip-forward from codespace`);
        } else {
          console.log(`⚠️  refreshPorts method not available, trying alternative names...`);
          
          // Try alternative method names
          if (typeof (client as any).RefreshPorts === 'function') {
            await (client as any).RefreshPorts();
            console.log(`✅ RefreshPorts() (capitalized) completed`);
          } else if (typeof (client as any).refresh === 'function') {
            await (client as any).refresh();
            console.log(`✅ refresh() completed`);
          } else {
            console.log(`⚠️  No refresh methods found - will try direct waitForForwardedPort`);
          }
        }
        
        console.log(`📡 Step 2: Waiting for port ${remoteSSHPort} to be forwarded (timeout: 5s)...`);
        
        // Now wait for the forwarded port to be ready 
        const forwardingTimeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout waiting for port ${remoteSSHPort} forwarding`)), 5000);
        });
        
        await Promise.race([
          client.waitForForwardedPort(remoteSSHPort),
          forwardingTimeout
        ]);
        
        console.log(`✅ Port ${remoteSSHPort} forwarding is ready!`);
        
        // Give time for the trace messages to be processed and detect the local port
        console.log(`⏱️  Waiting 2 seconds for trace parser to detect local port...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (detectedSSHPort) {
          console.log(`🎯 SUCCESS: Detected SSH forwarding to local port ${detectedSSHPort}`);
          extractedLocalPort = detectedSSHPort;
        } else {
          console.log(`⚠️  Port forwarding ready but no local port detected in traces`);
          console.log(`🔧 Will attempt to find the local port via tunnel client APIs...`);
          
          // Try to get the local port from the tunnel client's port forwarding service
          const sshSession = (client as any).sshSession;
          if (sshSession) {
            try {
              const pfs = sshSession.getService ? sshSession.getService('PortForwardingService') : null;
              if (pfs && (pfs as any).listeners) {
                const listeners = (pfs as any).listeners;
                console.log(`🔍 Checking ${listeners.size} active listeners for port ${remoteSSHPort}...`);
                
                for (const [localPort, listener] of listeners) {
                  const remotePort = (listener as any).remotePort;
                  if (remotePort === remoteSSHPort) {
                    console.log(`🎯 FOUND: Local port ${localPort} forwards to remote port ${remoteSSHPort}`);
                    extractedLocalPort = localPort;
                    detectedSSHPort = localPort;
                    break;
                  }
                }
              }
            } catch (pfsError) {
              console.log(`⚠️  Could not access port forwarding service:`, pfsError);
            }
          }
          
          if (!detectedSSHPort) {
            console.log(`⚠️  Still no local port found - using remote port ${remoteSSHPort} directly`);
            extractedLocalPort = remoteSSHPort;
          }
        }
        
        // Give time for forwarding to establish and detect in traces
        console.log('⏱️  Waiting 3 seconds for forwarding to establish...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if we detected the forwarding in traces
        console.log('🔍 Checking for port forwarding confirmation in traces...');
        console.log(`🔍 DEBUG: Current detectedSSHPort value: ${detectedSSHPort}`);
        console.log(`🔍 DEBUG: Looking for forwarding of remote port: ${remoteSSHPort}`);
        
        if (detectedSSHPort) {
          console.log(`🎯 SUCCESS: Detected SSH forwarding to local port ${detectedSSHPort}`);
          extractedLocalPort = detectedSSHPort;
        } else {
          console.log(`⚠️  No forwarding detected in traces yet for remote port ${remoteSSHPort}`);
          console.log(`🔧 This might be normal - tunnel forwarding may work without traces`);
          console.log(`📡 Will attempt connection to remote port ${remoteSSHPort}`);
          extractedLocalPort = remoteSSHPort;
        }
        
      } catch (forwardError: any) {
        console.error(`❌ Failed to request port forwarding for remote port ${remoteSSHPort}:`, forwardError.message);
        console.log(`📡 This suggests tunnel port ${remoteSSHPort} may not be properly configured`);
        console.log(`🔧 Falling back to port 22 forwarding which we know works...`);
        
        // Fallback: use the port 22 forwarding that we know works
        if (detectedSSHPort) {
          console.log(`🎯 Using detected port 22 forwarding: local port ${detectedSSHPort}`);
          extractedLocalPort = detectedSSHPort;
        } else {
          console.log(`📡 Using default assumption that port 22 forwards to local port 2222`);
          extractedLocalPort = 2222;
        }
      }
      
      console.log('🚀 === RPC SSH INTEGRATION COMPLETE ===');
      console.log(`SSH server running on remote port ${remoteSSHPort}, user: ${rpcResult.sshServerInfo.user}`);
      console.log(`📡 Tunnel should forward remote port ${remoteSSHPort} to a local port`);
      
      // Skip all manual detection - RPC provided the answer
    } else {
      console.log('⚠️  RPC approach failed, falling back to SSH detection...');
      console.log('🔍 === FALLBACK: SSH Server Detection Phase ===');
      
      // Step 2: Only if RPC fails, check for existing SSH connections
      const existingSSH = await checkExistingSSHServer(client);
      
      if (existingSSH && existingSSH.isRunning) {
        console.log(`Found existing SSH server on port ${existingSSH.port}`);
        extractedLocalPort = existingSSH.port;
      } else {
        console.log('No existing SSH server found either');
        if (rpcResult.error) {
          console.warn(`RPC setup failed: ${rpcResult.error}`);
        }
        console.log('Continuing with manual tunnel detection...');
      }
    }

    // CRITICAL: Verify SSH server is actually running and tunnel is forwarding
    console.log('🔍 === TUNNEL VERIFICATION PHASE ===');
    
    // Wait for SSH port 22 to be forwarded by the tunnel
    let sshForwardingConfirmed = false;
    try {
      console.log(`⏱️  Waiting for SSH port ${sshPort} to be forwarded...`);
      
      // Add a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout waiting for SSH port forwarding')), 10000);
      });
      
      await Promise.race([
        client.waitForForwardedPort(sshPort),
        timeoutPromise
      ]);
      
      console.log(`✅ SSH port ${sshPort} forwarding requested successfully`);
      sshForwardingConfirmed = true;
    } catch (waitError: any) {
      console.error(`❌ Failed to wait for SSH port forwarding: ${waitError.message}`);
      console.log('⚠️  SSH port forwarding may not be active - this could explain connection issues');
      // Don't throw - but flag that SSH forwarding is questionable
    }
    
    // Additional verification: check if we can detect any port forwarding at all
    if (!sshForwardingConfirmed) {
      console.log('🔍 Checking if tunnel is forwarding ANY ports...');
      
      // Give the trace parser more time to detect actual forwarding
      console.log('⏱️  Waiting 2 seconds for trace messages to populate...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (detectedSSHPort) {
        console.log(`✅ Trace detection found SSH forwarding despite waitForForwardedPort failure`);
        sshForwardingConfirmed = true;
      } else {
        console.log('❌ No SSH port forwarding detected via traces either');
        console.log('🚨 SSH tunnel may not be properly established');
      }
    }

    // Note: TunnelRelayTunnelClient doesn't have direct event listeners for port forwarding
    // We'll detect the port through the port forwarding service

    console.log('Attempting to extract SSH port forwarding information...');
    
    // First, check if SSH port 22 is actually being forwarded by looking at tunnel ports
    const refreshedPorts = await tunnelManagementClient.listTunnelPorts(updatedTunnel, {
      tokenScopes: [TunnelAccessScopes.ManagePorts],
      accessToken: tunnelProperties.managePortsAccessToken,
    });
    
    console.log('Available tunnel ports:', refreshedPorts.map((p: any) => ({ 
      port: p.portNumber, 
      protocol: p.protocol,
      urls: p.portForwardingUris 
    })));
    
    // Final verification step: test if we actually have a working SSH tunnel
    console.log('🔍 === FINAL TUNNEL VERIFICATION ===');
    console.log(`🔍 DEBUG: detectedSSHPort value: ${detectedSSHPort}`);
    console.log(`🔍 DEBUG: sshForwardingConfirmed: ${sshForwardingConfirmed}`);
    
    // Use the detected SSH port from trace messages if available
    if (detectedSSHPort) {
      extractedLocalPort = detectedSSHPort;
      console.log(`✅ Using SSH port detected from traces: ${extractedLocalPort}`);
      
      // Test if this port is actually connectable
      console.log(`🧪 Testing connectivity to detected SSH port ${extractedLocalPort}...`);
      const isSSHConnectable = await testPortConnection('127.0.0.1', extractedLocalPort);
      if (isSSHConnectable) {
        console.log(`✅ SSH port ${extractedLocalPort} is connectable!`);
        console.log(`🎯 SSH tunnel confirmed: remote port 22 -> local port ${extractedLocalPort}`);
      } else {
        console.log(`❌ SSH port ${extractedLocalPort} detected but not connectable`);
        console.log(`⚠️  This suggests SSH server may not be running in codespace`);
      }
    } else {
      console.log('⚠️ No SSH port detected from traces, trying alternative methods...');
      
      // Extract the actual forwarded port from the tunnel client
      const sshSession = (client as any).sshSession;
      console.log('SSH Session available:', !!sshSession);
      
      if (sshSession) {
        try {
          const pfs = sshSession.getService('PortForwardingService');
          console.log('Port Forwarding Service available:', !!pfs);
          
          if (pfs && pfs.listeners && pfs.listeners.size > 0) {
            console.log(`Available listener ports: ${Array.from(pfs.listeners.keys()).join(', ')}`);
            const listeners = Array.from(pfs.listeners.keys());
            
            // Find the port that's forwarding SSH port 22
            for (const port of listeners) {
              if (typeof port === 'number' && port > 1024 && port < 65535) {
                console.log(`Checking if port ${port} forwards SSH...`);
                
                // Check if this port is forwarding to SSH port 22
                const portInfo = pfs.listeners.get(port);
                if (portInfo) {
                  console.log(`Port ${port} info:`, portInfo);
                  // If this is likely the SSH forwarding port, use it
                  extractedLocalPort = port;
                  console.log(`Using detected SSH forwarding port: ${extractedLocalPort}`);
                  break;
                }
              }
            }
            
            // If we still haven't found the right port, check for forwarded ports
            if (extractedLocalPort === 2222 && pfs.localForwardedPorts) {
              console.log('Checking local forwarded ports...');
              const forwardedPorts = Array.from(pfs.localForwardedPorts.values());
              console.log('Forwarded ports details:', forwardedPorts.map((fp: any) => ({ 
                remotePort: fp.remotePort, 
                localPort: (fp as any).localPort 
              })));
              
              const sshForwarded = forwardedPorts.find((fp: any) => fp.remotePort === sshPort);
              if (sshForwarded && (sshForwarded as any).localPort) {
                extractedLocalPort = (sshForwarded as any).localPort;
                console.log(`Found SSH forwarded port: remote ${sshPort} -> local ${extractedLocalPort}`);
              }
            }
          }
        } catch (pfsError: any) {
          console.log('Could not access port forwarding service:', pfsError.message);
        }
      }
      
      // If we still haven't found the port, try tunnel session forwarding
      if (extractedLocalPort === 2222 && (client as any).tunnelSession) {
        try {
          console.log('Attempting to forward port via tunnel session...');
          const forwarded = await (client as any).tunnelSession.forwardPort({ remotePort: sshPort });
          extractedLocalPort = forwarded.localPort;
          console.log(`Port forwarded via tunnel session: remote ${sshPort} -> local ${extractedLocalPort}`);
        } catch (forwardError: any) {
          console.log('Port forwarding via session failed:', forwardError.message);
        }
      }
    }
    
    console.log(`Final extracted local port for SSH: ${extractedLocalPort}`);

    // ========================================
    // COMPREHENSIVE TUNNEL CONFIGURATION DUMP
    // ========================================
    console.log('');
    console.log('🔍 === COMPREHENSIVE TUNNEL CONFIG DUMP ===');
    
    // 1. Tunnel Client State
    console.log('📊 TUNNEL CLIENT STATE:');
    console.log('- Client type:', client.constructor.name);
    console.log('- Connected:', !!(client as any).isConnected || !!(client as any).connected);
    console.log('- Session available:', !!(client as any).session);
    console.log('- SSH session available:', !!(client as any).sshSession);
    console.log('- Tunnel session available:', !!(client as any).tunnelSession);
    console.log('- Endpoints available:', !!(client as any).endpoints);
    
    // 2. SSH Session Details
    const sshSession = (client as any).sshSession;
    if (sshSession) {
      console.log('');
      console.log('🔐 SSH SESSION STATE:');
      console.log('- SSH session type:', sshSession.constructor.name);
      console.log('- Is authenticated:', !!(sshSession as any).isAuthenticated || !!(sshSession as any).authenticated);
      console.log('- Session ID:', (sshSession as any).sessionId || 'N/A');
      console.log('- Available methods:', Object.getOwnPropertyNames(sshSession).filter(name => typeof (sshSession as any)[name] === 'function'));
      
      // Port forwarding service details
      try {
        const pfs = sshSession.getService ? sshSession.getService('PortForwardingService') : null;
        if (pfs) {
          console.log('');
          console.log('🔌 PORT FORWARDING SERVICE:');
          console.log('- Service type:', pfs.constructor.name);
          console.log('- Listeners available:', !!(pfs as any).listeners);
          console.log('- Local forwarded ports available:', !!(pfs as any).localForwardedPorts);
          
          if ((pfs as any).listeners) {
            const listeners = (pfs as any).listeners;
            console.log('- Active listeners count:', listeners.size || listeners.length || 0);
            console.log('- Listener ports:', Array.from(listeners.keys()));
            
            // Detailed listener info
            for (const [port, listener] of listeners) {
              console.log(`  * Port ${port}:`, {
                type: typeof listener,
                remotePort: (listener as any).remotePort,
                localPort: (listener as any).localPort,
                host: (listener as any).host,
                isListening: (listener as any).listening
              });
            }
          }
          
          if ((pfs as any).localForwardedPorts) {
            const forwardedPorts = (pfs as any).localForwardedPorts;
            console.log('- Forwarded ports count:', forwardedPorts.size || forwardedPorts.length || 0);
            if (forwardedPorts.size > 0) {
              console.log('- Forwarded port details:');
              for (const [key, port] of forwardedPorts) {
                console.log(`  * Key ${key}:`, {
                  localPort: (port as any).localPort,
                  remotePort: (port as any).remotePort,
                  remoteHost: (port as any).remoteHost
                });
              }
            }
          }
        } else {
          console.log('- Port forwarding service: NOT AVAILABLE');
        }
      } catch (pfsError) {
        console.log('- Port forwarding service error:', pfsError);
      }
    }
    
    // 3. Tunnel Session Details (if available)
    const tunnelSession = (client as any).tunnelSession;
    if (tunnelSession) {
      console.log('');
      console.log('🚇 TUNNEL SESSION STATE:');
      console.log('- Tunnel session type:', tunnelSession.constructor.name);
      console.log('- Available methods:', Object.getOwnPropertyNames(tunnelSession).filter(name => typeof (tunnelSession as any)[name] === 'function'));
      console.log('- Local forwarded ports available:', !!(tunnelSession as any).localForwardedPorts);
      console.log('- Forwarded ports available:', !!(tunnelSession as any).forwardedPorts);
    }

    // Get endpoint information for URL construction
    const endpoints = (client as any).endpoints || [];
    console.log('');
    console.log('🌐 ENDPOINT INFORMATION:');
    console.log('- Endpoints count:', endpoints.length);
    endpoints.forEach((endpoint: any, index: number) => {
      console.log(`- Endpoint ${index}:`, {
        portUriFormat: endpoint.portUriFormat,
        portSshCommandFormat: endpoint.portSshCommandFormat,
        tunnelUri: endpoint.tunnelUri,
        hostPublicKeys: endpoint.hostPublicKeys ? 'Available' : 'None'
      });
    });
    
    const endpointInfo = endpoints.length > 0 && endpoints[0].portUriFormat ? {
      portUriFormat: endpoints[0].portUriFormat,
      portSshCommandFormat: endpoints[0].portSshCommandFormat || '',
      tunnelUri: endpoints[0].tunnelUri || ''
    } : null;
    
    // 4. Final tunnel management state
    console.log('');
    console.log('🎯 FINAL TUNNEL STATE SUMMARY:');
    console.log('- Detected SSH local port:', detectedSSHPort);
    console.log('- Extracted local port for SSH:', extractedLocalPort);
    console.log('- SSH forwarding confirmed:', sshForwardingConfirmed);
    console.log('- Endpoint info available:', !!endpointInfo);
    console.log('- Total tunnel ports:', refreshedPorts.length);
    
    console.log('🔍 === END TUNNEL CONFIG DUMP ===');
    console.log('');

    // Update port info with fresh data after connection
    portInfo.allPorts = refreshedPorts as any[];
    portInfo.userPorts = refreshedPorts.filter(port => 
      port.labels && port.labels.includes('UserForwardedPort')
    ) as any[];
    portInfo.managementPorts = refreshedPorts.filter(port => 
      port.labels && port.labels.includes('InternalPort')
    ) as any[];

    return { 
      success: true,
      localPort: extractedLocalPort, 
      client: client,
      tunnelClient: client, // Backwards compatibility
      portInfo: portInfo,
      endpointInfo: endpointInfo,
      tunnelManagementClient: tunnelManagementClient,
      rpcConnection: rpcResult.rpcConnection, // Include RPC connection for SSH key access
      cleanup: () => {
        try {
          if (client && typeof (client as any).disconnect === 'function') {
            (client as any).disconnect();
          }
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      }
    };

  } catch (err) {
    console.error('Failed to forward port over tunnel:', err);
    if (client) {
      client.dispose();
    }
    throw err;
  }
}

export async function getPortInformation(
  tunnelManagementClient: any,
  tunnel: any,
  tunnelProperties: TunnelProperties
): Promise<PortInformation> {
  try {
    const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
      tokenScopes: [TunnelAccessScopes.ManagePorts],
      accessToken: tunnelProperties.managePortsAccessToken,
    });
    
    const portInfo: PortInformation = {
      allPorts: existingPorts,
      userPorts: existingPorts.filter((port: any) => 
        port.labels && port.labels.includes('UserForwardedPort')
      ),
      managementPorts: existingPorts.filter((port: any) => 
        port.labels && port.labels.includes('InternalPort')
      ),
      timestamp: new Date().toISOString()
    };

    return portInfo;
  } catch (error: any) {
    console.error('Failed to get port information:', error);
    return { 
      allPorts: [], 
      userPorts: [], 
      managementPorts: [], 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}