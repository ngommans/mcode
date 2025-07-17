/**
 * Codespace RPC Invoker
 * Implements the gRPC client to connect to codespace internal services
 * Based on GitHub CLI's internal/codespaces/rpc/invoker.go
 */

import * as grpc from '@grpc/grpc-js';
import * as net from 'net';
import protobuf from 'protobufjs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { TraceLevel } from '@microsoft/dev-tunnels-ssh';
import { sshKeyManager, type SSHKeyPair } from '../services/SSHKeyManager.js';
import { logger } from '../utils/logger';   

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
  sessionId: string;
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
  // SSH key management
  getCurrentPrivateKey(): string | null;
}

interface InvokerImpl {
  grpcConnection?: grpc.Client;
  tunnelClient: TunnelRelayTunnelClient;
  localListener?: net.Server;
  localPort?: number;
  cancelPF?: () => void;
  keepAliveOverride: boolean;
  heartbeatInterval?: ReturnType<typeof setTimeout>;
  authToken?: string;
  // Connection management for keep-alive
  isConnected: boolean;
  disconnectTime?: number;
  gracePeriodTimeout?: ReturnType<typeof setTimeout>;
  isPaused: boolean;
  // SSH key management
  currentKeyPair?: SSHKeyPair;
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
    logger.info('🚀 === RPC INVOKER CREATION START ===');
    logger.info('Creating RPC invoker for codespace internal services...');
    
    // Load protobuf definitions first
    logger.info('📦 Loading protobuf definitions...');
    await loadProtoDefinitions();
    
    // Step 1: Create a local TCP listener for the gRPC connection
    const listener = await createLocalListener();
    invoker.localListener = listener.server;
    invoker.localPort = listener.port;
    
    logger.info(`Local gRPC listener created on port ${invoker.localPort}`);
    
    // Fallback to our detection method
    logger.info('🔄 Falling back to port detection method...');
    const rpcForwardedPort = await attemptRPCPortForwarding(tunnelClient);
    
    if (!rpcForwardedPort) {
      throw new Error('Failed to establish RPC port forwarding to codespace internal services');
    }
    
    logger.info(`RPC port forwarded to local port: ${rpcForwardedPort}`);
    
    // Step 3: Create gRPC client connection
    const grpcConnection = await createGRPCConnection(`127.0.0.1:${rpcForwardedPort}`);
    invoker.grpcConnection = grpcConnection;
    
    logger.info('gRPC connection to codespace internal services established');
    
    // Step 4: Send initial connection heartbeat
    await notifyCodespaceOfClientActivity(invoker, 'connected');
    
    // Step 5: Start heartbeat to keep connection alive
    startHeartbeat(invoker);
    
    return createInvokerInterface(invoker);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create RPC invoker:', new Error(errorMessage));
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
  tunnelClient.trace = (level: TraceLevel, eventId: number, msg: string, err?: Error) => {
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
        logger.info(`🎯 DETECTED: RPC port ${CODESPACES_INTERNAL_PORT} forwarded to local port ${localPort}`);
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
    logger.info('🔍 Setting up port detection from tunnel traces...');
    
    // Set up trace parsing to detect actual forwarded ports
    const portDetector = setupPortDetectionFromTraces(tunnelClient);
    
    logger.info(`⏱️  Waiting for RPC port ${CODESPACES_INTERNAL_PORT} forwarding (timeout: 3s)...`);
    
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('RPC port detection timeout')), 3000);
    });
    
    try {
      await Promise.race([
        tunnelClient.waitForForwardedPort(CODESPACES_INTERNAL_PORT),
        timeoutPromise
      ]);
      
      logger.info(`✅ RPC port ${CODESPACES_INTERNAL_PORT} forwarding requested`);
      
      // Give the trace parser a moment to detect the actual local port
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const detectedPort = portDetector.getDetectedRPCPort();
      
      if (detectedPort) {
        logger.info(`🎯 Using trace-detected RPC port: ${detectedPort}`);
        
        // Test the detected port
        const isConnectable = await testPortConnection('127.0.0.1', detectedPort);
        if (isConnectable) {
          logger.info(`✅ Confirmed connection to detected port ${detectedPort}`);
          return detectedPort;
        } else {
          logger.warn(`❌ Detected port ${detectedPort} not connectable, falling back...`);
        }
      } else {
        logger.warn('⚠️  No port detected from traces, trying alternatives...');
      }
      
      // Fallback: test common alternative ports
      logger.info('🔍 Scanning common RPC forwarding ports...');
      const rpcPorts = [16634, 16635, 16636, 16637, 16638, 16639];
      for (const port of rpcPorts) {
        logger.debug(`🔌 Testing RPC connectivity on port ${port}...`);
        const isConnectable = await testPortConnection('127.0.0.1', port);
        if (isConnectable) {
          logger.info(`✅ Found accessible RPC port: ${port}`);
          return port;
        }
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`⏱️  RPC port detection timeout: ${errorMessage}`);
    }
    
    // TODO: Implement manual port forwarding if not automatically forwarded
    // This would require deeper integration with the tunnel session
    logger.warn('No existing RPC port forwarding found - would need manual setup');
    return null;
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`RPC port forwarding detection failed:`, new Error(errorMessage));
    return null;
  }
}

