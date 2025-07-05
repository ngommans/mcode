/**
 * WebSocket server for handling codespace terminal connections
 */

import WebSocket, { WebSocketServer } from 'ws';
import type { 
  ServerMessage, 
  WebSocketMessage,
  TerminalConnection
} from '@minimal-terminal-client/shared';
import { MESSAGE_TYPES, isWebSocketMessage } from '@minimal-terminal-client/shared';
import { GitHubCodespaceConnector } from '../connectors/GitHubCodespaceConnector.js';
import { logger } from '../utils/logger.js';

interface ExtendedWebSocket extends WebSocket {
  connector?: GitHubCodespaceConnector;
  terminalConnection?: TerminalConnection;
  codespaceName?: string;
  tunnelClient?: any;
  portInfo?: any;
  endpointInfo?: any;
  tunnelManagementClient?: any;
  tunnelProperties?: any;
  rpcConnection?: any; // CodespaceRPCInvoker
}

interface ServerOptions {
  debugMode?: boolean;
}

export class CodespaceTerminalServer {
  private wss: WebSocketServer;
  private port: number;
  private options: ServerOptions;

  constructor(port: number, options: ServerOptions = {}) {
    this.port = port;
    this.options = options;
    this.wss = new WebSocketServer({ port: this.port });
    this.init();
  }

  private init(): void {
    logger.info(`Codespace Terminal Server starting on port ${this.port}`);

    this.wss.on('connection', (ws: ExtendedWebSocket) => {
      logger.info('New client connected');
      this.handleConnection(ws);
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', error);
    });

    logger.info(`Codespace Terminal Server started on port ${this.port}`);
  }

  private handleConnection(ws: ExtendedWebSocket): void {
    // Initialize connection state
    ws.connector = undefined;
    ws.terminalConnection = undefined;
    ws.codespaceName = undefined;
    ws.tunnelClient = undefined;

    ws.on('message', async (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        await this.handleMessage(ws, message);
      } catch (error) {
        logger.error('Error handling message', error as Error);
        this.sendError(ws, (error as Error).message);
      }
    });

    ws.on('close', async () => {
      logger.info('Client disconnected');
      
      // Mark RPC connection as disconnected to start grace period
      if (ws.rpcConnection) {
        ws.rpcConnection.markAsDisconnected();
      }
      
      await this.cleanup(ws);
    });

