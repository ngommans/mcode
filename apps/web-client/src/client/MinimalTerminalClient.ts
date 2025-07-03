/**
 * Main terminal client class - Complete TypeScript implementation
 * Migrated from the legacy HTML/JS implementation
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { WebSocketMessage, ServerMessage } from '@minimal-terminal-client/shared';

interface PortInfo {
  ports: Array<{
    portNumber: number;
    protocol: string;
    urls: string[];
    accessControl?: string;
    isUserPort: boolean;
  }>;
  portCount: number;
  timestamp?: string;
}

interface CodespaceItem {
  name: string;
  repository: {
    full_name: string;
  };
  state: string;
  web_url?: string;
}

export class MinimalTerminalClient {
  private container: HTMLElement | null = null;
  private terminal: Terminal | null = null;
  private socket: WebSocket | null = null;
  private fitAddon: FitAddon | null = null;
  
  // Connection state
  private isConnected = false;
  private isIntentionalDisconnect = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  // Codespace state
  private currentCodespaceName: string | null = null;
  private currentCodespaceState: string | null = null;
  private currentRepositoryFullName: string | null = null;
  private githubToken: string | null = null;
  
  // Status management
  private statusQueue: string[] = [];
  private isProcessingStatusQueue = false;
  private portInfo: PortInfo = { ports: [], portCount: 0 };

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();
    this.init();
  }

  private render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="terminal-app">
        <div class="header">
          <div class="title">Minimal Terminal Client</div>
          <div class="controls">
            <button class="control-button" id="clearTerminalButton">Clear</button>
          </div>
        </div>
        
        <div class="terminal-container">
          <div id="terminal"></div>
        </div>
        
        <!-- Connection Modal -->
        <div class="connection-modal" id="connectionModal">
          <div class="modal-content">
            <h3 class="modal-title">Connect to Remote Terminal</h3>
            <button class="close-button" id="closeModalButton">&times;</button>
            
            <div class="connection-step">
              <label class="step-label">1. Connect to Server</label>
              <input type="text" class="form-input" id="serverUrl" value="ws://localhost:3002" placeholder="Server URL">
              <button class="step-button primary" id="connectServerButton">Connect</button>
            </div>

            <div class="connection-step">
              <label class="step-label">2. Authenticate</label>
              <input type="password" class="form-input" id="githubToken" placeholder="GitHub Token" disabled>
              <button class="step-button secondary" id="authenticateButton" disabled>Authenticate</button>
            </div>

            <div class="connection-step" id="codespaceSelectionStep" style="display: none;">
              <label class="step-label">3. Select Codespace</label>
              <div id="codespaceList" class="codespace-list"></div>
            </div>

            <div class="connection-step" id="shellSelectionStep" style="display: none;">
              <label class="step-label">4. Choose Shell</label>
              <div class="shell-options">
                <label class="radio-option">
                  <input type="radio" name="shellType" value="default" checked>
                  <span>Default Terminal</span>
                </label>
                <label class="radio-option">
                  <input type="radio" name="shellType" value="gemini">
                  <span>Google Gemini</span>
                </label>
              </div>
              <div id="geminiApiKeyGroup" class="input-group" style="display: none;">
                <input type="password" class="form-input" id="geminiApiKey" placeholder="Gemini API Key (optional)">
                <small class="help-text">API key will be set as GEMINI_API_KEY environment variable</small>
              </div>
            </div>

            <div class="info-box" id="infoBox">
              Welcome! Please connect to the server to begin.
            </div>

            <div class="modal-buttons">
              <button class="step-button secondary" id="closeModalButtonBottom">Close</button>
              <button class="step-button primary" id="connectCodespaceButton" disabled>Connect to Codespace</button>
            </div>
          </div>
        </div>

        <!-- Port Dialog -->
        <div id="portDialogOverlay" class="port-dialog-overlay hidden"></div>
        <div id="portDialog" class="port-dialog hidden">
          <h3>Forwarded Ports</h3>
          <div id="portList" class="port-list">
            <div class="no-ports-message">No ports are currently forwarded.</div>
          </div>
          <button class="dialog-close-button" id="portDialogCloseButton">Close</button>
        </div>

        <!-- Status Bar -->
        <div class="status-bar-container">
          <div class="statusbar-item remote-kind" id="remote-status">
            <a class="statusbar-item-label" role="button" id="remoteStatusLink">
              <span class="codicon codicon-remote"></span>
              <span id="remote-status-text">Open Remote</span>
            </a>
          </div>

          <div class="statusbar-item light-grey" id="status.forwardedPorts">
            <a class="statusbar-item-label" role="button" id="forwardedPortsLink">
              <span class="codicon codicon-radio-tower"></span>
              <span id="forwarded-ports-count">0</span>
            </a>
          </div>
        </div>
      </div>
    `;
  }

  private init(): void {
    this.initializeTerminal();
    this.setupEventListeners();
    this.showConnectionModal();
  }

  private initializeTerminal(): void {
    // Initialize xterm.js terminal
    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      theme: {
        background: '#0f0f0f',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selection: '#ffffff20',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      lineHeight: 1.2
    });
    
    // Initialize fit addon for proper sizing
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    
    // Open terminal in the container
    const terminalContainer = document.getElementById('terminal');
    if (!terminalContainer) {
      throw new Error('Terminal container not found');
    }
    
    this.terminal.open(terminalContainer);
    
    // Delay fit to ensure container has rendered its size
    setTimeout(() => {
      if (this.fitAddon) {
        console.log(`[DEBUG] Before fit: terminalContainer.offsetHeight=${terminalContainer.offsetHeight}, terminalContainer.offsetWidth=${terminalContainer.offsetWidth}`);
        this.fitAddon.fit();
        console.log(`[DEBUG] After fit: cols=${this.terminal?.cols}, rows=${this.terminal?.rows}`);
      }
    }, 100);
    
    // Handle terminal input
    this.terminal.onData((data) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      }
    });
    
    // Handle resize
    this.setupResizeHandling(terminalContainer);
  }

  private setupResizeHandling(terminalContainer: HTMLElement): void {
    // Handle container resize
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === terminalContainer && this.fitAddon) {
          this.fitAddon.fit();
          console.log(`[DEBUG] Terminal resized by ResizeObserver: cols=${this.terminal?.cols}, rows=${this.terminal?.rows}`);
          
          // Send resize event to server
          if (this.socket && this.socket.readyState === WebSocket.OPEN && this.terminal) {
            this.socket.send(JSON.stringify({
              type: 'resize',
              cols: this.terminal.cols,
              rows: this.terminal.rows
            }));
          }
        }
      }
    });
    resizeObserver.observe(terminalContainer);

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.fitAddon) {
        this.fitAddon.fit();
        console.log(`[DEBUG] Terminal resized by window resize: cols=${this.terminal?.cols}, rows=${this.terminal?.rows}`);
        
        // Send resize event to server
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.terminal) {
          this.socket.send(JSON.stringify({
            type: 'resize',
            cols: this.terminal.cols,
            rows: this.terminal.rows
          }));
        }
      }
    });
  }

  private setupEventListeners(): void {
    // Connection modal events
    const connectServerButton = document.getElementById('connectServerButton');
    const authenticateButton = document.getElementById('authenticateButton');
    const connectCodespaceButton = document.getElementById('connectCodespaceButton');
    const closeModalButton = document.getElementById('closeModalButton');
    const closeModalButtonBottom = document.getElementById('closeModalButtonBottom');
    const clearTerminalButton = document.getElementById('clearTerminalButton');
    const serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
    const githubTokenInput = document.getElementById('githubToken') as HTMLInputElement;
    const remoteStatusLink = document.getElementById('remoteStatusLink');
    const forwardedPortsLink = document.getElementById('forwardedPortsLink');
    const portDialogCloseButton = document.getElementById('portDialogCloseButton');

    // Shell type change handling
    const shellTypeRadios = document.querySelectorAll('input[name="shellType"]');
    shellTypeRadios.forEach(radio => {
      radio.addEventListener('change', this.handleShellTypeChange.bind(this));
    });

    // Connect to server
    connectServerButton?.addEventListener('click', () => {
      if (serverUrlInput) {
        this.connect(serverUrlInput.value);
      }
    });

    // Authenticate
    authenticateButton?.addEventListener('click', () => {
      if (githubTokenInput) {
        this.authenticate(githubTokenInput.value);
      }
    });

    // Connect to codespace
    connectCodespaceButton?.addEventListener('click', () => {
      this.connectToSelectedCodespace();
    });

    // Close modal
    closeModalButton?.addEventListener('click', () => {
      this.hideConnectionModal();
    });

    closeModalButtonBottom?.addEventListener('click', () => {
      this.hideConnectionModal();
    });

    // Clear terminal
    clearTerminalButton?.addEventListener('click', () => {
      if (this.terminal) {
        this.terminal.clear();
      }
    });

    // Remote status click
    remoteStatusLink?.addEventListener('click', () => {
      this.showConnectionModal();
    });

    // Forwarded ports click
    forwardedPortsLink?.addEventListener('click', () => {
      this.showPortDialog();
    });

    // Port dialog close
    portDialogCloseButton?.addEventListener('click', () => {
      this.hidePortDialog();
    });

    // Port dialog overlay click
    document.getElementById('portDialogOverlay')?.addEventListener('click', () => {
      this.hidePortDialog();
    });

    // Enter key handling in inputs
    serverUrlInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && connectServerButton && !connectServerButton.disabled) {
        connectServerButton.click();
      }
    });

    githubTokenInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && authenticateButton && !authenticateButton.disabled) {
        authenticateButton.click();
      }
    });
  }

  private handleShellTypeChange(): void {
    const geminiRadio = document.querySelector('input[name="shellType"][value="gemini"]') as HTMLInputElement;
    const geminiApiKeyGroup = document.getElementById('geminiApiKeyGroup');
    
    if (geminiRadio && geminiApiKeyGroup) {
      geminiApiKeyGroup.style.display = geminiRadio.checked ? 'block' : 'none';
    }
  }

  private showConnectionModal(): void {
    const modal = document.getElementById('connectionModal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  private hideConnectionModal(): void {
    const modal = document.getElementById('connectionModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  private showPortDialog(): void {
    const overlay = document.getElementById('portDialogOverlay');
    const dialog = document.getElementById('portDialog');
    
    if (overlay && dialog) {
      overlay.classList.remove('hidden');
      dialog.classList.remove('hidden');
      this.updatePortDialog();
    }
  }

  private hidePortDialog(): void {
    const overlay = document.getElementById('portDialogOverlay');
    const dialog = document.getElementById('portDialog');
    
    if (overlay && dialog) {
      overlay.classList.add('hidden');
      dialog.classList.add('hidden');
    }
  }

  private updatePortDialog(): void {
    const portList = document.getElementById('portList');
    if (!portList) return;

    if (this.portInfo.ports.length === 0) {
      portList.innerHTML = '<div class="no-ports-message">No ports are currently forwarded.</div>';
      return;
    }

    const portsHtml = this.portInfo.ports.map(port => `
      <div class="port-item">
        <div class="port-header">
          <span class="port-number">Port ${port.portNumber}</span>
          <span class="port-protocol">${port.protocol}</span>
        </div>
        <div class="port-urls">
          ${port.urls.map(url => `<a href="${url}" target="_blank" class="port-url">${url}</a>`).join('')}
        </div>
      </div>
    `).join('');

    portList.innerHTML = portsHtml;
  }

  // Status queue management
  private processStatusQueue(): void {
    if (this.statusQueue.length === 0) {
      this.isProcessingStatusQueue = false;
      return;
    }

    this.isProcessingStatusQueue = true;
    const message = this.statusQueue.shift();
    const remoteStatusText = document.getElementById('remote-status-text');
    
    if (remoteStatusText && message) {
      remoteStatusText.textContent = message;
    }

    setTimeout(() => {
      this.processStatusQueue();
    }, 3000);
  }

  private addStatusMessage(message: string): void {
    this.statusQueue.push(message);
    if (!this.isProcessingStatusQueue) {
      this.processStatusQueue();
    }
  }

  private updateInfoBox(message: string, isError = false): void {
    const infoBox = document.getElementById('infoBox');
    if (infoBox) {
      infoBox.textContent = message;
      infoBox.className = `info-box ${isError ? 'error' : ''}`;
    }
  }

  // WebSocket connection methods
  connect(url: string, token = ''): void {
    if (this.socket) {
      this.socket.close();
    }
    
    this.updateInfoBox('Connecting to server...');
    const connectServerButton = document.getElementById('connectServerButton');
    
    if (connectServerButton) {
      connectServerButton.textContent = 'Connecting...';
      connectServerButton.disabled = true;
      connectServerButton.classList.remove('success', 'error');
    }
    
    try {
      this.socket = new WebSocket(url);
      
      this.socket.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateInfoBox('Successfully connected to server. Please authenticate.');
        
        if (connectServerButton) {
          connectServerButton.textContent = 'Connected';
          connectServerButton.classList.add('success');
        }
        
        const githubTokenInput = document.getElementById('githubToken') as HTMLInputElement;
        const authenticateButton = document.getElementById('authenticateButton');
        
        if (githubTokenInput) githubTokenInput.disabled = false;
        if (authenticateButton) authenticateButton.disabled = false;
        
        // Send authentication if provided
        if (token) {
          this.authenticate(token);
        } else if (this.githubToken) {
          this.authenticate(this.githubToken);
        }
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          // Handle raw data
          if (this.terminal) {
            this.terminal.write(event.data);
          }
        }
      };
      
      this.socket.onclose = () => {
        this.isConnected = false;
        this.updateStatus('Disconnected', false);
        this.updateInfoBox('Connection closed.', true);
        
        if (connectServerButton) {
          connectServerButton.textContent = 'Reconnect';
          connectServerButton.classList.remove('success');
          connectServerButton.classList.add('error');
          connectServerButton.disabled = false;
        }
        
        // Reset UI state
        this.resetConnectionUI();
        
        // Auto-reconnect logic
        if (!this.isIntentionalDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.addStatusMessage(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(url, this.githubToken || ''), 2000);
        } else {
          this.isIntentionalDisconnect = false;
        }
      };
      
      this.socket.onerror = (error) => {
        this.updateStatus('Connection Error', false);
        this.updateInfoBox('Connection error. Please check the server URL and try again.', true);
        
        if (connectServerButton) {
          connectServerButton.textContent = 'Retry';
          connectServerButton.classList.remove('success');
          connectServerButton.classList.add('error');
          connectServerButton.disabled = false;
        }
        
        // Reset all connection UI on server connection error
        this.resetConnectionUI();
      };
      
    } catch (error) {
      this.updateInfoBox('Failed to connect. Please check the URL and try again.', true);
      
      if (connectServerButton) {
        connectServerButton.textContent = 'Retry';
        connectServerButton.classList.remove('success');
        connectServerButton.classList.add('error');
        connectServerButton.disabled = false;
      }
      
      // Reset all connection UI on connection failure
      this.resetConnectionUI();
    }
  }

  private resetConnectionUI(): void {
    const githubTokenInput = document.getElementById('githubToken') as HTMLInputElement;
    const authenticateButton = document.getElementById('authenticateButton');
    const connectCodespaceButton = document.getElementById('connectCodespaceButton');
    const codespaceSelectionStep = document.getElementById('codespaceSelectionStep');
    const shellSelectionStep = document.getElementById('shellSelectionStep');
    
    if (githubTokenInput) githubTokenInput.disabled = true;
    if (authenticateButton) {
      authenticateButton.textContent = 'Authenticate';
      authenticateButton.classList.remove('success');
      authenticateButton.disabled = true;
    }
    if (connectCodespaceButton) {
      connectCodespaceButton.textContent = 'Connect to Codespace';
      connectCodespaceButton.classList.remove('success');
      connectCodespaceButton.disabled = true;
    }
    if (codespaceSelectionStep) codespaceSelectionStep.style.display = 'none';
    if (shellSelectionStep) shellSelectionStep.style.display = 'none';
  }

  authenticate(token: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.updateInfoBox('Not connected to server. Please connect first.', true);
      return;
    }
    
    this.githubToken = token;
    const authenticateButton = document.getElementById('authenticateButton');
    
    if (authenticateButton) {
      authenticateButton.textContent = 'Authenticating...';
      authenticateButton.disabled = true;
    }
    
    this.socket.send(JSON.stringify({
      type: 'authenticate',
      token: token
    }));
  }

  private requestCodespaces(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.updateInfoBox('Not connected to server.', true);
      return;
    }
    
    this.socket.send(JSON.stringify({
      type: 'list_codespaces'
    }));
  }

  private connectToSelectedCodespace(): void {
    const selectedCodespace = document.querySelector('.codespace-item.selected') as HTMLElement;
    if (!selectedCodespace) {
      this.updateInfoBox('Please select a codespace to connect to.', true);
      return;
    }
    
    const codespaceName = selectedCodespace.dataset.name;
    if (!codespaceName) return;
    
    // Get shell type selection
    const shellTypeRadio = document.querySelector('input[name="shellType"]:checked') as HTMLInputElement;
    const shellType = shellTypeRadio?.value || 'default';
    
    // Get Gemini API key if Gemini shell is selected
    let geminiApiKey = '';
    if (shellType === 'gemini') {
      const geminiApiKeyInput = document.getElementById('geminiApiKey') as HTMLInputElement;
      geminiApiKey = geminiApiKeyInput?.value || '';
    }
    
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.updateInfoBox('Not connected to server.', true);
      return;
    }
    
    this.currentCodespaceName = codespaceName;
    
    const connectCodespaceButton = document.getElementById('connectCodespaceButton');
    if (connectCodespaceButton) {
      connectCodespaceButton.textContent = 'Connecting...';
      connectCodespaceButton.disabled = true;
    }
    
    this.socket.send(JSON.stringify({
      type: 'connect_codespace',
      codespace_name: codespaceName,
      shell_type: shellType,
      gemini_api_key: geminiApiKey
    }));
  }

  private handleMessage(message: ServerMessage): void {
    console.log('Received message:', message);
    
    switch (message.type) {
      case 'authenticated':
        this.handleAuthenticated(message);
        break;
        
      case 'codespaces_list':
        this.handleCodespacesList(message);
        break;
        
      case 'codespace_state':
        this.handleCodespaceState(message);
        break;
        
      case 'output':
        if (this.terminal && message.data) {
          this.terminal.write(message.data);
        }
        break;
        
      case 'port_update':
        this.handlePortUpdate(message);
        break;
        
      case 'error':
        this.updateInfoBox(message.message || 'An error occurred', true);
        if (this.terminal) {
          this.terminal.writeln(`\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`);
        }
        
        // Reset connection buttons on error
        this.resetCodespaceConnection();
        const connectCodespaceButton = document.getElementById('connectCodespaceButton');
        if (connectCodespaceButton) {
          connectCodespaceButton.classList.add('error');
        }
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private handleAuthenticated(message: any): void {
    if (message.success) {
      this.updateInfoBox('Successfully authenticated. Loading codespaces...');
      
      const authenticateButton = document.getElementById('authenticateButton');
      if (authenticateButton) {
        authenticateButton.textContent = 'Authenticated';
        authenticateButton.classList.add('success');
      }
      
      // Request codespaces list
      this.requestCodespaces();
    } else {
      this.updateInfoBox('Authentication failed. Please check your token.', true);
      
      const authenticateButton = document.getElementById('authenticateButton');
      if (authenticateButton) {
        authenticateButton.textContent = 'Retry';
        authenticateButton.disabled = false;
      }
    }
  }

  private handleCodespacesList(message: any): void {
    const codespaces = message.data || [];
    
    if (codespaces.length === 0) {
      this.updateInfoBox('No codespaces found. Please create one on GitHub first.', true);
      return;
    }
    
    this.updateInfoBox(`Found ${codespaces.length} codespace(s). Please select one to connect.`);
    
    // Show codespace selection step
    const codespaceSelectionStep = document.getElementById('codespaceSelectionStep');
    const shellSelectionStep = document.getElementById('shellSelectionStep');
    
    if (codespaceSelectionStep) codespaceSelectionStep.style.display = 'block';
    if (shellSelectionStep) shellSelectionStep.style.display = 'block';
    
    // Populate codespace list
    this.populateCodespaceList(codespaces);
  }

  private populateCodespaceList(codespaces: CodespaceItem[]): void {
    const codespaceList = document.getElementById('codespaceList');
    if (!codespaceList) return;
    
    const codespaceItems = codespaces.map(codespace => `
      <div class="codespace-item" data-name="${codespace.name}" onclick="selectCodespace(this)">
        <div class="codespace-name">${codespace.name}</div>
        <div class="codespace-repo">${codespace.repository.full_name}</div>
        <div class="codespace-state state-${codespace.state.toLowerCase()}">${codespace.state}</div>
      </div>
    `).join('');
    
    codespaceList.innerHTML = codespaceItems;
    
    // Enable connect button after selection
    const connectCodespaceButton = document.getElementById('connectCodespaceButton');
    if (connectCodespaceButton) {
      connectCodespaceButton.disabled = false;
    }
    
    // Auto-select first available codespace
    const firstCodespace = codespaceList.querySelector('.codespace-item');
    if (firstCodespace) {
      (window as any).selectCodespace(firstCodespace);
    }
  }

  private handleCodespaceState(message: any): void {
    this.currentCodespaceState = message.state;
    this.currentRepositoryFullName = message.repository_full_name;
    
    const statusText = message.repository_full_name || this.currentCodespaceName || 'Codespace';
    const connectCodespaceButton = document.getElementById('connectCodespaceButton');
    
    switch (message.state) {
      case 'Connecting':
        this.updateStatus(`Connecting to ${statusText}`, true);
        if (connectCodespaceButton) {
          connectCodespaceButton.textContent = 'Connecting...';
          connectCodespaceButton.disabled = true;
          connectCodespaceButton.classList.remove('success', 'error');
        }
        break;
        
      case 'Connected':
        this.updateStatus(`Connected to ${statusText}`, true);
        this.hideConnectionModal();
        
        if (connectCodespaceButton) {
          connectCodespaceButton.textContent = 'Disconnect';
          connectCodespaceButton.classList.add('success');
          connectCodespaceButton.classList.remove('error');
          connectCodespaceButton.disabled = false;
          // Change the button to disconnect mode
          connectCodespaceButton.onclick = () => this.disconnectFromCodespace();
        }
        break;
        
      case 'Disconnected':
      case 'Shutdown':
        this.updateStatus('Disconnected', false);
        this.resetCodespaceConnection();
        break;
        
      case 'Error':
      case 'Failed':
        this.updateStatus('Connection Failed', false);
        this.resetCodespaceConnection();
        if (connectCodespaceButton) {
          connectCodespaceButton.classList.add('error');
        }
        break;
        
      default:
        this.addStatusMessage(`${statusText}: ${message.state}`);
    }
  }

  private handlePortUpdate(message: any): void {
    this.portInfo = {
      ports: message.ports || [],
      portCount: message.portCount || 0,
      timestamp: message.timestamp
    };
    
    // Update port count in status bar
    const portCountElement = document.getElementById('forwarded-ports-count');
    if (portCountElement) {
      portCountElement.textContent = this.portInfo.portCount.toString();
    }
    
    // Update port dialog if it's open
    const portDialog = document.getElementById('portDialog');
    if (portDialog && !portDialog.classList.contains('hidden')) {
      this.updatePortDialog();
    }
  }

  private updateStatus(text: string, isConnected: boolean): void {
    const remoteStatusText = document.getElementById('remote-status-text');
    const remoteStatus = document.getElementById('remote-status');
    
    if (remoteStatusText) {
      remoteStatusText.textContent = text;
    }
    
    if (remoteStatus) {
      remoteStatus.className = isConnected 
        ? 'statusbar-item remote-kind connected' 
        : 'statusbar-item remote-kind';
    }
  }

  private resetCodespaceConnection(): void {
    const connectCodespaceButton = document.getElementById('connectCodespaceButton');
    if (connectCodespaceButton) {
      connectCodespaceButton.textContent = 'Connect to Codespace';
      connectCodespaceButton.classList.remove('success', 'error');
      connectCodespaceButton.disabled = false;
      // Reset to connect mode
      connectCodespaceButton.onclick = () => this.connectToSelectedCodespace();
    }
    
    // Reset codespace state
    this.currentCodespaceName = null;
    this.currentCodespaceState = null;
    this.currentRepositoryFullName = null;
  }

  private disconnectFromCodespace(): void {
    this.isIntentionalDisconnect = true;
    
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'disconnect_codespace'
      }));
    }
    
    // Reset the UI immediately
    this.resetCodespaceConnection();
    this.updateStatus('Disconnected', false);
    
    // Show connection modal again for new connections
    this.showConnectionModal();
  }

  disconnect(): void {
    this.isIntentionalDisconnect = true;
    
    if (this.socket) {
      this.socket.send(JSON.stringify({
        type: 'disconnect_codespace'
      }));
      
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
    
    this.updateStatus('Disconnected', false);
    this.resetCodespaceConnection();
  }
}

// Global functions for HTML event handlers
(window as any).selectCodespace = (element: HTMLElement) => {
  // Remove selection from all items
  const allItems = document.querySelectorAll('.codespace-item');
  allItems.forEach(item => item.classList.remove('selected'));
  
  // Add selection to clicked item
  element.classList.add('selected');
};