/**
 * Server-side types for WebSocket handling
 */

import type WebSocket from 'ws';
import type { TerminalConnection, EndpointInfo, TunnelConnection } from './tunnel.js';
import type { PortInformation } from './port.js';
import type { Codespace } from './websocket.js';
import type { RpcConnection } from './external.js';

// Simple interface for GitHubCodespaceConnector to avoid circular dependency
// Only includes the methods we actually use
export interface CodespaceConnector {
  connectToCodespace(codespaceName: string, onTerminalData: (data: string) => void, ws: TcodeWebSocket): Promise<TerminalConnection>;
  refreshPortInformation(ws: TcodeWebSocket): Promise<PortInformation>;
  sendPortUpdate(ws: TcodeWebSocket, portInfo: PortInformation): void;
  listCodespaces(): Promise<Codespace[]>;
  sendCodespaceState(ws: TcodeWebSocket, codespaceName: string, state: string, message?: string): void;
}

/**
 * TcodeWebSocket interface with all properties needed for codespace connection state
 * This consolidates all WebSocket extensions used throughout the server
 */
export interface TcodeWebSocket extends WebSocket {
  // Connection management
  connector?: CodespaceConnector;
  terminalConnection?: TerminalConnection;
  codespaceName?: string;
  
  // Tunnel connection wrapper (replaces individual tunnel properties)
  tunnelConnection?: TunnelConnection;
  rpcConnection?: RpcConnection; 
  
  // Port and endpoint information
  portInfo?: PortInformation;
  endpointInfo?: EndpointInfo | null;
}