/**
 * WebSocket handler for codespace terminal connections
 * Extracted from CodespaceTerminalServer for reusability
 */

import WebSocket from 'ws';
import {
  MESSAGE_TYPES,
  isWebSocketMessage,
  PortConverter,
  type WebSocketMessage,
  type TcodeWebSocket,
  type ServerMessage,
} from 'tcode-shared';
import { GitHubCodespaceConnector } from '../connectors/GitHubCodespaceConnector.js';
import { logger } from '../utils/logger.js';

// All WebSocket properties are now consolidated in TcodeWebSocket from tcode-shared

export interface ServerOptions {
  debugMode?: boolean;
}

export class CodespaceWebSocketHandler {
  /**
   * Safely convert WebSocket.RawData to string
   * Handles Buffer, ArrayBuffer, and Buffer[] types properly
   */
  private convertWebSocketDataToString(data: WebSocket.RawData): string {
    if (Buffer.isBuffer(data)) {
      return data.toString('utf8');
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8');
    }

    if (Array.isArray(data)) {
      // Handle Buffer[] - concatenate all buffers
      return Buffer.concat(data).toString('utf8');
    }

    // This should not happen with proper WebSocket.RawData types
    // but provides a fallback that won't produce [object Object]
    if (typeof data === 'string') {
      return data;
    }

    throw new Error(`Unsupported WebSocket data type: ${typeof data}`);
  }

  /**
   * Handle new WebSocket connection
   * This method is designed to be used as a callback for WebSocket server
   */
  handleConnection = (ws: TcodeWebSocket): void => {
    logger.info('New client connected');

    // Initialize connection state
    ws.connector = undefined;
    ws.terminalConnection = undefined;
    ws.codespaceName = undefined;

    ws.on('message', (data: WebSocket.RawData) => {
      void (async () => {
        try {
          const messageText = this.convertWebSocketDataToString(data);
          const message = JSON.parse(messageText) as WebSocketMessage;
          await this.handleMessage(ws, message);
        } catch (error) {
          logger.error(
            'Error handling message',
            error instanceof Error ? error : new Error(String(error))
          );
          this.sendError(ws, error instanceof Error ? error.message : String(error));
        }
      })();
    });

    ws.on('close', () => {
      void (async () => {
        logger.info('Client disconnected');

        // Mark RPC connection as disconnected to start grace period
        if (ws.rpcConnection) {
          ws.rpcConnection.markAsDisconnected();
        }

        await this.cleanup(ws);
      })();
    });

    ws.on('error', (error: Error) => {
      void (async () => {
        logger.error('WebSocket connection error', error);
        await this.cleanup(ws);
      })();
    });
  };

  private async handleMessage(ws: TcodeWebSocket, message: WebSocketMessage): Promise<void> {
    if (!isWebSocketMessage(message)) {
      throw new Error('Invalid message format');
    }

    logger.debug('Server received message', { type: message.type });

    try {
      switch (message.type) {
        case MESSAGE_TYPES.AUTHENTICATE:
          this.handleAuthenticate(ws, message as { token: string });
          break;

        case MESSAGE_TYPES.LIST_CODESPACES:
          await this.handleListCodespaces(ws);
          break;

        case MESSAGE_TYPES.CONNECT_CODESPACE:
          await this.handleConnectCodespace(ws, message as { codespace_name: string });
          break;

        case MESSAGE_TYPES.DISCONNECT_CODESPACE:
          await this.handleDisconnectCodespace(ws);
          break;

        case MESSAGE_TYPES.INPUT:
          this.handleInput(ws, message as { data: string });
          break;

        case MESSAGE_TYPES.RESIZE:
          this.handleResize(ws, message as { cols: number; rows: number });
          break;

        case MESSAGE_TYPES.GET_PORT_INFO:
          await this.handleGetPortInfo(ws);
          break;

        case MESSAGE_TYPES.REFRESH_PORTS:
          await this.handleRefreshPorts(ws);
          break;

        default:
          logger.warn('Unknown message type', { type: message.type });
          break;
      }
    } catch (error) {
      logger.error('Error handling message', { error, messageType: message.type });
      throw error;
    }
  }

  private handleAuthenticate(ws: TcodeWebSocket, message: { token: string }): void {
    ws.connector = new GitHubCodespaceConnector(message.token, ws, this);
    this.sendMessage(ws, {
      type: MESSAGE_TYPES.AUTHENTICATED,
      success: true,
    });
  }

