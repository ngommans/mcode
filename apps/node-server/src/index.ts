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

// Parse command line arguments for debug mode
const isDebugMode = process.argv.includes('--debug') || process.env.DEBUG_TRACE === 'true';

async function main(): Promise<void> {
  try {
    logger.info('Starting Codespace Terminal Server...');
    
    if (isDebugMode) {
      logger.info('Debug mode enabled - trace logging will be active');
    } else {
      logger.info('Debug mode disabled - use --debug flag to enable trace logging');
    }
    
    const server = new CodespaceTerminalServer(port, { debugMode: isDebugMode });
    
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