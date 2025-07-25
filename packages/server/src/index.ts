/**
 * Main entry point for the Node.js server
 */

import { config } from 'dotenv';
import { CodespaceTerminalServer } from './server/CodespaceTerminalServer.js';
import { logger } from './utils/logger.js';

// Export for use by other packages (like npx-server)
export { CodespaceWebSocketHandler, type ServerOptions } from './handlers/CodespaceWebSocketHandler.js';
export type { TcodeWebSocket } from 'tcode-shared';
export { CodespaceTerminalServer } from './server/CodespaceTerminalServer.js';

// Export main function for programmatic use
export { main as startServer };

// Default export for npx usage
export default main;

// Load environment variables
config();

// Add global error handlers to prevent crashes from disposed SSH channels
process.on('uncaughtException', (error) => {
  if (error.message?.includes('SshChannel disposed') || error.message?.includes('ObjectDisposedError')) {
    logger.warn('Caught SSH channel disposal error (non-fatal)', { message: error.message });
  } else {
    logger.error('Uncaught exception', error);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise });
});

const DEFAULT_PORT = 3000;
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;

// Parse command line arguments for debug mode
const isDebugMode = process.argv.includes('--debug') || process.env.DEBUG_TRACE === 'true';

function main(): void {
  try {
    logger.info('Starting Codespace Terminal Server...');
    
    if (isDebugMode) {
      logger.info('Debug mode enabled - trace logging will be active');
    } else {
      logger.info('Debug mode disabled - use --debug flag to enable trace logging');
    }
    
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
  try {
    main();
  } catch (error) {
    logger.error('Unhandled error in main:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}