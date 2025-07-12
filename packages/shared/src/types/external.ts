/**
 * External library type imports and extensions
 * We import actual Microsoft types since we create and manage these objects
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

// Re-export Microsoft tunnel client as-is
export type { TunnelRelayTunnelClient as TunnelClient } from '@microsoft/dev-tunnels-connections';

// Re-export Microsoft types for convenience
export type { Tunnel as ConnectedTunnel } from '@microsoft/dev-tunnels-contracts';
export type { TunnelPort as TunnelPortContract } from '@microsoft/dev-tunnels-contracts';

// Re-export Microsoft tunnel management client
export type { TunnelManagementHttpClient as TunnelManagementClient } from '@microsoft/dev-tunnels-management';

// TunnelConnection is defined in server package