/**
 * Create gRPC client connection
 */
async function createGRPCConnection(target: string): Promise<grpc.Client> {
  return new Promise((resolve, reject) => {
    logger.info(`🔌 Creating gRPC client connection to ${target}...`);
    logger.info(`⏱️  Connection timeout: ${CONNECTION_TIMEOUT}ms`);
    
    const client = new grpc.Client(target, grpc.credentials.createInsecure());
    
    const deadline = Date.now() + CONNECTION_TIMEOUT;
    client.waitForReady(deadline, (error) => {
      if (error) {
        logger.error(`❌ gRPC connection failed:`, error);
        reject(new Error(`gRPC connection failed: ${error.message}`));
      } else {
        logger.info('✅ gRPC client ready');
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
    logger.info('Added authentication token to gRPC metadata');
  } else {
    logger.warn('No authentication token provided for gRPC calls');
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
    logger.info('✅ Loaded SSH service proto definitions');
    
    // Load Codespace service proto
    codespaceProtoRoot = await protobuf.load(path.join(protoDir, 'codespace_host_service.proto'));
    logger.info('✅ Loaded Codespace service proto definitions');
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ Failed to load proto definitions:', { error: errorMessage });
    throw new Error(`Proto loading failed: ${errorMessage}`);
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
    logger.info('📞 Calling StartRemoteServerAsync gRPC service...');
    logger.info('📝 Request:', { UserPublicKey: request.UserPublicKey ? '[PROVIDED]' : '[MISSING]' });
    
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to deserialize protobuf response:', { error: errorMessage });
          return { Result: false, ServerPort: '', User: '', Message: 'Failed to parse protobuf response' };
        }
      },
      requestBuffer,
      metadata,
      (error: grpc.ServiceError | null, response?: StartRemoteServerResponse) => {
        if (error) {
          logger.error('❌ StartRemoteServerAsync failed:', { error: error.message });
          logger.error('❌ Error details:', { details: error.details });
          logger.error('❌ Error code:', { code: error.code });
          reject(new Error(`gRPC call failed: ${error.message}`));
        } else if (response) {
          logger.info('✅ StartRemoteServerAsync succeeded:', { response });
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
    logger.info('📞 Calling NotifyCodespaceOfClientActivity gRPC service...');
    logger.info('📝 Request:', { ClientId: request.ClientId, Activities: request.ClientActivities });
    
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to deserialize protobuf response:', { error: errorMessage });
          return { Result: false, Message: 'Failed to parse protobuf response' };
        }
      },
      requestBuffer,
      metadata,
      (error: grpc.ServiceError | null, response?: NotifyCodespaceOfClientActivityResponse) => {
        if (error) {
          logger.error('❌ NotifyCodespaceOfClientActivity failed:', { error: error.message });
          resolve({ Result: false, Message: error.message }); // Don't reject - this is non-critical
        } else if (response) {
          logger.info('✅ NotifyCodespaceOfClientActivity succeeded:', { response });
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
    logger.warn('No gRPC connection available for activity notification');
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
      logger.info(`✅ Activity notification sent: ${activity}`);
    } else {
      logger.warn(`⚠️  Activity notification failed: ${result.Message}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to send activity notification:', { error: errorMessage });
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
  
  logger.info(`🫀 Starting RPC heartbeat: ${heartbeatInterval/1000}s interval, ${gracePeriod/1000}s grace period`);
  
  invoker.heartbeatInterval = setInterval(() => {
    // Skip heartbeat if paused or if gRPC connection is unavailable
    if (invoker.isPaused || !invoker.grpcConnection) {
      logger.debug('⏸️  Heartbeat paused - no active client connection');
      return;
    }
    
    // Skip heartbeat if we're in disconnected state but still within grace period
    if (!invoker.isConnected && invoker.disconnectTime) {
      const timeSinceDisconnect = Date.now() - invoker.disconnectTime;
      if (timeSinceDisconnect < gracePeriod) {
        logger.debug(`⏳ Client disconnected ${Math.round(timeSinceDisconnect/1000)}s ago - waiting ${Math.round((gracePeriod - timeSinceDisconnect)/1000)}s more before releasing resources`);
        return;
      } else {
        logger.warn('🕐 Grace period expired - client not reconnected, releasing resources');
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
      
      notifyCodespaceOfClientActivity(invoker, reason).catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // If gRPC fails, it likely means the tunnel is down
        if (errorMessage.includes('UNAVAILABLE') || errorMessage.includes('ECONNREFUSED')) {
          logger.warn('🔌 gRPC connection lost - marking as disconnected');
          markAsDisconnected(invoker);
        } else {
          logger.error('Heartbeat failed:', { error: errorMessage });
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
    logger.warn(`📴 Marking RPC connection as disconnected - starting ${gracePeriod/1000}s grace period`);
    invoker.isConnected = false;
    invoker.disconnectTime = Date.now();
    
    // Set up grace period timeout
    if (invoker.gracePeriodTimeout) {
      clearTimeout(invoker.gracePeriodTimeout);
    }
    
    invoker.gracePeriodTimeout = setTimeout(() => {
      logger.warn('⏰ Grace period expired - auto-releasing RPC resources');
      releaseResources(invoker);
    }, gracePeriod);
  }
}

/**
 * Mark the invoker as reconnected
 */
function markAsReconnected(invoker: InvokerImpl): void {
  if (!invoker.isConnected) {
    logger.info('🔄 Client reconnected - canceling resource release');
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
  logger.warn('🗑️  Releasing RPC resources due to extended client disconnection');
  
  // Pause heartbeat to stop futile gRPC calls
  invoker.isPaused = true;
  
  // Close gRPC connection
  if (invoker.grpcConnection) {
    try {
      invoker.grpcConnection.close();
    } catch (error) {
      logger.error('Error closing gRPC connection:', { error });
    }
    invoker.grpcConnection = undefined;
  }
  
  // The tunnel client and other resources will be cleaned up when the WebSocket fully disconnects
}

/**
 * Clean up resources
 */
async function cleanup(invoker: InvokerImpl): Promise<void> {
  logger.info('🧹 Cleaning up RPC invoker resources');
  
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
  
  // Clean up SSH keys if they exist
  if (invoker.currentKeyPair) {
    sshKeyManager.destroySessionKeys(invoker.currentKeyPair.sessionId);
    invoker.currentKeyPair = undefined;
  }
  
  if (invoker.localListener) {
    return new Promise((resolve) => {
      if (invoker.localListener) {
        invoker.localListener.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

/**
 * Test basic gRPC connection
 */
function testGRPCConnection(client: grpc.Client): { success: boolean; error?: string } {
  try {
    // Try to get the client state
    const state = client.getChannel().getConnectivityState(false);
    logger.debug(`🔍 gRPC channel state: ${state}`);
    
    if (state === grpc.connectivityState.READY || state === grpc.connectivityState.CONNECTING) {
      return { success: true };
    } else {
      return { success: false, error: `Channel state: ${state}` };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Attempt to discover available gRPC services
 * Currently unused but kept for future service discovery needs
 */
// @ts-expect-error - Function kept for future service discovery implementation
function _discoverGRPCServices(_client: grpc.Client): Promise<string[]> {
  // This is a basic approach - in practice, we'd need reflection or service definitions
  logger.warn('🔍 gRPC service discovery not yet implemented');
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
      const randomSuffix = crypto.randomBytes(6).toString('base64url'); // Generate a secure random string
      const sessionId = `ssh-${Date.now()}-${randomSuffix}`;
      return this.startSSHServerWithOptions({ sessionId });
    },
    
    async startSSHServerWithOptions(options: StartSSHServerOptions): Promise<SSHServerResult> {
      logger.info('🚀 Starting SSH server with options:', { options });
      
      if (!invoker.grpcConnection) {
        return {
          port: 0,
          user: '',
          success: false,
          message: 'No gRPC connection available'
        };
      }
      
      try {
        logger.info('🧪 Testing gRPC connection with basic call...');
        
        // Test if we can make ANY gRPC call to the service
        // This will help us determine if the service is actually listening
        const testResult = testGRPCConnection(invoker.grpcConnection);
        logger.info(`🧪 gRPC connection test result:`, { testResult });
        
        if (!testResult.success) {
          return {
            port: 0,
            user: '',
            success: false,
            message: `gRPC service not responding: ${testResult.error}`
          };
        }
        
        logger.info('✅ gRPC service is responding, proceeding with SSH server start...');
        
        // Generate ephemeral SSH key pair for this session
        logger.info(`🔑 Generating ephemeral SSH key pair for session: ${options.sessionId}`);
        const keyPair = sshKeyManager.generateSessionKeys(options.sessionId);
        
        // Store the key pair for later use in SSH connection
        invoker.currentKeyPair = keyPair;
        
        logger.info(`🔑 Generated SSH key pair with fingerprint: ${keyPair.fingerprint}`);
        logger.debug(`🔑 Public key: ${keyPair.publicKey.substring(0, 50)}...`);
        
        // Implement the real SSH server start call using proto definitions
        logger.info('🚀 Making actual StartRemoteServerAsync gRPC call...');
        
        const startResult = await callStartRemoteServerAsync(invoker.grpcConnection, {
          UserPublicKey: keyPair.publicKey
        }, invoker.authToken);
        
        logger.info('📋 SSH server start result:', { startResult });
        logger.debug(`🔑 Auth token available: ${!!invoker.authToken}`);
        logger.debug(`📄 Public key provided: ${!!keyPair.publicKey}`);
        
        if (startResult.Result) {
          const serverPort = parseInt(startResult.ServerPort, 10);
          logger.info(`✅ SSH server started successfully on port ${serverPort}, user: ${startResult.User}`);
          
          return {
            port: serverPort,
            user: startResult.User,
            success: true,
            message: startResult.Message
          };
        } else {
          logger.error(`❌ SSH server start failed: ${startResult.Message}`);
          
          return {
            port: 0,
            user: '',
            success: false,
            message: `SSH server start failed: ${startResult.Message}`
          };
        }
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('❌ SSH server start failed:', { error: errorMessage });
        return {
          port: 0,
          user: '',
          success: false,
          message: `SSH server start failed: ${errorMessage}`
        };
      }
    },
    
    keepAlive(): void {
      invoker.keepAliveOverride = true;
      logger.info('Keep-alive override enabled');
    },
    
    markAsDisconnected(): void {
      markAsDisconnected(invoker);
    },
    
    markAsReconnected(): void {
      markAsReconnected(invoker);
    },

    getCurrentPrivateKey(): string | null {
      return invoker.currentKeyPair?.privateKey || null;
    }
  };
}