// Centralized port filtering logic

export interface Port {
  portNumber: number;
  protocol: string;
  urls?: string[];
  labels?: string[];
  accessControl?: Record<string, unknown>;
}

/**
 * Filters ports to only include accessible, user-relevant ports
 * Excludes:
 * - Port 22 (SSH/command port)
 * - Ports without URLs
 * - Ports with only non-standard port URLs (containing :port in URL)
 */
export function filterAccessiblePorts(ports: Port[]): Port[] {
  return ports.filter(port => 
    port.portNumber !== 22 && 
    port.urls && 
    port.urls.filter(uri => !uri.match(/:\d+\//)).length > 0
  );
}

/**
 * Gets the count of accessible ports
 */
export function getAccessiblePortCount(ports: Port[]): number {
  return filterAccessiblePorts(ports).length;
}

/**
 * Gets accessible URLs for a port (excludes non-standard port URLs)
 */
export function getAccessibleUrls(port: Port): string[] {
  if (!port.urls) return [];
  return port.urls.filter(uri => !uri.match(/:\d+\//));
}