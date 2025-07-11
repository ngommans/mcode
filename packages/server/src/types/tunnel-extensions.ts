/**
 * Extended type definitions for Microsoft dev-tunnels library
 * These interfaces define the actual runtime behavior we depend on
 * but aren't exposed in the official library types
 */

import type { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import type { TunnelEndpoint } from '@microsoft/dev-tunnels-contracts';

/**
 * Port forwarding service interface
 * Represents the internal PortForwardingService from SSH session
 */
export interface TunnelPortForwardingService {
  listeners: Map<number, PortListener>;
  localForwardedPorts: Map<string, ForwardedPortInfo>;
  forwardPort(options: { remotePort: number }): Promise<{ localPort: number }>;
}

/**
 * Port listener interface
 * Represents active port forwarding listeners
 */
export interface PortListener {
  remotePort: number;
  localPort: number;
  host: string;
  listening: boolean;
}

/**
 * Forwarded port information
 */
export interface ForwardedPortInfo {
  localPort: number;
  remotePort: number;
  remoteHost: string;
}

/**
 * SSH session interface
 * Represents the SSH session with service discovery capabilities
 */
export interface TunnelSshSession {
  getService(serviceName: 'PortForwardingService'): TunnelPortForwardingService | null;
  getService(serviceName: string): unknown;
  isAuthenticated?: boolean;
  authenticated?: boolean;
  sessionId?: string;
}

/**
 * Tunnel session interface
 * Represents the tunnel session with port forwarding capabilities
 */
export interface TunnelSession {
  forwardPort(options: { remotePort: number }): Promise<{ localPort: number }>;
  localForwardedPorts?: Map<string, ForwardedPortInfo>;
  forwardedPorts?: Map<string, ForwardedPortInfo>;
}

/**
 * Extended tunnel client interface
 * Includes undocumented but runtime-available properties and methods
 * Note: Uses intersection type to avoid method signature conflicts
 */
export interface TunnelClientExtended {
  // SSH session for service discovery
  sshSession?: TunnelSshSession;
  
  // Tunnel session for direct port forwarding
  tunnelSession?: TunnelSession;
  
  // Endpoint information
  endpoints?: TunnelEndpoint[];
  
  // Port refresh methods (GitHub CLI uses these)
  refreshPorts?(): Promise<void>;
  RefreshPorts?(): Promise<void>;
  refresh?(): Promise<void>;
  
  // Connection state
  isConnected?: boolean;
  connected?: boolean;
  
  // Session reference
  session?: unknown;
}

/**
 * Combined tunnel client type with all TunnelRelayTunnelClient methods
 * plus extended runtime properties
 */
export type ExtendedTunnelClient = TunnelRelayTunnelClient & TunnelClientExtended;

/**
 * Trace function signature used by tunnel clients
 */
export type TraceLevel = number | string;
export type TraceEventId = number | string;
export type TraceMessage = string | unknown;

export interface TraceFunction {
  (level: TraceLevel, eventId: TraceEventId, message: TraceMessage, error?: Error): void;
}

/**
 * Type-safe wrapper for tunnel client operations
 * Provides checked access to extended tunnel client functionality
 */
export class TunnelClientWrapper {
  constructor(private client: TunnelRelayTunnelClient) {}

  /**
   * Get the extended client with runtime properties
   */
  private get extendedClient(): TunnelClientExtended {
    return this.client as TunnelClientExtended;
  }

  /**
   * Safely get the port forwarding service
   */
  async getPortForwardingService(): Promise<TunnelPortForwardingService | null> {
    try {
      const sshSession = this.extendedClient.sshSession;
      return sshSession?.getService('PortForwardingService') ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Safely refresh ports using available methods
   */
  async refreshPorts(): Promise<boolean> {
    try {
      const client = this.extendedClient;
      if (client.refreshPorts) {
        await client.refreshPorts();
        return true;
      } else if (client.RefreshPorts) {
        await client.RefreshPorts();
        return true;
      } else if (client.refresh) {
        await client.refresh();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get tunnel endpoints safely
   */
  getEndpoints(): TunnelEndpoint[] {
    return this.extendedClient.endpoints ?? [];
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    const client = this.extendedClient;
    return client.isConnected ?? client.connected ?? false;
  }

  /**
   * Get tunnel session for port forwarding
   */
  getTunnelSession(): TunnelSession | null {
    return this.extendedClient.tunnelSession ?? null;
  }
}

/**
 * Type guard to check if an object has port forwarding service properties
 */
export function isPortForwardingService(obj: unknown): obj is TunnelPortForwardingService {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'listeners' in obj &&
    'localForwardedPorts' in obj
  );
}

/**
 * Type guard to check if an object is a port listener
 */
export function isPortListener(obj: unknown): obj is PortListener {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'remotePort' in obj &&
    'localPort' in obj &&
    typeof (obj as PortListener).remotePort === 'number' &&
    typeof (obj as PortListener).localPort === 'number'
  );
}