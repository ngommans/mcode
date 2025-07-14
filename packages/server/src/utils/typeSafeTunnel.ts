/**
 * Type-safe utilities for handling tunnel-related external data
 * Centralizes unsafe operations with proper validation for Microsoft tunnel libraries
 */

/**
 * Type-safe interface for tunnel forwarded port information
 */
export interface TunnelForwardedPortInfo {
  remotePort?: number;
  port?: number;
  protocol?: string;
  [key: string]: unknown;
}

/**
 * Valid source types for port mappings
 */
export type PortMappingSource = 'listeners' | 'waitForForwarded' | 'tunnelQuery' | 'trace_fallback';

/**
 * Port mapping interface (matches the one in PortForwardingManager)
 */
export interface PortMapping {
  localPort: number;
  remotePort: number;
  protocol: string;
  isActive: boolean;
  source: PortMappingSource;
}

/**
 * Type guard for tunnel forwarded port info
 */
export function isTunnelForwardedPortInfo(obj: unknown): obj is TunnelForwardedPortInfo {
  return typeof obj === 'object' && obj !== null;
}

/**
 * Type-safe extraction of remote port from tunnel info
 */
export function extractRemotePort(remoteInfo: unknown): number {
  if (!isTunnelForwardedPortInfo(remoteInfo)) {
    return 0;
  }
  
  // Try remotePort first, then fall back to port
  const remotePort = remoteInfo.remotePort || remoteInfo.port;
  return typeof remotePort === 'number' ? remotePort : 0;
}

/**
 * Type-safe extraction of protocol from tunnel info
 */
export function extractProtocol(remoteInfo: unknown): string {
  if (!isTunnelForwardedPortInfo(remoteInfo)) {
    return 'unknown';
  }
  
  const protocol = remoteInfo.protocol;
  return typeof protocol === 'string' ? protocol : 'unknown';
}

/**
 * Type-safe conversion of local port key to number
 */
export function extractLocalPort(localPort: unknown): number {
  if (typeof localPort === 'number') {
    return localPort;
  }
  
  if (typeof localPort === 'string') {
    const parsed = parseInt(localPort, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  return 0;
}

/**
 * Type-safe creation of detected port info from tunnel map entry
 */
export function createDetectedPortInfo(
  localPortKey: unknown, 
  remoteInfo: unknown
): PortMapping {
  return {
    localPort: extractLocalPort(localPortKey),
    remotePort: extractRemotePort(remoteInfo),
    protocol: extractProtocol(remoteInfo),
    isActive: true,
    source: 'tunnelQuery' as PortMappingSource
  };
}

/**
 * Type-safe error message extraction
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      return errorObj.message;
    }
  }
  
  return 'Unknown error';
}