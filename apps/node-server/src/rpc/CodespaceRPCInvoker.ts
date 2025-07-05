/**
 * Codespace RPC Invoker
 * Implements the gRPC client to connect to codespace internal services
 * Based on GitHub CLI's internal/codespaces/rpc/invoker.go
 */

import * as grpc from '@grpc/grpc-js';
import * as net from 'net';
import protobuf from 'protobufjs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';

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

// Constants from GitHub CLI
const CODESPACES_INTERNAL_PORT = 16634;
const CONNECTION_TIMEOUT = 5000;

// Protobuf types (loaded dynamically)
let sshProtoRoot: protobuf.Root | null = null;
let codespaceProtoRoot: protobuf.Root | null = null;

// Proto-based interfaces from ssh_server_host_service.v1.proto
interface StartRemoteServerRequest {
  UserPublicKey: string;
}

interface StartRemoteServerResponse {
  Result: boolean;
  ServerPort: string;
  User: string;
  Message: string;
}

// Proto-based interfaces from codespace_host_service.v1.proto
interface NotifyCodespaceOfClientActivityRequest {
  ClientId: string;
  ClientActivities: string[];
}

interface NotifyCodespaceOfClientActivityResponse {
  Result: boolean;
  Message: string;
}

export interface StartSSHServerOptions {
  userPublicKeyFile?: string;
}

export interface SSHServerResult {
  port: number;
  user: string;
  success: boolean;
  message?: string;
}

export interface CodespaceRPCInvoker {
  close(): Promise<void>;
  startSSHServer(): Promise<SSHServerResult>;
  startSSHServerWithOptions(options: StartSSHServerOptions): Promise<SSHServerResult>;
  keepAlive(): void;
  // Connection state management
  markAsDisconnected(): void;
  markAsReconnected(): void;
}

interface InvokerImpl {
  grpcConnection?: grpc.Client;
  tunnelClient: TunnelRelayTunnelClient;
  localListener?: net.Server;
  localPort?: number;
  cancelPF?: () => void;
  keepAliveOverride: boolean;
  heartbeatInterval?: NodeJS.Timeout;
  authToken?: string;
  // Connection management for keep-alive
  isConnected: boolean;
  disconnectTime?: number;
  gracePeriodTimeout?: NodeJS.Timeout;
  isPaused: boolean;
}

/**
 * Creates a new RPC invoker that connects to the codespace internal services
 */
