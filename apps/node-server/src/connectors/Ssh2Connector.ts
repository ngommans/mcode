/**
 * SSH2 Connector for establishing SSH connections to codespaces
 */

import { Client, type ConnectConfig } from 'ssh2';
import { readFileSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';
import type { TerminalConnection } from '@minimal-terminal-client/shared';
import { TERMINAL_DEFAULTS } from '@minimal-terminal-client/shared';
import { logger } from '../utils/logger.js';

export class Ssh2Connector {
  async connectViaSSH(
    onTerminalData: (data: string) => void,
    onTerminalError: (error: string) => void,
    port: number
  ): Promise<TerminalConnection> {
    return new Promise((resolve, reject) => {
      // TODO: HARDCODED - this needs to come in from somewhere else 
      // gh cs ssh generates it on the fly and injects if unavailable: 
      // https://github.com/cli/cli/pull/5752/files ( Automatically create ssh keys in gh cs ssh )
      const userHomeDir = homedir();
      const identityFilePath = platform() === "win32"
        ? join(userHomeDir, '.ssh', 'id_ed25519')
        : join(userHomeDir, '.ssh', 'id_ed25519');

      logger.info(`Using SSH identity file: ${identityFilePath}`);
      
      let privateKey: Buffer;
      try {
        privateKey = readFileSync(identityFilePath);
      } catch (error) {
        const message = `Failed to read SSH private key from ${identityFilePath}`;
        logger.error(message, error as Error);
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
        privateKey: privateKey,
        debug: (info: string) => {
          logger.debug('[SSH2 DEBUG]', { info });
        }
      };

      conn.connect(connectConfig);
    });
  }
}