/**
 * SSH2 Connector for establishing SSH connections to codespaces
 */

import { Client, type ConnectConfig } from 'ssh2';
import { TERMINAL_DEFAULTS, type TerminalConnection } from 'tcode-shared';
import { logger } from '../utils/logger.js';

export class Ssh2Connector {
  private privateKey: Buffer;

  constructor(privateKey: Buffer | string) {
    this.privateKey = typeof privateKey === 'string' ? Buffer.from(privateKey) : privateKey;
    logger.info('SSH2Connector initialized with provided private key');
  }
  async connectViaSSH(
    onTerminalData: (data: string) => void,
    onTerminalError: (error: string) => void,
    port: number
  ): Promise<TerminalConnection> {
    return new Promise((resolve, reject) => {
      logger.info('Using ephemeral SSH private key for connection');
      
      if (!this.privateKey) {
        const message = 'No private key available for SSH connection';
        logger.error(message);
        onTerminalError(message);
        return reject(new Error(message));
      }

      const conn = new Client();
      
      conn.on('ready', () => {
        logger.debug('[ssh2] Client :: ready');
        
        conn.shell({
          term: 'xterm-256color',
          cols: TERMINAL_DEFAULTS.COLS,
          rows: TERMINAL_DEFAULTS.ROWS
        }, (err, stream) => {
          if (err) {
            logger.error('[ssh2] Failed to create shell:', err);
            onTerminalError(err.message);
            return reject(err);
          }
          
          stream.on('close', () => {
            logger.debug('[ssh2] stream :: close');
            conn.end();
            onTerminalError('Terminal session closed.');
          }).on('data', (data: Buffer) => {
            onTerminalData(data.toString());
          }).stderr.on('data', (data: Buffer) => {
            onTerminalData(data.toString()); // Also forward stderr to the terminal
          });

          const terminalConnection: TerminalConnection = {
            write: (data: string) => stream.write(data),
            resize: (cols: number, rows: number) => stream.setWindow(rows, cols, 0, 0),
            close: () => conn.end()
          };

          resolve(terminalConnection);
        });
      }).on('error', (err: Error) => {
        logger.error('[ssh2] Client :: error', err);
        onTerminalError(err.message);
        reject(err);
      });

      const connectConfig: ConnectConfig = {
        host: 'localhost',
        port: port,
        username: 'node',
        privateKey: this.privateKey,
        debug: (info: string) => {
          logger.debug('[SSH2 DEBUG]', { info });
        }
      };

      conn.connect(connectConfig);
    });
  }
}