/**
 * Main entry point for the web client application
 */

import { MinimalTerminalClient } from './client/MinimalTerminalClient.js';
import './styles/main.css';

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('App element not found');
  }

  // Create the terminal client
  const terminalClient = new MinimalTerminalClient();
  terminalClient.mount(app);
});

// Handle app installation
let deferredPrompt: any;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  
  // Show install button or similar UI
  console.log('App can be installed');
});

window.addEventListener('appinstalled', () => {
  console.log('App was installed');
  deferredPrompt = null;
});