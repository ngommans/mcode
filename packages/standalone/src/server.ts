#!/usr/bin/env node

import express from 'express';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';
import { CodespaceWebSocketHandler, type ServerOptions } from 'tcode-server';
import WebSocket from 'ws';

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
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

app.get('*', limiter, (req, res) => {
  res.sendFile(join(staticPath, 'index.html'));
});

// WebSocket server attached to HTTP server (root path)
const wss = new WebSocketServer({ server: httpServer });

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
    console.log('New client connected to standalone server');
    
    // Store the original message handler
    const originalMessageHandler = ws.on;
    
    // Override the message handler to intercept authenticate messages
    ws.on = function(event: string, listener: any) {
      if (event === 'message') {
        const wrappedListener = (data: WebSocket.RawData) => {
          try {
            const message = JSON.parse(data.toString());
            
            // Intercept authenticate messages to handle environment variable fallback
            if (message.type === 'authenticate') {
              let token = message.token;
              
              // If no token provided, check for GITHUB_TOKEN environment variable
              if (!token || token.trim() === '') {
                const envToken = process.env.GITHUB_TOKEN;
                if (envToken) {
                  token = envToken;
                  console.warn('⚠️  No GitHub token provided in request - using GITHUB_TOKEN from environment variable');
                  // Update the message with the environment token
                  message.token = token;
                  data = Buffer.from(JSON.stringify(message));
                }
              }
            }
            
            // Call the original listener with potentially modified data
            listener(data);
          } catch (error) {
            // If JSON parsing fails, just pass through the original data
            listener(data);
          }
        };
        
        return originalMessageHandler.call(this, event, wrappedListener);
      }
      
      return originalMessageHandler.call(this, event, listener);
    };
    
    // Call the parent's handleConnection implementation
    this.originalHandleConnection(ws);
  }
}

// Use enhanced WebSocket handler only if GITHUB_TOKEN is available
let wsHandler: CodespaceWebSocketHandler;
if (process.env.GITHUB_TOKEN) {
  console.warn('🔑 GITHUB_TOKEN environment variable detected - enabling automatic token fallback for unauthenticated requests');
  wsHandler = new StandaloneWebSocketHandler();
} else {
  wsHandler = new CodespaceWebSocketHandler();
}

wss.on('connection', wsHandler.handleConnection);

// Start server
httpServer.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`🚀 Terminal Code (tcode) running at ${url}`);
  console.log(`📡 WebSocket available at ws://localhost:${PORT}/`);
  console.log(`Press Ctrl+C to stop`);
  
  // Auto-open browser if not in CI/headless environment
  if (!process.env.CI && !process.env.HEADLESS) {
    open(url).catch(() => {
      console.log(`💡 Open your browser to ${url}`);
    });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});