/**
 * Type-safe utilities for handling external data with proper validation
 * Centralizes all "unsafe" operations with appropriate guards
 */

import type { ServerMessage } from 'tcode-shared';

/**
 * Type guard to check if an object looks like a valid ServerMessage
 */
function isServerMessage(obj: unknown): obj is ServerMessage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const message = obj as Record<string, unknown>;
  return typeof message.type === 'string';
}

/**
 * Type-safe WebSocket message parser
 * Handles the unsafe JSON.parse and type conversion in one place
 */
export function parseWebSocketMessage(rawData: unknown): ServerMessage | null {
  try {
    // Safely convert to string first
    const dataString = typeof rawData === 'string' ? rawData : String(rawData);
    
    // Parse JSON (this is the unsafe operation we're centralizing)
    const parsed: unknown = JSON.parse(dataString);
    
    // Validate the parsed data
    if (isServerMessage(parsed)) {
      return parsed;
    }
    
    console.warn('Received invalid message format:', parsed);
    return null;
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
    return null;
  }
}

/**
 * Type-safe environment variable access
 * Centralizes import.meta.env access with proper typing
 */
export function getEnvironmentVariable(key: string): string | undefined {
  try {
    const importMeta = import.meta as { env?: Record<string, unknown> };
    const value = importMeta.env?.[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Type-safe external API data extraction
 * For handling responses from GitHub API or other external sources
 */
export function extractStringProperty(obj: unknown, property: string): string | undefined {
  if (typeof obj !== 'object' || obj === null) {
    return undefined;
  }
  
  const data = obj as Record<string, unknown>;
  const value = data[property];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Type-safe array extraction with validation
 */
export function extractArray<T>(obj: unknown, property: string, itemValidator: (item: unknown) => item is T): T[] {
  if (typeof obj !== 'object' || obj === null) {
    return [];
  }
  
  const data = obj as Record<string, unknown>;
  const value = data[property];
  
  if (!Array.isArray(value)) {
    return [];
  }
  
  return value.filter(itemValidator);
}