/**
 * Interface definitions for external library types
 * These interfaces define the minimal contracts needed by our codebase
 * without importing the full external library types
 */

/**
 * Interface for RPC connection with codespace
 * Matches the CodespaceRPCInvoker from vscode-dev-containers
 */
export interface RpcConnection {
  getCurrentPrivateKey(): string | null;
  markAsDisconnected(): void;
  close(): Promise<void>;
}

/**
 * Interface for tunnel client
 * Matches the TunnelRelayTunnelClient from dev-tunnels
 * Note: connectedTunnel is private in the real implementation
 */
export interface TunnelClient {
  dispose(): Promise<void>;
}

/**
 * Interface for connected tunnel
 * Matches the Tunnel from dev-tunnels
 */
export interface ConnectedTunnel {
  tunnelId: string;
  clusterId: string;
  domain: string;
  // Add other properties as needed
}

/**
 * Interface for tunnel management client
 * Matches the TunnelManagementHttpClient from dev-tunnels
 */
export interface TunnelManagementClient {
  // Add methods as needed for port management
  // This interface can be expanded based on actual usage
}

// TerminalConnection is already exported from tunnel.ts