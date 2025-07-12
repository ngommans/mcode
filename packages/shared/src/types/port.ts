/**
 * Unified port type hierarchy - eliminates manual conversion and casting
 * Follows layered extension rather than duplication approach
 */

// Base port interface - core functionality shared by all port types
export interface BasePort {
  portNumber: number;
  protocol: string;
}

// Shared access control configuration
export interface AccessControlConfig {
  entries: Array<{
    type: string;
    provider: string;
    isInherited: boolean;
    isDeny: boolean;
    subjects: string[];
    scopes: string[];
  }>;
}

// Tunnel-specific extensions - internal server representation
export interface TunnelPort extends BasePort {
  clusterId: string;
  tunnelId: string;
  labels?: string[];
  accessControl?: AccessControlConfig;
  options?: {
    isGloballyAvailable: boolean;
  };
  status?: Record<string, unknown>;
  portForwardingUris?: string[];
  inspectionUri?: string;
}

// WebSocket-optimized view - extends rather than duplicates
export interface ForwardedPort extends BasePort {
  urls: string[];
  accessControl?: AccessControlConfig; // Shared type
  isUserPort: boolean;
}

// Type-safe conversion utilities - eliminate manual mapping
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Justified: shared utility functions for type conversions
export class PortConverter {
  /**
   * Convert TunnelPort to ForwardedPort with type safety
   */
  static tunnelToForwarded(port: TunnelPort, isUserPort: boolean): ForwardedPort {
    return {
      portNumber: port.portNumber,
      protocol: port.protocol,
      urls: port.portForwardingUris || [],
      accessControl: port.accessControl,
      isUserPort
    };
  }

  /**
   * Convert multiple TunnelPorts to ForwardedPorts
   */
  static tunnelArrayToForwarded(ports: TunnelPort[], userPorts: TunnelPort[]): ForwardedPort[] {
    return ports.map(port => 
      this.tunnelToForwarded(
        port, 
        userPorts.some(up => up.portNumber === port.portNumber)
      )
    );
  }

  /**
   * Create WebSocket port information from tunnel port information
   */
  static createWebSocketPortInfo(portInfo: {
    userPorts: TunnelPort[];
    managementPorts: TunnelPort[];
    allPorts: TunnelPort[];
    timestamp?: string;
    error?: string;
  }): WebSocketPortInformation {
    return {
      userPorts: portInfo.userPorts.map(port => this.tunnelToForwarded(port, true)),
      managementPorts: portInfo.managementPorts.map(port => this.tunnelToForwarded(port, false)),
      allPorts: this.tunnelArrayToForwarded(portInfo.allPorts, portInfo.userPorts),
      timestamp: portInfo.timestamp,
      error: portInfo.error
    };
  }

  /**
   * Filter ports by criteria - common operation
   */
  static filterUserPorts(ports?: TunnelPort[] | null): TunnelPort[] {
    if (!ports) return [];
    
    return ports.filter(port => 
      port && port.portNumber && (port.labels?.includes('UserForwardedPort')
      || (!port.labels?.includes('InternalPort') && port.portNumber !== 22))
    );
  }

  /**
   * Filter management/system ports
   */
  static filterManagementPorts(ports?: TunnelPort[] | null): TunnelPort[] {
    if (!ports) return [];
    
    return ports.filter(port => 
      port && port.portNumber 
      && (port.labels?.includes('InternalPort') || port.portNumber !== 22)
    );
  }
}

// Container for all port information, using consistent types
export interface WebSocketPortInformation {
  userPorts: ForwardedPort[];
  managementPorts: ForwardedPort[];
  allPorts: ForwardedPort[];
  timestamp?: string;
  error?: string;
}

// Port information using TunnelPort internally - server-side
export interface PortInformation {
  userPorts: TunnelPort[];
  managementPorts: TunnelPort[];
  allPorts: TunnelPort[];
  timestamp?: string;
  error?: string;
}

// Backwards compatibility alias
export interface PortInfo extends PortInformation {}