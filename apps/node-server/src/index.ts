/**
 * Main entry point for the Node.js server
 */

import { config } from 'dotenv';
import { CodespaceTerminalServer } from './server/CodespaceTerminalServer.js';
import { logger } from './utils/logger.js';

// Load environment variables
config();

const DEFAULT_PORT = 3002;
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;

async function main(): Promise<void> {
  try {
    logger.info('Starting Codespace Terminal Server...');
    
    const server = new CodespaceTerminalServer(port);
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      server.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      server.close();
      process.exit(0);
    });
    
    logger.info(`Server started successfully on port ${port}`);
  } catch (error) {
    logger.error('Failed to start server:', error instanceof Error ? error : { error: String(error) });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error in main:', error);
    process.exit(1);
  });
}