export async function createInvoker(
  tunnelClient: TunnelRelayTunnelClient,
  authToken?: string
): Promise<CodespaceRPCInvoker> {
  const invoker: InvokerImpl = {
    tunnelClient,
    keepAliveOverride: false,
    authToken,
    isConnected: true,
    isPaused: false
  };

  try {
    console.log('🚀 === RPC INVOKER CREATION START ===');
    console.log('Creating RPC invoker for codespace internal services...');
    
    // Load protobuf definitions first
    console.log('📦 Loading protobuf definitions...');
    await loadProtoDefinitions();
    
    // Step 1: Create a local TCP listener for the gRPC connection
    const listener = await createLocalListener();
    invoker.localListener = listener.server;
    invoker.localPort = listener.port;
    
    console.log(`Local gRPC listener created on port ${invoker.localPort}`);
    
    // Step 2: Research what APIs are available on the tunnel client
    console.log('🔍 === TUNNEL CLIENT API RESEARCH ===');
    console.log('Available tunnel client properties:');
    console.log('- tunnelSession available:', !!(tunnelClient as any).tunnelSession);
    console.log('- session available:', !!(tunnelClient as any).session);
    console.log('- sshSession available:', !!(tunnelClient as any).sshSession);
    console.log('- endpoints available:', !!(tunnelClient as any).endpoints);
    console.log('- portForwardingService available:', !!(tunnelClient as any).portForwardingService);
    
    // Try to inspect the tunnel session for port forwarding info
    const tunnelSession = (tunnelClient as any).tunnelSession;
    if (tunnelSession) {
      console.log('🔍 TunnelSession properties:');
      console.log('- getService method:', typeof tunnelSession.getService);
      console.log('- localForwardedPorts:', !!(tunnelSession as any).localForwardedPorts);
      console.log('- forwardedPorts:', !!(tunnelSession as any).forwardedPorts);
      console.log('- portForwardingService:', !!(tunnelSession as any).portForwardingService);
      
      // Try to get the port forwarding service
      try {
        const pfs = tunnelSession.getService('PortForwardingService');
        if (pfs) {
          console.log('✅ Found PortForwardingService');
          console.log('- listeners available:', !!(pfs as any).listeners);
          console.log('- localForwardedPorts available:', !!(pfs as any).localForwardedPorts);
          
          // Try to get actual port mappings
          if ((pfs as any).listeners) {
            const listeners = (pfs as any).listeners;
            console.log('🎯 Active listeners:', Array.from(listeners.keys()));
            
            // Look for our RPC port
            for (const [localPort, remoteInfo] of listeners) {
              console.log(`📍 Local port ${localPort} -> remote info:`, remoteInfo);
              if (remoteInfo && remoteInfo.remotePort === CODESPACES_INTERNAL_PORT) {
                console.log(`🎯 FOUND RPC PORT MAPPING: ${localPort} -> ${CODESPACES_INTERNAL_PORT}`);
                return localPort;
              }
            }
          }
        }
      } catch (serviceError) {
        console.log('❌ Failed to get PortForwardingService:', serviceError);
      }
    }
    
    // Fallback to our detection method
    console.log('🔄 Falling back to port detection method...');
    const rpcForwardedPort = await attemptRPCPortForwarding(tunnelClient);
    
    if (!rpcForwardedPort) {
      throw new Error('Failed to establish RPC port forwarding to codespace internal services');
    }
    
    console.log(`RPC port forwarded to local port: ${rpcForwardedPort}`);
    
    // Step 3: Create gRPC client connection
    const grpcConnection = await createGRPCConnection(`127.0.0.1:${rpcForwardedPort}`);
    invoker.grpcConnection = grpcConnection;
    
    console.log('gRPC connection to codespace internal services established');
    
    // Step 4: Send initial connection heartbeat
    await notifyCodespaceOfClientActivity(invoker, 'connected');
    
    // Step 5: Start heartbeat to keep connection alive
    startHeartbeat(invoker);
    
    return createInvokerInterface(invoker);
    
  } catch (error: any) {
    console.error('Failed to create RPC invoker:', error.message);
    await cleanup(invoker);
    throw error;
  }
}

/**
 * Creates a local TCP listener for gRPC connections
 */
async function createLocalListener(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolve({ server, port: address.port });
      } else {
        reject(new Error('Failed to get local listener port'));
      }
    });
    
    server.on('error', reject);
  });
}

/**
 * Parse tunnel trace messages to extract actual forwarded ports
 */
function setupPortDetectionFromTraces(tunnelClient: TunnelRelayTunnelClient): { getDetectedRPCPort: () => number | null } {
  let detectedRPCPort: number | null = null;
  
  // Override the trace function to capture port forwarding info
  const originalTrace = tunnelClient.trace;
  tunnelClient.trace = (level: any, eventId: any, msg: any, err?: any) => {
    // Call original trace first
    if (originalTrace) {
      originalTrace.call(tunnelClient, level, eventId, msg, err);
    }
    
    // Parse the message for port forwarding information
    if (typeof msg === 'string') {
      // Look for "Forwarding from 127.0.0.1:XXXXX to host port 16634"
      const rpcForwardMatch = msg.match(/Forwarding from 127\.0\.0\.1:(\d+) to host port 16634\./);
      if (rpcForwardMatch) {
        const localPort = parseInt(rpcForwardMatch[1], 10);
        console.log(`🎯 DETECTED: RPC port ${CODESPACES_INTERNAL_PORT} forwarded to local port ${localPort}`);
        detectedRPCPort = localPort;
      }
    }
  };
  
  return {
    getDetectedRPCPort: () => detectedRPCPort
  };
}

/**
 * Attempt to establish RPC port forwarding
 */
