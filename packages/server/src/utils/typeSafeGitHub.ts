/**
 * Type-safe utilities for handling GitHub API responses
 * Centralizes all unsafe operations with proper validation and type guards
 */

import type { Codespace, CodespaceState, TunnelProperties } from 'tcode-shared';
import { 
  isGitHubCodespaceState, 
  isRetryableCodespaceState, 
  isAvailableCodespaceState,
  isGitHubCodespace,
  type GitHubListCodespacesResponse,
  type GitHubGetCodespaceResponse
} from 'tcode-shared';

/**
 * Type guard for CodespaceState (includes our internal states)
 */
function isCodespaceState(value: unknown): value is CodespaceState {
  if (typeof value !== 'string') return false;
  
  // Check GitHub API states first
  if (isGitHubCodespaceState(value)) return true;
  
  // Check our internal states
  return ['Connected', 'Disconnected'].includes(value);
}

/**
 * Type guard for Codespace object (delegates to schema-based type guard)
 */
function isCodespace(obj: unknown): obj is Codespace {
  return isGitHubCodespace(obj);
}

/**
 * Type-safe GitHub API response parser
 */
export function parseGitHubResponse(rawData: string): unknown {
  try {
    return JSON.parse(rawData);
  } catch (error) {
    throw new Error(`Failed to parse GitHub API response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract codespaces array from GitHub API response with validation
 */
export function extractCodespaces(response: unknown): Codespace[] {
  if (typeof response !== 'object' || response === null) {
    return [];
  }
  
  const data = response as GitHubListCodespacesResponse;
  const codespaces = data.codespaces;
  
  if (!Array.isArray(codespaces)) {
    return [];
  }
  
  return codespaces.filter(isCodespace);
}

/**
 * Extract codespace state from GitHub API response with validation
 */
export function extractCodespaceState(response: unknown): CodespaceState | null {
  if (typeof response !== 'object' || response === null) {
    return null;
  }
  
  const data = response as Record<string, unknown>;
  const state = data.state;
  
  return isCodespaceState(state) ? state : null;
}

/**
 * Extract tunnel properties from GitHub API response with validation
 */
export function extractTunnelProperties(response: unknown): TunnelProperties | null {
  if (typeof response !== 'object' || response === null) {
    return null;
  }
  
  const data = response as GitHubGetCodespaceResponse;
  const tunnelProps = data.connection?.tunnelProperties;
  
  if (typeof tunnelProps === 'object' && tunnelProps !== null) {
    const props = tunnelProps as Record<string, unknown>;
    
    // Validate required TunnelProperties fields
    if (
      typeof props.tunnelId === 'string' &&
      typeof props.clusterId === 'string' &&
      typeof props.domain === 'string' &&
      typeof props.connectAccessToken === 'string' &&
      typeof props.managePortsAccessToken === 'string' &&
      typeof props.serviceUri === 'string'
    ) {
      return {
        tunnelId: props.tunnelId,
        clusterId: props.clusterId,
        domain: props.domain,
        connectAccessToken: props.connectAccessToken,
        managePortsAccessToken: props.managePortsAccessToken,
        serviceUri: props.serviceUri
      };
    }
  }
  
  return null;
}

/**
 * Check if a codespace state indicates it's retryable (in progress)
 */
export function isRetryableState(state: CodespaceState | null): boolean {
  if (!state || !isGitHubCodespaceState(state)) return false;
  return isRetryableCodespaceState(state);
}

/**
 * Check if a codespace is available for connection
 */
export function isCodespaceAvailable(response: unknown): boolean {
  const state = extractCodespaceState(response);
  if (!state || !isGitHubCodespaceState(state)) return false;
  return isAvailableCodespaceState(state);
}