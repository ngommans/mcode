/**
 * WebSocket server for handling codespace terminal connections
 */

import { WebSocketServer } from 'ws';
import { CodespaceWebSocketHandler, type ServerOptions } from '../handlers/CodespaceWebSocketHandler.js';
import { logger } from '../utils/logger.js';

export class CodespaceTerminalServer {
  private wss: WebSocketServer;
  private port: number;
  private wsHandler: CodespaceWebSocketHandler;

  constructor(port: number, options: ServerOptions = {}) {
    this.port = port;
    this.wsHandler = new CodespaceWebSocketHandler(options);
    this.wss = new WebSocketServer({ port: this.port });
    this.init();
  }

  private init(): void {
    logger.info(`Codespace Terminal Server starting on port ${this.port}`);

    // Delegate to handler
    this.wss.on('connection', this.wsHandler.handleConnection);

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', error);
    });

    logger.info(`Codespace Terminal Server started on port ${this.port}`);
  }

  close(): void {
    logger.info('Closing WebSocket server');
    this.wss.close();
  }
}