async function attemptRPCPortForwarding(tunnelClient: TunnelRelayTunnelClient): Promise<number | null> {
  try {
    console.log('🔍 Setting up port detection from tunnel traces...');
    
    // Set up trace parsing to detect actual forwarded ports
    const portDetector = setupPortDetectionFromTraces(tunnelClient);
    
    console.log(`⏱️  Waiting for RPC port ${CODESPACES_INTERNAL_PORT} forwarding (timeout: 3s)...`);
    
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('RPC port detection timeout')), 3000);
    });
    
    try {
      await Promise.race([
        tunnelClient.waitForForwardedPort(CODESPACES_INTERNAL_PORT),
        timeoutPromise
      ]);
      
      console.log(`✅ RPC port ${CODESPACES_INTERNAL_PORT} forwarding requested`);
      
      // Give the trace parser a moment to detect the actual local port
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const detectedPort = portDetector.getDetectedRPCPort();
      
      if (detectedPort) {
        console.log(`🎯 Using trace-detected RPC port: ${detectedPort}`);
        
        // Test the detected port
        const isConnectable = await testPortConnection('127.0.0.1', detectedPort);
        if (isConnectable) {
          console.log(`✅ Confirmed connection to detected port ${detectedPort}`);
          return detectedPort;
        } else {
          console.log(`❌ Detected port ${detectedPort} not connectable, falling back...`);
        }
      } else {
        console.log('⚠️  No port detected from traces, trying alternatives...');
      }
      
      // Fallback: test common alternative ports
      console.log('🔍 Scanning common RPC forwarding ports...');
      const rpcPorts = [16634, 16635, 16636, 16637, 16638, 16639];
      for (const port of rpcPorts) {
        console.log(`🔌 Testing RPC connectivity on port ${port}...`);
        const isConnectable = await testPortConnection('127.0.0.1', port);
        if (isConnectable) {
          console.log(`✅ Found accessible RPC port: ${port}`);
          return port;
        }
      }
      
    } catch (error: any) {
      console.log(`⏱️  RPC port detection timeout: ${error.message}`);
    }
    
    // TODO: Implement manual port forwarding if not automatically forwarded
    // This would require deeper integration with the tunnel session
    console.log('No existing RPC port forwarding found - would need manual setup');
    return null;
    
  } catch (error: any) {
    console.log(`RPC port forwarding detection failed: ${error.message}`);
    return null;
  }
}

/**
 * Create gRPC client connection
 */
async function createGRPCConnection(target: string): Promise<grpc.Client> {
  return new Promise((resolve, reject) => {
    console.log(`🔌 Creating gRPC client connection to ${target}...`);
    console.log(`⏱️  Connection timeout: ${CONNECTION_TIMEOUT}ms`);
    
    const client = new grpc.Client(target, grpc.credentials.createInsecure());
    
    const deadline = Date.now() + CONNECTION_TIMEOUT;
    client.waitForReady(deadline, (error) => {
      if (error) {
        console.log(`❌ gRPC connection failed: ${error.message}`);
        reject(new Error(`gRPC connection failed: ${error.message}`));
      } else {
        console.log('✅ gRPC client ready');
        resolve(client);
      }
    });
  });
}

/**
 * Create gRPC metadata with authentication token
 */
function createAuthMetadata(authToken?: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  
  if (authToken) {
    // Add authorization header as per GitHub CLI pattern
    metadata.add('authorization', `Bearer ${authToken}`);
    console.log('Added authentication token to gRPC metadata');
  } else {
    console.warn('No authentication token provided for gRPC calls');
  }
  
  return metadata;
}

/**
 * Load protobuf definitions
 */
async function loadProtoDefinitions(): Promise<void> {
  if (sshProtoRoot && codespaceProtoRoot) {
    return; // Already loaded
  }
  
  try {
    // Get the directory of the current module file in ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const protoDir = path.join(__dirname, 'proto');
    
    // Load SSH service proto
    sshProtoRoot = await protobuf.load(path.join(protoDir, 'ssh_server_host_service.proto'));
    console.log('✅ Loaded SSH service proto definitions');
    
    // Load Codespace service proto
    codespaceProtoRoot = await protobuf.load(path.join(protoDir, 'codespace_host_service.proto'));
    console.log('✅ Loaded Codespace service proto definitions');
    
  } catch (error: any) {
    console.error('❌ Failed to load proto definitions:', error.message);
    throw new Error(`Proto loading failed: ${error.message}`);
  }
}

/**
 * Serialize StartRemoteServerRequest using protobuf
 */
function serializeStartRemoteServerRequest(request: StartRemoteServerRequest): Buffer {
  if (!sshProtoRoot) {
    throw new Error('SSH proto definitions not loaded');
  }
  
  const RequestType = sshProtoRoot.lookupType('Codespaces.Grpc.SshServerHostService.v1.StartRemoteServerRequest');
  const message = RequestType.create(request);
  return Buffer.from(RequestType.encode(message).finish());
}

