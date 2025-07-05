/**
 * Vite configuration for the web client
 */

import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

export default defineConfig({
  plugins: [
    preact(),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  server: {
    port: 8080,
    host: true,
    cors: true
  },
  preview: {
    port: 8080,
    host: true,
    cors: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    }
  }
});