    ws.on('error', async (error) => {
      logger.error('WebSocket connection error', error);
      await this.cleanup(ws);
    });
  }

  private async handleMessage(ws: ExtendedWebSocket, message: WebSocketMessage): Promise<void> {
    if (!isWebSocketMessage(message)) {
      throw new Error('Invalid message format');
    }

    logger.debug('Server received message', { type: message.type });

    switch (message.type) {
      case MESSAGE_TYPES.AUTHENTICATE:
        await this.handleAuthenticate(ws, message as any);
        break;

      case MESSAGE_TYPES.LIST_CODESPACES:
        await this.handleListCodespaces(ws);
        break;

      case MESSAGE_TYPES.CONNECT_CODESPACE:
        await this.handleConnectCodespace(ws, message as any);
        break;

      case MESSAGE_TYPES.DISCONNECT_CODESPACE:
        await this.handleDisconnectCodespace(ws);
        break;

      case MESSAGE_TYPES.INPUT:
        await this.handleInput(ws, message as any);
        break;

      case MESSAGE_TYPES.RESIZE:
        await this.handleResize(ws, message as any);
        break;

      case MESSAGE_TYPES.GET_PORT_INFO:
        await this.handleGetPortInfo(ws);
        break;

      case MESSAGE_TYPES.REFRESH_PORTS:
        await this.handleRefreshPorts(ws);
        break;

      default:
        logger.warn('Unknown message type', { type: message.type });
    }
  }

  private async handleAuthenticate(ws: ExtendedWebSocket, message: { token: string }): Promise<void> {
    ws.connector = new GitHubCodespaceConnector(message.token, ws, this, { debugMode: this.options.debugMode });
    this.sendMessage(ws, {
      type: MESSAGE_TYPES.AUTHENTICATED,
      success: true
    });
  }

  private async handleListCodespaces(ws: ExtendedWebSocket): Promise<void> {
    if (!ws.connector) {
      throw new Error('Not authenticated. Please send an authenticate message first.');
    }

    const codespaces = await ws.connector.listCodespaces();
    this.sendMessage(ws, {
      type: MESSAGE_TYPES.CODESPACES_LIST,
      data: codespaces
    });
  }

  private async handleConnectCodespace(ws: ExtendedWebSocket, message: { codespace_name: string }): Promise<void> {
    if (!ws.connector) {
      throw new Error('Not authenticated. Please send an authenticate message first.');
    }

    // Close existing terminal connection if any
    if (ws.terminalConnection) {
      ws.terminalConnection.close();
    }

    ws.terminalConnection = await ws.connector.connectToCodespace(
      message.codespace_name,
      (data) => {
        this.sendMessage(ws, {
          type: MESSAGE_TYPES.OUTPUT,
          data: data
        });
      },
      ws
    );
    
    ws.codespaceName = message.codespace_name;
  }

  private async handleDisconnectCodespace(ws: ExtendedWebSocket): Promise<void> {
    if (ws.terminalConnection) {
      ws.terminalConnection.close();
      ws.terminalConnection = undefined;
      
      if (ws.tunnelClient) {
        logger.info('Disposing of tunnel client on disconnect');
        ws.tunnelClient.dispose();
        ws.tunnelClient = undefined;
      }
      
      if (ws.codespaceName && ws.connector) {
        ws.connector.sendCodespaceState(ws, ws.codespaceName, 'Shutdown');
      }
      
      this.sendMessage(ws, { type: MESSAGE_TYPES.DISCONNECTED_FROM_CODESPACE });
    }
  }

  private async handleInput(ws: ExtendedWebSocket, message: { data: string }): Promise<void> {
    if (ws.terminalConnection) {
      ws.terminalConnection.write(message.data);
    }
  }

  private async handleResize(ws: ExtendedWebSocket, message: { cols: number; rows: number }): Promise<void> {
    if (ws.terminalConnection) {
      ws.terminalConnection.resize(message.cols, message.rows);
    }
  }

  private async handleGetPortInfo(ws: ExtendedWebSocket): Promise<void> {
    if (!ws.connector) {
      throw new Error('Not authenticated.');
    }

    const portInfo = await ws.connector.refreshPortInformation(ws);
    this.sendMessage(ws, {
      type: MESSAGE_TYPES.PORT_INFO_RESPONSE,
      portInfo: portInfo
    });
  }

  private async handleRefreshPorts(ws: ExtendedWebSocket): Promise<void> {
    if (!ws.connector) {
      throw new Error('Not authenticated.');
    }

    await ws.connector.refreshPortInformation(ws);
  }

  private async cleanup(ws: ExtendedWebSocket): Promise<void> {
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
        logger.info('RPC connection entering grace period - will auto-cleanup if client doesn\'t reconnect');
        // Don't set to undefined yet - keep reference for potential reconnection
      }
      
      // Dispose tunnel client last
      if (ws.tunnelClient) {
        logger.info('Disposing of tunnel client on WebSocket close');
        try {
          await ws.tunnelClient.dispose();
        } catch (error) {
          logger.error('Error disposing tunnel client', error as Error);
        }
        ws.tunnelClient = undefined;
      }
      
      // Clear all tunnel-related properties
      ws.portInfo = undefined;
      ws.endpointInfo = undefined;
      ws.tunnelManagementClient = undefined;
      ws.tunnelProperties = undefined;
      
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
      message: error
    });
  }

  close(): void {
    logger.info('Closing WebSocket server');
    this.wss.close();
  }
}