/**
 * Deserialize StartRemoteServerResponse using protobuf
 */
function deserializeStartRemoteServerResponse(buffer: Buffer): StartRemoteServerResponse {
  if (!sshProtoRoot) {
    throw new Error('SSH proto definitions not loaded');
  }
  
  const ResponseType = sshProtoRoot.lookupType('Codespaces.Grpc.SshServerHostService.v1.StartRemoteServerResponse');
  const message = ResponseType.decode(buffer);
  return ResponseType.toObject(message) as StartRemoteServerResponse;
}

/**
 * Serialize NotifyCodespaceOfClientActivityRequest using protobuf
 */
function serializeNotifyCodespaceRequest(request: NotifyCodespaceOfClientActivityRequest): Buffer {
  if (!codespaceProtoRoot) {
    throw new Error('Codespace proto definitions not loaded');
  }
  
  const RequestType = codespaceProtoRoot.lookupType('Codespaces.Grpc.CodespaceHostService.v1.NotifyCodespaceOfClientActivityRequest');
  const message = RequestType.create(request);
  return Buffer.from(RequestType.encode(message).finish());
}

/**
 * Deserialize NotifyCodespaceOfClientActivityResponse using protobuf
 */
function deserializeNotifyCodespaceResponse(buffer: Buffer): NotifyCodespaceOfClientActivityResponse {
  if (!codespaceProtoRoot) {
    throw new Error('Codespace proto definitions not loaded');
  }
  
  const ResponseType = codespaceProtoRoot.lookupType('Codespaces.Grpc.CodespaceHostService.v1.NotifyCodespaceOfClientActivityResponse');
  const message = ResponseType.decode(buffer);
  return ResponseType.toObject(message) as NotifyCodespaceOfClientActivityResponse;
}

/**
 * Call the StartRemoteServerAsync gRPC service
 * Based on Codespaces.Grpc.SshServerHostService.v1.SshServerHost/StartRemoteServerAsync
 */
async function callStartRemoteServerAsync(
  grpcClient: grpc.Client,
  request: StartRemoteServerRequest,
  authToken?: string
): Promise<StartRemoteServerResponse> {
  return new Promise((resolve, reject) => {
    console.log('📞 Calling StartRemoteServerAsync gRPC service...');
    console.log('📝 Request:', { UserPublicKey: request.UserPublicKey ? '[PROVIDED]' : '[MISSING]' });
    
    const metadata = createAuthMetadata(authToken);
    
    // Create the service method call
    // Service: Codespaces.Grpc.SshServerHostService.v1.SshServerHost
    // Method: StartRemoteServerAsync
    const servicePath = '/Codespaces.Grpc.SshServerHostService.v1.SshServerHost/StartRemoteServerAsync';
    
    // Serialize the request using proper protobuf encoding
    const requestBuffer = serializeStartRemoteServerRequest(request);
    
    // Make the unary call
    const call = grpcClient.makeUnaryRequest(
      servicePath,
      (arg: Buffer) => arg, // Request serializer (identity - already serialized)
      (arg: Buffer) => {    // Response deserializer
        try {
          return deserializeStartRemoteServerResponse(arg);
        } catch (error) {
          console.error('Failed to deserialize protobuf response:', error);
          return { Result: false, ServerPort: '', User: '', Message: 'Failed to parse protobuf response' };
        }
      },
      requestBuffer,
      metadata,
      (error: grpc.ServiceError | null, response?: StartRemoteServerResponse) => {
        if (error) {
          console.error('❌ StartRemoteServerAsync failed:', error.message);
          console.error('❌ Error details:', error.details);
          console.error('❌ Error code:', error.code);
          reject(new Error(`gRPC call failed: ${error.message}`));
        } else if (response) {
          console.log('✅ StartRemoteServerAsync succeeded:', response);
          resolve(response);
        } else {
          reject(new Error('No response received from gRPC call'));
        }
      }
    );
    
    // Set a timeout for the call
    const timeoutId = setTimeout(() => {
      call.cancel();
      reject(new Error('gRPC call timeout'));
    }, 10000);
    
    // Clear timeout on completion
    call.on('end', () => clearTimeout(timeoutId));
  });
}

