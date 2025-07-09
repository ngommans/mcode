/**
 * Determines the default WebSocket URL for connecting to the tcode server
 * 
 * Priority:
 * 1. VITE_TCODE_BACKEND environment variable
 * 2. Auto-detect from current window location
 * 
 * @returns WebSocket URL string
 */
export function getDefaultWebSocketUrl(): string {
  // Check for environment variable override first
  const envBackend = import.meta.env.VITE_TCODE_BACKEND;
  if (envBackend) {
    return envBackend;
  }

  // Auto-detect from current location
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  
  return `${protocol}//${host}`;
}

/**
 * Validates if a WebSocket URL is properly formatted
 * 
 * @param url WebSocket URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}