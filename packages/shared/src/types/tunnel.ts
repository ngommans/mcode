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

export interface TunnelPort {
  clusterId: string;
  tunnelId: string;
  portNumber: number;
  labels?: string[];
  protocol: string;
  accessControl?: {
    entries: Array<{
      type: string;
      provider: string;
      isInherited: boolean;
      isDeny: boolean;
      subjects: string[];
      scopes: string[];
    }>;
  };
  options?: {
    isGloballyAvailable: boolean;
  };
  status?: Record<string, any>;
  portForwardingUris?: string[];
  inspectionUri?: string;
}

export interface PortInfo {
  userPorts: any[]; // Allow flexible port types
  managementPorts: any[];
  allPorts: any[];
  timestamp?: string;
  error?: string; // Add error field for compatibility
}

// Alias for backwards compatibility
export interface PortInformation extends PortInfo {}

export interface TunnelConnectionResult {
  success: boolean;
  localPort?: number;
  sshPort?: number;
  client?: any; // TunnelRelayTunnelClient - avoid importing external types
  tunnelClient?: any; // Backwards compatibility
  portInfo: PortInfo;
  endpointInfo?: EndpointInfo | null;
  tunnelManagementClient?: any; // TunnelManagementHttpClient
  rpcConnection?: any; // CodespaceRPCInvoker
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