/**
 * Call the NotifyCodespaceOfClientActivity gRPC service
 * Based on Codespaces.Grpc.CodespaceHostService.v1.CodespaceHost/NotifyCodespaceOfClientActivity
 */
async function callNotifyCodespaceOfClientActivity(
  grpcClient: grpc.Client,
  request: NotifyCodespaceOfClientActivityRequest,
  authToken?: string
): Promise<NotifyCodespaceOfClientActivityResponse> {
  return new Promise((resolve) => {
    console.log('📞 Calling NotifyCodespaceOfClientActivity gRPC service...');
    console.log('📝 Request:', { ClientId: request.ClientId, Activities: request.ClientActivities });
    
    const metadata = createAuthMetadata(authToken);
    
    // Create the service method call
    // Service: Codespaces.Grpc.CodespaceHostService.v1.CodespaceHost
    // Method: NotifyCodespaceOfClientActivity
    const servicePath = '/Codespaces.Grpc.CodespaceHostService.v1.CodespaceHost/NotifyCodespaceOfClientActivity';
    
    // Serialize the request using proper protobuf encoding
    const requestBuffer = serializeNotifyCodespaceRequest(request);
    
    // Make the unary call
    grpcClient.makeUnaryRequest(
      servicePath,
      (arg: Buffer) => arg, // Request serializer (identity - already serialized)
      (arg: Buffer) => {    // Response deserializer
        try {
          return deserializeNotifyCodespaceResponse(arg);
        } catch (error) {
          console.error('Failed to deserialize protobuf response:', error);
          return { Result: false, Message: 'Failed to parse protobuf response' };
        }
      },
      requestBuffer,
      metadata,
      (error: grpc.ServiceError | null, response?: NotifyCodespaceOfClientActivityResponse) => {
        if (error) {
          console.error('❌ NotifyCodespaceOfClientActivity failed:', error.message);
          resolve({ Result: false, Message: error.message }); // Don't reject - this is non-critical
        } else if (response) {
          console.log('✅ NotifyCodespaceOfClientActivity succeeded:', response);
          resolve(response);
        } else {
          resolve({ Result: false, Message: 'No response received' });
        }
      }
    );
  });
}

/**
 * Send activity notification to codespace
 */
async function notifyCodespaceOfClientActivity(invoker: InvokerImpl, activity: string): Promise<void> {
  if (!invoker.grpcConnection) {
    console.log('No gRPC connection available for activity notification');
    return;
  }
  
  try {
    const result = await callNotifyCodespaceOfClientActivity(
      invoker.grpcConnection,
      {
        ClientId: 'minimal-terminal-client',
        ClientActivities: [activity]
      },
      invoker.authToken
    );
    
    if (result.Result) {
      console.log(`✅ Activity notification sent: ${activity}`);
    } else {
      console.log(`⚠️  Activity notification failed: ${result.Message}`);
    }
  } catch (error: any) {
    console.error('Failed to send activity notification:', error.message);
    // Don't throw - activity notifications are non-critical
  }
}

/**
 * Start connection-aware heartbeat to keep codespace alive
 */
function startHeartbeat(invoker: InvokerImpl): void {
  // Configurable timeouts via environment variables
  const heartbeatInterval = parseInt(process.env.RPC_HEARTBEAT_INTERVAL || '60000', 10); // Default: 1 minute
  const gracePeriod = parseInt(process.env.RPC_SESSION_KEEPALIVE || '300000', 10); // Default: 5 minutes
  
  console.log(`🫀 Starting RPC heartbeat: ${heartbeatInterval/1000}s interval, ${gracePeriod/1000}s grace period`);
  
  invoker.heartbeatInterval = setInterval(() => {
    // Skip heartbeat if paused or if gRPC connection is unavailable
    if (invoker.isPaused || !invoker.grpcConnection) {
      console.log('⏸️  Heartbeat paused - no active client connection');
      return;
    }
    
    // Skip heartbeat if we're in disconnected state but still within grace period
    if (!invoker.isConnected && invoker.disconnectTime) {
      const timeSinceDisconnect = Date.now() - invoker.disconnectTime;
      if (timeSinceDisconnect < gracePeriod) {
        console.log(`⏳ Client disconnected ${Math.round(timeSinceDisconnect/1000)}s ago - waiting ${Math.round((gracePeriod - timeSinceDisconnect)/1000)}s more before releasing resources`);
        return;
      } else {
        console.log('🕐 Grace period expired - client not reconnected, releasing resources');
        releaseResources(invoker);
        return;
      }
    }
    
    // Only send heartbeat if we have an active connection
    if (invoker.isConnected && invoker.grpcConnection) {
      let reason = '';
      
      if (invoker.keepAliveOverride) {
        reason = 'keepAlive';
      } else {
        reason = 'activity';
      }
      
      notifyCodespaceOfClientActivity(invoker, reason).catch((error) => {
        // If gRPC fails, it likely means the tunnel is down
        if (error.message?.includes('UNAVAILABLE') || error.message?.includes('ECONNREFUSED')) {
          console.log('🔌 gRPC connection lost - marking as disconnected');
          markAsDisconnected(invoker);
        } else {
          console.error('Heartbeat failed:', error);
        }
      });
    }
  }, heartbeatInterval);
}

