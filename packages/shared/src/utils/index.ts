/**
 * Shared utility functions
 */

export function isWebSocketMessage(data: unknown): data is import('../types/websocket.js').WebSocketMessage {
  if( typeof data === 'object' && data !== null && 'type' in data) {
    return typeof (data as {type: unknown}).type === 'string';
  }
  return false;
}

export function createMessage<T extends import('../types/websocket.js').WebSocketMessage>(message: T): T {
  return message;
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeCodespaceName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-]/g, '');
}

export function parsePortFromUrl(url: string): number | null {
  try {
    const urlObj = new URL(url);
    const port = parseInt(urlObj.port, 10);
    return isValidPort(port) ? port : null;
  } catch {
    return null;
  }
}