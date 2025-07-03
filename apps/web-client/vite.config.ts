/**
 * Vite configuration for the web client
 */

import { defineConfig } from 'vite';
// import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    // TODO: Re-enable PWA plugin after fixing configuration
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   manifest: {
    //     name: 'Minimal Terminal Client',
    //     short_name: 'Terminal Client',
    //     description: 'Terminal client for GitHub Codespaces',
    //     theme_color: '#007acc',
    //     background_color: '#0f0f0f',
    //     display: 'standalone',
    //     scope: '/',
    //     start_url: '/',
    //     icons: []
    //   }
    // })
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
      '@': '/src',
      '@shared': '/../../packages/shared/src'
    }
  }
});