/**
 * Mark the invoker as disconnected and start grace period
 */
function markAsDisconnected(invoker: InvokerImpl): void {
  const gracePeriod = parseInt(process.env.RPC_SESSION_KEEPALIVE || '300000', 10); // Default: 5 minutes
  
  if (invoker.isConnected) {
    console.log(`📴 Marking RPC connection as disconnected - starting ${gracePeriod/1000}s grace period`);
    invoker.isConnected = false;
    invoker.disconnectTime = Date.now();
    
    // Set up grace period timeout
    if (invoker.gracePeriodTimeout) {
      clearTimeout(invoker.gracePeriodTimeout);
    }
    
    invoker.gracePeriodTimeout = setTimeout(() => {
      console.log('⏰ Grace period expired - auto-releasing RPC resources');
      releaseResources(invoker);
    }, gracePeriod);
  }
}

/**
 * Mark the invoker as reconnected
 */
function markAsReconnected(invoker: InvokerImpl): void {
  if (!invoker.isConnected) {
    console.log('🔄 Client reconnected - canceling resource release');
    invoker.isConnected = true;
    invoker.disconnectTime = undefined;
    
    if (invoker.gracePeriodTimeout) {
      clearTimeout(invoker.gracePeriodTimeout);
      invoker.gracePeriodTimeout = undefined;
    }
  }
}

/**
 * Release RPC resources due to extended disconnection
 */
function releaseResources(invoker: InvokerImpl): void {
  console.log('🗑️  Releasing RPC resources due to extended client disconnection');
  
  // Pause heartbeat to stop futile gRPC calls
  invoker.isPaused = true;
  
  // Close gRPC connection
  if (invoker.grpcConnection) {
    try {
      invoker.grpcConnection.close();
    } catch (error) {
      console.error('Error closing gRPC connection:', error);
    }
    invoker.grpcConnection = undefined;
  }
  
  // The tunnel client and other resources will be cleaned up when the WebSocket fully disconnects
}

/**
 * Clean up resources
 */
async function cleanup(invoker: InvokerImpl): Promise<void> {
  console.log('🧹 Cleaning up RPC invoker resources');
  
  if (invoker.heartbeatInterval) {
    clearInterval(invoker.heartbeatInterval);
    invoker.heartbeatInterval = undefined;
  }
  
  if (invoker.gracePeriodTimeout) {
    clearTimeout(invoker.gracePeriodTimeout);
    invoker.gracePeriodTimeout = undefined;
  }
  
  if (invoker.cancelPF) {
    invoker.cancelPF();
  }
  
  if (invoker.grpcConnection) {
    invoker.grpcConnection.close();
    invoker.grpcConnection = undefined;
  }
  
  if (invoker.localListener) {
    return new Promise((resolve) => {
      invoker.localListener!.close(() => resolve());
    });
  }
}

/**
 * Test basic gRPC connection
 */
