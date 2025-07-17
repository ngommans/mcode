#!/usr/bin/env node

import express, { Request, Response, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';
import { CodespaceWebSocketHandler } from 'tcode-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const httpServer = createServer(app);

// Serve static files from the web-client dist directory
const staticPath = join(__dirname, '..', 'static');
app.use(express.static(staticPath));

// SPA fallback - serve index.html for all non-API routes
const limiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  handler: (req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many requests' });
  },
}) as RequestHandler;

app.get('*', limiter, (req: Request, res: Response) => {
  res.sendFile(join(staticPath, 'index.html'));
});

// WebSocket server attached to HTTP server (root path)
const wss = new WebSocketServer({ server: httpServer });

// Type guard for authenticate messages
type AuthenticateMessage = {
  type: 'authenticate';
  token?: string;
};

function isAuthenticateMessage(obj: unknown): obj is AuthenticateMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    (obj as { type: unknown }).type === 'authenticate'
  );
}

// Enhanced WebSocket handler that supports GITHUB_TOKEN environment variable fallback
class StandaloneWebSocketHandler extends CodespaceWebSocketHandler {
  // Save a reference to the parent's handleConnection                                                 │
  private originalHandleConnection: (ws: WebSocket) => void;

  constructor() {
    super();
    const parent = new CodespaceWebSocketHandler();
    this.originalHandleConnection = parent.handleConnection.bind(parent);
  }

  handleConnection = (ws: WebSocket): void => {
    console.info('New client connected to standalone server');

    // Store the original 'on' method
    const originalOn = ws.on.bind(ws);

    // Override the 'on' method to intercept message events
    // Override WebSocket message handling to intercept authenticate messages and auto-inject
    // GitHub token from environment for standalone/single-use deployments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.on = function (event: string, listener: (...args: any[]) => void) {
      if (event === 'message') {
        // Wrap the message listener to intercept authenticate messages
        const wrappedListener = (data: RawData) => {
          try {
            const messageText = Buffer.isBuffer(data)
              ? data.toString('utf8')
              : typeof data === 'string'
                ? data
                : Array.isArray(data)
                  ? Buffer.concat(data).toString('utf8')
                  : Buffer.from(data).toString('utf8');
            const parsed: unknown = JSON.parse(messageText);

            if (isAuthenticateMessage(parsed)) {
              const message: AuthenticateMessage = parsed;

              // Handle authenticate message with environment variable fallback
              let token = message.token;

              // If no token provided, check for GITHUB_TOKEN environment variable
              if (!token || token.trim() === '') {
                const envToken = process.env.GITHUB_TOKEN;
                if (envToken) {
                  token = envToken;
                  console.warn(
                    '⚠️  No GitHub token provided in request - using GITHUB_TOKEN from environment variable'
                  );
                  // Update the message with the environment token
                  message.token = token;
                  const updatedMessage = JSON.stringify(message);
                  data = Buffer.from(updatedMessage);
                }
              }
            }
          } catch {
            // If JSON parsing fails, just continue with original data
          }

          // Call the original listener with potentially modified data
          listener(data);
        };

        return originalOn.call(this, event, wrappedListener);
      }

      // For non-message events, use the original method
      return originalOn.call(this, event, listener);
    };

    // Call the parent's handleConnection implementation
    this.originalHandleConnection(ws);
  };
}

// Use enhanced WebSocket handler only if GITHUB_TOKEN is available
let wsHandler: CodespaceWebSocketHandler;
if (process.env.GITHUB_TOKEN) {
  console.warn(
    '🔑 GITHUB_TOKEN environment variable detected - enabling automatic token fallback for unauthenticated requests'
  );
  wsHandler = new StandaloneWebSocketHandler();
} else {
  wsHandler = new CodespaceWebSocketHandler();
}

wss.on('connection', wsHandler.handleConnection);

// Start server
httpServer.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.info(`🚀 Terminal Code (tcode) running at ${url}`);
  console.info(`📡 WebSocket available at ws://localhost:${PORT}/`);
  console.info(`Press Ctrl+C to stop`);

  // Auto-open browser if not in CI/headless environment
  if (!process.env.CI && !process.env.HEADLESS) {
    open(url).catch(() => {
      console.info(`💡 Open your browser to ${url}`);
    });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.info('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.info('\n👋 Shutting down gracefully...');
  process.exit(0);
});
