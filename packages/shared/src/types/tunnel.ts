/**
 * Tunnel-related types for codespace connections
 */

export interface TunnelProperties {
  tunnelId: string;
  clusterId: string;
  domain: string;
  connectAccessToken: string;
  managePortsAccessToken: string;
  serviceUri: string;
}

export interface TunnelEndpoint {
  hostRelayUri: string;
  clientRelayUri: string;
  id: string;
  connectionMode: string;
  hostId: string;
  hostPublicKeys: string[];
  portUriFormat: string;
  tunnelUri: string;
  portSshCommandFormat: string;
  tunnelSshCommand: string;
}

export interface EndpointInfo {
  portUriFormat: string;
  portSshCommandFormat: string;
  tunnelUri: string;
}

// Port types moved to ./port.ts for unified hierarchy
// Re-export for backwards compatibility
export type { TunnelPort, PortInformation, PortInfo } from './port.js';
import type { PortInformation, PortInfo } from './port.js';
import type { TunnelClient, TunnelManagementClient, RpcConnection } from './external.js';

export interface TunnelConnection {
  /**
   * Get current port information from the connected tunnel
   */
  getPortInformation(): Promise<PortInformation>;

  /**
   * Refresh port information by fetching latest tunnel state
   */
  refreshPortInformation(): Promise<PortInformation>;

  /**
   * Close the tunnel connection and cleanup resources
   */
  close(): Promise<void>;

  /**
   * Check if tunnel connection is active
   */
  isConnected(): boolean;
}

export interface TunnelConnectionResult {
  success: boolean;
  localPort?: number;
  sshPort?: number;
  client?: TunnelClient; // TunnelRelayTunnelClient
  tunnelConnection?: TunnelConnection;
  portInfo: PortInfo;
  endpointInfo?: EndpointInfo | null;
  tunnelManagementClient?: TunnelManagementClient;
  rpcConnection?: RpcConnection;
  error?: string;
  cleanup: () => void;
}

export interface SSHConfig {
  hostname: string;
  user: string;
  identityFile: string;
  proxyCommand: string;
}

export interface TerminalConnection {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
}