async function testGRPCConnection(client: grpc.Client): Promise<{ success: boolean; error?: string }> {
  try {
    // Try to get the client state
    const state = client.getChannel().getConnectivityState(false);
    console.log(`🔍 gRPC channel state: ${state}`);
    
    if (state === grpc.connectivityState.READY || state === grpc.connectivityState.CONNECTING) {
      return { success: true };
    } else {
      return { success: false, error: `Channel state: ${state}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Attempt to discover available gRPC services
 * Currently unused but kept for future service discovery needs
 */
// @ts-ignore - Function kept for future service discovery implementation
function discoverGRPCServices(_client: grpc.Client): Promise<string[]> {
  // This is a basic approach - in practice, we'd need reflection or service definitions
  console.log('🔍 gRPC service discovery not yet implemented');
  return Promise.resolve(['Services would be listed here with proper reflection']);
}

/**
 * Create the public invoker interface
 */
function createInvokerInterface(invoker: InvokerImpl): CodespaceRPCInvoker {
  return {
    async close(): Promise<void> {
      await cleanup(invoker);
    },
    
    async startSSHServer(): Promise<SSHServerResult> {
      return this.startSSHServerWithOptions({});
    },
    
    async startSSHServerWithOptions(options: StartSSHServerOptions): Promise<SSHServerResult> {
      console.log('🚀 Starting SSH server with options:', options);
      
      if (!invoker.grpcConnection) {
        return {
          port: 0,
          user: '',
          success: false,
          message: 'No gRPC connection available'
        };
      }
      
      try {
        console.log('🧪 Testing gRPC connection with basic call...');
        
        // Test if we can make ANY gRPC call to the service
        // This will help us determine if the service is actually listening
        const testResult = await testGRPCConnection(invoker.grpcConnection);
        console.log(`🧪 gRPC connection test result:`, testResult);
        
        if (!testResult.success) {
          return {
            port: 0,
            user: '',
            success: false,
            message: `gRPC service not responding: ${testResult.error}`
          };
        }
        
        console.log('✅ gRPC service is responding, proceeding with SSH server start...');
        
        // Read public key from file, environment, or use default
        let userPublicKey = '';
        
        // Priority 1: File specified in options
        if (options.userPublicKeyFile) {
          try {
            const fs = require('fs');
            userPublicKey = fs.readFileSync(options.userPublicKeyFile, 'utf8').trim();
            console.log(`📄 Loaded public key from file: ${options.userPublicKeyFile}`);
          } catch (keyError) {
            console.warn(`⚠️  Failed to read public key file ${options.userPublicKeyFile}:`, keyError);
          }
        }
        
        // Priority 2: Environment variable
        if (!userPublicKey && process.env.USER_PUBLIC_KEY) {
          userPublicKey = process.env.USER_PUBLIC_KEY.trim();
          console.log(`📄 Loaded public key from environment variable USER_PUBLIC_KEY`);
        }
        
        // Priority 3: Default test key (for development)
        if (!userPublicKey) {
          userPublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIZmZOeNBRAGwTI/+6ZgjBRAUiuDD4AemmILkQKP9tJc';
          console.log(`📄 Using default test public key`);
        }
        
        console.log(`🔑 Final public key: ${userPublicKey.substring(0, 50)}...`);
        
        // Implement the real SSH server start call using proto definitions
        console.log('🚀 Making actual StartRemoteServerAsync gRPC call...');
        
        const startResult = await callStartRemoteServerAsync(invoker.grpcConnection, {
          UserPublicKey: userPublicKey
        }, invoker.authToken);
        
        console.log('📋 SSH server start result:', startResult);
        console.log(`🔑 Auth token available: ${!!invoker.authToken}`);
        console.log(`📄 Public key provided: ${!!userPublicKey}`);
        
        if (startResult.Result) {
          const serverPort = parseInt(startResult.ServerPort, 10);
          console.log(`✅ SSH server started successfully on port ${serverPort}, user: ${startResult.User}`);
          
          return {
            port: serverPort,
            user: startResult.User,
            success: true,
            message: startResult.Message
          };
        } else {
          console.log(`❌ SSH server start failed: ${startResult.Message}`);
          
          return {
            port: 0,
            user: '',
            success: false,
            message: `SSH server start failed: ${startResult.Message}`
          };
        }
        
      } catch (error: any) {
        console.error('❌ SSH server start failed:', error.message);
        return {
          port: 0,
          user: '',
          success: false,
          message: `SSH server start failed: ${error.message}`
        };
      }
    },
    
    keepAlive(): void {
      invoker.keepAliveOverride = true;
      console.log('Keep-alive override enabled');
    },
    
    markAsDisconnected(): void {
      markAsDisconnected(invoker);
    },
    
    markAsReconnected(): void {
      markAsReconnected(invoker);
    }
  };
}