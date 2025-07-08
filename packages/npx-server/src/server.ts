#!/usr/bin/env node

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the web-client dist directory
const staticPath = join(__dirname, '..', 'static');
app.use(express.static(staticPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(join(staticPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`🚀 Terminal Code (tcode) running at ${url}`);
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