  private async handleListCodespaces(ws: TcodeWebSocket): Promise<void> {
    if (!ws.connector) {
      throw new Error('Not authenticated. Please send an authenticate message first.');
    }

    const codespaces = await ws.connector.listCodespaces();
    this.sendMessage(ws, {
      type: MESSAGE_TYPES.CODESPACES_LIST,
      data: codespaces,
    });
  }

  private async handleConnectCodespace(
    ws: TcodeWebSocket,
    message: { codespace_name: string }
  ): Promise<void> {
    if (!ws.connector) {
      throw new Error('Not authenticated. Please send an authenticate message first.');
    }

    // Close existing terminal connection if any
    if (ws.terminalConnection) {
      ws.terminalConnection.close();
    }

    ws.terminalConnection = await ws.connector.connectToCodespace(
      message.codespace_name,
      (data: string) => {
        this.sendMessage(ws, {
          type: MESSAGE_TYPES.OUTPUT,
          data: data,
        });
      },
      ws
    );

    ws.codespaceName = message.codespace_name;
  }

  private async handleDisconnectCodespace(ws: TcodeWebSocket): Promise<void> {
    if (ws.terminalConnection) {
      ws.terminalConnection.close();
      ws.terminalConnection = undefined;

      if (ws.tunnelConnection) {
        logger.info('Disposing of tunnel connection on disconnect');
        await ws.tunnelConnection.close();
        ws.tunnelConnection = undefined;
      }

      if (ws.codespaceName && ws.connector) {
        ws.connector.sendCodespaceState(ws, ws.codespaceName, 'Shutdown');
      }

      this.sendMessage(ws, { type: MESSAGE_TYPES.DISCONNECTED_FROM_CODESPACE });
    }
  }

  private handleInput(ws: TcodeWebSocket, message: { data: string }): void {
    if (ws.terminalConnection) {
      ws.terminalConnection.write(message.data);
    }
  }

  private handleResize(ws: TcodeWebSocket, message: { cols: number; rows: number }): void {
    if (ws.terminalConnection) {
      ws.terminalConnection.resize(message.cols, message.rows);
    }
  }

  private async handleGetPortInfo(ws: TcodeWebSocket): Promise<void> {
    if (!ws.connector) {
      throw new Error('Not authenticated.');
    }

    const portInfo = await ws.connector.refreshPortInformation(ws);

    // Use PortConverter to eliminate manual mapping and casting
    const webSocketPortInfo = PortConverter.createWebSocketPortInfo(portInfo);

    this.sendMessage(ws, {
      type: MESSAGE_TYPES.PORT_INFO_RESPONSE,
      portInfo: webSocketPortInfo,
    });
  }

  private async handleRefreshPorts(ws: TcodeWebSocket): Promise<void> {
    if (!ws.connector) {
      throw new Error('Not authenticated.');
    }

    await ws.connector.refreshPortInformation(ws);
  }

  private async cleanup(ws: TcodeWebSocket): Promise<void> {
    try {
      // Close terminal connection first
      if (ws.terminalConnection) {
        try {
          ws.terminalConnection.close();
        } catch (error) {
          logger.error('Error closing terminal connection', error as Error);
        }
      }

      // Don't immediately close RPC connection - let grace period handle it
      // The RPC connection will auto-cleanup after the grace period expires
      if (ws.rpcConnection) {
        logger.info(
          "RPC connection entering grace period - will auto-cleanup if client doesn't reconnect"
        );
        // Don't set to undefined yet - keep reference for potential reconnection
      }

      // Dispose tunnel connection wrapper or client last
      if (ws.tunnelConnection) {
        logger.info('Disposing of tunnel connection on WebSocket close');
        try {
          await ws.tunnelConnection.close();
        } catch (error) {
          logger.error('Error disposing tunnel connection', error as Error);
        }
        ws.tunnelConnection = undefined;
      }

      // Clear all tunnel-related properties
      ws.portInfo = undefined;
      ws.endpointInfo = undefined;
    } catch (error) {
      logger.error('Error during WebSocket cleanup', error as Error);
    }
  }

  sendMessage(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: MESSAGE_TYPES.ERROR,
      message: error,
    });
  }
}
