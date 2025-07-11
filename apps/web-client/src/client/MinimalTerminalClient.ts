/**
 * Main terminal client class - Complete TypeScript implementation
 * Migrated from the legacy HTML/JS implementation
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { ServerMessage, AuthenticatedMessage, CodespacesListMessage, CodespaceStateMessage, PortUpdateMessage } from 'tcode-shared';
import { getDefaultWebSocketUrl } from '../utils/websocket';

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
  private reconnectTimeout: number | null = null;
  
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

  private _getDomElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`DOM element with ID '${id}' not found.`);
    }
    return element as T;
  }

  private _renderHeader(): string {
    return `
      <div class="bg-vscodeSurface border-b border-vscodeBorder px-xl py-sm flex items-center justify-between h-[40px] flex-shrink-0">
        <div class="text-vscodeAccent text-md font-medium">Minimal Terminal Client</div>
        <div class="controls">
          <button class="px-sm py-xs bg-vscodeAccent border-none rounded-md text-white cursor-pointer text-sm hover:bg-vscodeAccentDark" id="clearTerminalButton">Clear</button>
        </div>
      </div>
    `;
  }

  private _renderTerminalContainer(): string {
    return `
      <div class="flex-1 bg-vscodeBg overflow-hidden relative p-sm">
        <div id="terminal" class="h-full w-full"></div>
      </div>
    `;
  }

  private _renderConnectionModal(): string {
    return `
      <div class="connection-modal fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[1000]" id="connectionModal">
        <div class="bg-vscodeSurface p-xl rounded-lg border border-vscodeBorder w-[600px] max-w-[90vw] max-h-[90vh] overflow-y-auto flex flex-col gap-lg relative md:w-[95vw] md:p-md">
          <h3 class="text-white text-xl text-center m-0">Connect to Remote Terminal</h3>
          <button class="absolute top-sm right-sm bg-vscodeInfoBg border-none rounded-sm text-vscodeTextSecondary text-xl cursor-pointer p-xs hover:text-white hover:bg-vscodeInfoBorder" id="closeModalButton">&times;</button>
          
          <div class="flex flex-col gap-sm md:flex-col md:items-stretch">
            <label class="text-white text-sm font-medium mb-1">1. Connect to Server</label>
            <input type="text" class="p-sm bg-vscodeInfoBg border border-vscodeInfoBorder rounded-md text-white text-sm font-inherit focus:outline-none focus:border-vscodeAccent disabled:opacity-50 disabled:cursor-not-allowed" id="serverUrl" value="${getDefaultWebSocketUrl()}" placeholder="Server URL">
            <button class="px-lg py-sm border-none rounded-md cursor-pointer text-sm min-w-[120px] text-center transition-all duration-200 ease-in-out bg-vscodeAccent text-white hover:not(:disabled):bg-vscodeAccentDark disabled:opacity-50 disabled:cursor-not-allowed md:min-w-0" id="connectServerButton">Connect</button>
          </div>

          <div class="flex flex-col gap-sm md:flex-col md:items-stretch">
            <label class="text-white text-sm font-medium mb-1">2. Authenticate</label>
            <input type="password" class="p-sm bg-vscodeInfoBg border border-vscodeInfoBorder rounded-md text-white text-sm font-inherit focus:outline-none focus:border-vscodeAccent disabled:opacity-50 disabled:cursor-not-allowed" id="githubToken" placeholder="GitHub Token" disabled>
            <button class="px-lg py-sm border-none rounded-md cursor-pointer text-sm min-w-[120px] text-center transition-all duration-200 ease-in-out bg-vscodeInfoBg text-vscodeTextSecondary border border-vscodeInfoBorder hover:not(:disabled):bg-vscodeInfoBorder hover:not(:disabled):border-vscodeInfoBorder disabled:opacity-50 disabled:cursor-not-allowed md:min-w-0" id="authenticateButton" disabled>Authenticate</button>
          </div>

          <div class="flex flex-col gap-sm md:flex-col md:items-stretch" id="codespaceSelectionStep" style="display: none;">
            <label class="text-white text-sm font-medium mb-1">3. Select Codespace</label>
            <div id="codespaceList" class="border border-vscodeBorder rounded-md max-h-[200px] overflow-y-auto mt-2"></div>
          </div>

          <div class="flex flex-col gap-sm md:flex-col md:items-stretch" id="shellSelectionStep" style="display: none;">
            <label class="text-white text-sm font-medium mb-1">4. Choose Shell</label>
            <div class="flex gap-md mt-2 md:flex-col md:gap-sm">
              <label class="flex items-center gap-xs text-vscodeTextSecondary cursor-pointer text-sm">
                <input type="radio" name="shellType" value="default" checked class="m-0">
                <span>Default Terminal</span>
              </label>
              <label class="flex items-center gap-xs text-vscodeTextSecondary cursor-pointer text-sm">
                <input type="radio" name="shellType" value="gemini" class="m-0">
                <span>Google Gemini</span>
              </label>
            </div>
            <div id="geminiApiKeyGroup" class="mt-2" style="display: none;">
              <input type="password" class="p-sm bg-vscodeInfoBg border border-vscodeInfoBorder rounded-md text-white text-sm font-inherit focus:outline-none focus:border-vscodeAccent disabled:opacity-50 disabled:cursor-not-allowed" id="geminiApiKey" placeholder="Gemini API Key (optional)">
              <small class="text-vscodeTextTertiary text-sm mt-1 block">API key will be set as GEMINI_API_KEY environment variable</small>
            </div>
          </div>

          <div class="info-box" id="infoBox">
            Welcome! Please connect to the server to begin.
          </div>

          <div class="modal-buttons">
            <button class="px-lg py-sm border-none rounded-md cursor-pointer text-sm min-w-[120px] text-center transition-all duration-200 ease-in-out bg-vscodeInfoBg text-vscodeTextSecondary border border-vscodeInfoBorder hover:not(:disabled):bg-vscodeInfoBorder hover:not(:disabled):border-vscodeInfoBorder disabled:opacity-50 disabled:cursor-not-allowed md:min-w-0" id="closeModalButtonBottom">Close</button>
            <button class="px-lg py-sm border-none rounded-md cursor-pointer text-sm min-w-[120px] text-center transition-all duration-200 ease-in-out bg-vscodeAccent text-white hover:not(:disabled):bg-vscodeAccentDark disabled:opacity-50 disabled:cursor-not-allowed md:min-w-0" id="connectCodespaceButton" disabled>Connect to Codespace</button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderPortDialog(): string {
    return `
      <div id="portDialogOverlay" class="fixed inset-0 bg-black bg-opacity-50 z-[1999] hidden"></div>
      <div id="portDialog" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-vscodeSurface border border-vscodeBorder rounded-lg p-xl w-[500px] max-w-[90vw] max-h-[70vh] z-[2000] shadow-lg hidden md:w-[95vw] md:p-md">
        <h3 class="text-white m-0 mb-lg text-lg">Forwarded Ports</h3>
        <div id="portList" class="max-h-[250px] overflow-y-auto mb-lg">
          <div class="text-vscodeTextTertiary text-center p-xl italic text-sm">No ports are currently forwarded.</div>
        </div>
        <button class="bg-vscodeAccent border-none rounded-md text-white px-lg py-sm cursor-pointer float-right text-sm hover:bg-vscodeAccentDark" id="portDialogCloseButton">Close</button>
      </div>
    `;
  }

  private _renderStatusBar(): string {
    return `
      <div class="fixed bottom-0 left-0 w-full flex flex-row z-[100]">
        <div class="h-[22px] leading-[22px] cursor-default text-white px-sm whitespace-nowrap select-none bg-vscodeAccent flex items-center remote-kind" id="remote-status">
          <a class="text-white no-underline flex items-center gap-xs cursor-pointer hover:bg-black hover:bg-opacity-10" role="button" id="remoteStatusLink">
            <span class="codicon codicon-remote"></span>
            <span id="remote-status-text">Open Remote</span>
          </a>
        </div>

        <div class="h-[22px] leading-[22px] cursor-default text-white px-sm whitespace-nowrap select-none bg-[#3c3c3c] flex items-center" id="status.forwardedPorts">
          <a class="text-gray-100 no-underline flex items-center gap-xs cursor-pointer hover:bg-black hover:bg-opacity-10" role="button" id="forwardedPortsLink">
            <span class="codicon codicon-radio-tower"></span>
            <span id="forwarded-ports-count">0</span>
          </a>
        </div>
      </div>
    `;
  }

  private render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="terminal-app">
        ${this._renderHeader()}
        ${this._renderTerminalContainer()}
        ${this._renderConnectionModal()}
        ${this._renderPortDialog()}
        ${this._renderStatusBar()}
      </div>
    `;
  }

  private init(): void {
    this.initializeTerminal();
    this.setupEventListeners();
    this.showConnectionModal();
  }

  private initializeTerminal(): void {
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
    
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    
    const terminalContainer = this._getDomElement('terminal');
    this.terminal.open(terminalContainer);
    
    setTimeout(() => {
      if (this.fitAddon) {
        this.fitAddon.fit();
      }
    }, 100);
    
    this.terminal.onData((data) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      }
    });
    
    this.setupResizeHandling(terminalContainer);
  }

  private setupResizeHandling(terminalContainer: HTMLElement): void {
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === terminalContainer && this.fitAddon) {
          this.fitAddon.fit();
          
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

    window.addEventListener('resize', () => {
      if (this.fitAddon) {
        this.fitAddon.fit();
        
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
    this._getDomElement<HTMLButtonElement>('clearTerminalButton').addEventListener('click', () => {
      if (this.terminal) {
        this.terminal.clear();
      }
    });

    this._getDomElement<HTMLButtonElement>('connectServerButton').addEventListener('click', () => {
      const serverUrlInput = this._getDomElement<HTMLInputElement>('serverUrl');
      this.connect(serverUrlInput.value);
    });

    this._getDomElement<HTMLButtonElement>('authenticateButton').addEventListener('click', () => {
      const githubTokenInput = this._getDomElement<HTMLInputElement>('githubToken');
      if (githubTokenInput.value) {
        this.authenticate(githubTokenInput.value);
      } else {
        this.updateInfoBox('Please enter a GitHub Token.', true);
      }
    });

    this._getDomElement<HTMLButtonElement>('connectCodespaceButton').addEventListener('click', () => {
      this.connectToSelectedCodespace();
    });

    this._getDomElement<HTMLButtonElement>('closeModalButton').addEventListener('click', () => {
      this.hideConnectionModal();
    });

    this._getDomElement<HTMLButtonElement>('closeModalButtonBottom').addEventListener('click', () => {
      this.hideConnectionModal();
    });

    this._getDomElement<HTMLAnchorElement>('remoteStatusLink').addEventListener('click', () => {
      this.showConnectionModal();
    });

    this._getDomElement<HTMLAnchorElement>('forwardedPortsLink').addEventListener('click', () => {
      this.showPortDialog();
    });

    this._getDomElement<HTMLButtonElement>('portDialogCloseButton').addEventListener('click', () => {
      this.hidePortDialog();
    });

    this._getDomElement<HTMLDivElement>('portDialogOverlay').addEventListener('click', () => {
      this.hidePortDialog();
    });

    this._getDomElement<HTMLInputElement>('serverUrl').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !this._getDomElement<HTMLButtonElement>('connectServerButton').disabled) {
        this._getDomElement<HTMLButtonElement>('connectServerButton').click();
      }
    });

    this._getDomElement<HTMLInputElement>('githubToken').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !this._getDomElement<HTMLButtonElement>('authenticateButton').disabled) {
        this._getDomElement<HTMLButtonElement>('authenticateButton').click();
      }
    });

    // Shell type change handling
    const shellTypeRadios = document.querySelectorAll('input[name="shellType"]');
    shellTypeRadios.forEach(radio => {
      radio.addEventListener('change', this.handleShellTypeChange.bind(this));
    });

    // Handle Enter key in modal (for codespace selection)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this._getDomElement('connectionModal').classList.contains('hidden')) {
        const connectServerButton = this._getDomElement<HTMLButtonElement>('connectServerButton');
        const authenticateButton = this._getDomElement<HTMLButtonElement>('authenticateButton');
        const connectCodespaceButton = this._getDomElement<HTMLButtonElement>('connectCodespaceButton');

        if (!connectServerButton.disabled) {
          connectServerButton.click();
        } else if (!authenticateButton.disabled) {
          authenticateButton.click();
        } else if (!connectCodespaceButton.disabled) {
          connectCodespaceButton.click();
        }
      }
    });
  }

  private handleShellTypeChange(): void {
    const geminiRadio = this._getDomElement<HTMLInputElement>('input[name="shellType"][value="gemini"]');
    const geminiApiKeyGroup = this._getDomElement<HTMLDivElement>('geminiApiKeyGroup');
    
    geminiApiKeyGroup.style.display = geminiRadio.checked ? 'block' : 'none';
  }

  private showConnectionModal(): void {
    this._getDomElement('connectionModal').classList.remove('hidden');
  }

  private hideConnectionModal(): void {
    this._getDomElement('connectionModal').classList.add('hidden');
  }

  private showPortDialog(): void {
    this._getDomElement('portDialogOverlay').classList.remove('hidden');
    this._getDomElement('portDialog').classList.remove('hidden');
    this.updatePortDialog();
  }

  private hidePortDialog(): void {
    this._getDomElement('portDialogOverlay').classList.add('hidden');
    this._getDomElement('portDialog').classList.add('hidden');
  }

  private populateCodespaceList(codespaces: CodespaceItem[]): void {
    const codespaceList = this._getDomElement('codespaceList');
    codespaceList.innerHTML = '';

    if (codespaces.length === 0) {
      codespaceList.innerHTML = '<div class="no-codespaces-message">No codespaces found.</div>';
      return;
    }
    
    codespaces.forEach(codespace => {
      const item = document.createElement('div');
      item.classList.add('p-md', 'cursor-pointer', 'border-b', 'border-vscodeBorder', 'flex', 'flex-col', 'gap-xs', 'text-vscodeTextSecondary', 'transition-colors', 'duration-200', 'ease-in-out', 'hover:bg-vscodeInfoBg');
      item.dataset.name = codespace.name;
      item.dataset.fullName = codespace.repository.full_name;
      item.dataset.state = codespace.state;

      item.innerHTML = `
        <div class="font-medium text-sm">${codespace.name}</div>
        <div class="text-vscodeTextTertiary text-sm">${codespace.repository.full_name}</div>
        <div class="text-sm px-sm py-xs rounded-sm bg-vscodeInfoBorder text-vscodeTextSecondary self-start mt-1 state-${codespace.state.toLowerCase()}">${codespace.state}</div>
      `;

      item.addEventListener('click', () => this.selectCodespace(item));
      codespaceList.appendChild(item);
    });

    const connectCodespaceButton = this._getDomElement<HTMLButtonElement>('connectCodespaceButton');
    connectCodespaceButton.disabled = false;

    const firstCodespace = codespaceList.querySelector('.codespace-item');
    if (firstCodespace) {
      this.selectCodespace(firstCodespace as HTMLElement);
    }
  }

  private selectCodespace(element: HTMLElement): void {
    const allItems = document.querySelectorAll('.codespace-item');
    allItems.forEach(item => item.classList.remove('selected', 'bg-vscodeAccent', 'text-white'));
    element.classList.add('selected', 'bg-vscodeAccent', 'text-white');
  }

  private updatePortDialog(): void {
    const portList = this._getDomElement('portList');

    if (this.portInfo.ports.length === 0) {
      portList.innerHTML = '<div class="text-vscodeTextTertiary text-center p-xl italic text-sm">No ports are currently forwarded.</div>';
      return;
    }

    const portsHtml = this.portInfo.ports.map(port => `
      <div class="bg-vscodeInfoBg border border-vscodeInfoBorder rounded-md p-md mb-sm text-white">
        <div class="flex justify-between items-center mb-sm">
          <span class="font-bold text-vscodeAccent text-md">Port ${port.portNumber}</span>
          <span class="bg-vscodeInfoBorder px-sm py-xs rounded-sm text-vscodeTextSecondary text-sm uppercase">${port.protocol}</span>
        </div>
        <div class="mt-sm">
          ${port.urls.map(url => `<a href="${url}" target="_blank" class="text-vscodeAccent no-underline block mb-xs break-all text-sm p-[2px_0] hover:underline">${url}</a>`).join('')}
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
    const remoteStatusText = this._getDomElement('remote-status-text');
    
    if (message) {
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
    const infoBox = this._getDomElement('infoBox');
    infoBox.textContent = message;
    infoBox.className = `info-box ${isError ? 'error' : ''}`;
  }

  // WebSocket connection methods
  connect(url: string, token = ''): void {
    if (this.socket) {
      this.socket.close();
    }
    
    // Reset reconnect attempts when user manually initiates connection
    this.reconnectAttempts = 0;
    this.isIntentionalDisconnect = false;
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.updateInfoBox('Connecting to server...');
    const connectServerButton = this._getDomElement<HTMLButtonElement>('connectServerButton');
    
    connectServerButton.textContent = 'Connecting...';
    connectServerButton.disabled = true;
    connectServerButton.classList.remove('success', 'error');
    
    try {
      this.socket = new WebSocket(url);
      
      this.socket.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateInfoBox('Successfully connected to server. Please authenticate.');
        
        connectServerButton.textContent = 'Connected';
        connectServerButton.classList.add('success');
        
        const githubTokenInput = this._getDomElement<HTMLInputElement>('githubToken');
        const authenticateButton = this._getDomElement<HTMLButtonElement>('authenticateButton');
        
        githubTokenInput.disabled = false;
        authenticateButton.disabled = false;
        
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
          if (this.terminal) {
            this.terminal.write(event.data);
          }
        }
      };
      
      this.socket.onclose = () => {
        this.isConnected = false;
        this.updateStatus('Disconnected', false);
        this.updateInfoBox('Connection closed.', true);
        
        connectServerButton.textContent = 'Reconnect';
        connectServerButton.classList.remove('success');
        connectServerButton.classList.add('error');
        connectServerButton.disabled = false;
        
        this.resetConnectionUI();
        
        if (!this.isIntentionalDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.addStatusMessage(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          this.reconnectTimeout = setTimeout(() => this.connect(url, this.githubToken || ''), 2000) as any;
        } else if (!this.isIntentionalDisconnect) {
          // Max reconnect attempts reached
          this.addStatusMessage(`Connection failed after ${this.maxReconnectAttempts} attempts`);
          this.updateInfoBox(`Failed to reconnect after ${this.maxReconnectAttempts} attempts. Please check the server and try again.`, true);
        }
        
        // Only reset intentional disconnect flag if it was intentional
        if (this.isIntentionalDisconnect) {
          this.isIntentionalDisconnect = false;
        }
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateStatus('Connection Error', false);
        this.updateInfoBox('Connection error. Please check the server URL and try again.', true);
        
        connectServerButton.textContent = 'Retry';
        connectServerButton.classList.remove('success');
        connectServerButton.classList.add('error');
        connectServerButton.disabled = false;
        
        this.resetConnectionUI();
      };
      
    } catch (error) {
      this.updateInfoBox('Failed to connect. Please check the URL and try again.', true);
      
      connectServerButton.textContent = 'Retry';
      connectServerButton.classList.remove('success');
      connectServerButton.classList.add('error');
      connectServerButton.disabled = false;
      
      this.resetConnectionUI();
    }
  }

  private resetConnectionUI(): void {
    this._getDomElement<HTMLInputElement>('githubToken').disabled = true;
    const authenticateButton = this._getDomElement<HTMLButtonElement>('authenticateButton');
    const connectCodespaceButton = this._getDomElement<HTMLButtonElement>('connectCodespaceButton');
    const codespaceSelectionStep = this._getDomElement<HTMLDivElement>('codespaceSelectionStep');
    const shellSelectionStep = this._getDomElement<HTMLDivElement>('shellSelectionStep');
    
    authenticateButton.textContent = 'Authenticate';
    authenticateButton.classList.remove('success');
    authenticateButton.disabled = true;
    
    connectCodespaceButton.textContent = 'Connect to Codespace';
    connectCodespaceButton.classList.remove('success');
    connectCodespaceButton.disabled = true;
    
    codespaceSelectionStep.style.display = 'none';
    shellSelectionStep.style.display = 'none';
  }

  authenticate(token: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.updateInfoBox('Not connected to server. Please connect first.', true);
      return;
    }
    
    this.githubToken = token;
    const authenticateButton = this._getDomElement<HTMLButtonElement>('authenticateButton');
    
    authenticateButton.textContent = 'Authenticating...';
    authenticateButton.disabled = true;
    
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
    
    const shellTypeRadio = document.querySelector('input[name="shellType"]:checked') as HTMLInputElement;
    const shellType = shellTypeRadio?.value || 'default';
    
    let geminiApiKey = '';
    if (shellType === 'gemini') {
      const geminiApiKeyInput = this._getDomElement<HTMLInputElement>('geminiApiKey');
      geminiApiKey = geminiApiKeyInput.value || '';
    }
    
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.updateInfoBox('Not connected to server.', true);
      return;
    }
    
    this.currentCodespaceName = codespaceName;
    
    const connectCodespaceButton = this._getDomElement<HTMLButtonElement>('connectCodespaceButton');
    connectCodespaceButton.textContent = 'Connecting...';
    connectCodespaceButton.disabled = true;
    
    this.socket.send(JSON.stringify({
      type: 'connect_codespace',
      codespace_name: codespaceName,
      shell_type: shellType,
      gemini_api_key: geminiApiKey
    }));
  }

  private handleMessage(message: ServerMessage): void {
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
        
      case 'error': {
        this.updateInfoBox(message.message || 'An error occurred', true);
        if (this.terminal) {
          this.terminal.writeln(`\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`);
        }
        
        this.resetCodespaceConnection();
        const connectCodespaceButton = this._getDomElement<HTMLButtonElement>('connectCodespaceButton');
        connectCodespaceButton.classList.add('error');
        break;
      }
      default:
        break;
    }
  }

  private handleAuthenticated(message: AuthenticatedMessage): void {
    const authenticateButton = this._getDomElement<HTMLButtonElement>('authenticateButton');
    if (message.success) {
      this.updateInfoBox('Successfully authenticated. Loading codespaces...');
      authenticateButton.textContent = 'Authenticated';
      authenticateButton.classList.add('success');
      this.requestCodespaces();
    } else {
      this.updateInfoBox('Authentication failed. Please check your token.', true);
      authenticateButton.textContent = 'Retry';
      authenticateButton.disabled = false;
    }
  }

  private handleCodespacesList(message: CodespacesListMessage): void {
    const codespaces = message.data || [];
    
    if (codespaces.length === 0) {
      this.updateInfoBox('No codespaces found. Please create one on GitHub first.', true);
      return;
    }
    
    this.updateInfoBox(`Found ${codespaces.length} codespace(s). Please select one to connect.`);
    
    this._getDomElement<HTMLDivElement>('codespaceSelectionStep').style.display = 'block';
    this._getDomElement<HTMLDivElement>('shellSelectionStep').style.display = 'block';
    
    this.populateCodespaceList(codespaces);
  }

  private handleCodespaceState(message: CodespaceStateMessage): void {
    this.currentCodespaceState = message.state;
    this.currentRepositoryFullName = message.repository_full_name;
    
    const statusText = message.repository_full_name || this.currentCodespaceName || 'Codespace';
    const connectCodespaceButton = this._getDomElement<HTMLButtonElement>('connectCodespaceButton');
    
    switch (message.state) {
      case 'Connecting':
        this.updateStatus(`Connecting to ${statusText}`, true);
        connectCodespaceButton.textContent = 'Connecting...';
        connectCodespaceButton.disabled = true;
        connectCodespaceButton.classList.remove('success', 'error');
        break;
        
      case 'Connected':
        this.updateStatus(`Connected to ${statusText}`, true);
        this.hideConnectionModal();
        
        connectCodespaceButton.textContent = 'Disconnect';
        connectCodespaceButton.classList.add('success');
        connectCodespaceButton.classList.remove('error');
        connectCodespaceButton.disabled = false;
        connectCodespaceButton.onclick = () => this.disconnectFromCodespace();
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
        connectCodespaceButton.classList.add('error');
        break;
        
      default:
        this.addStatusMessage(`${statusText}: ${message.state}`);
    }
  }

  private handlePortUpdate(message: PortUpdateMessage): void {
    this.portInfo = {
      ports: message.ports || [],
      portCount: message.portCount || 0,
      timestamp: message.timestamp
    };
    
    const portCountElement = this._getDomElement('forwarded-ports-count');
    portCountElement.textContent = this.portInfo.portCount.toString();
    
    const portDialog = this._getDomElement('portDialog');
    if (!portDialog.classList.contains('hidden')) {
      this.updatePortDialog();
    }
  }

  private updateStatus(text: string, isConnected: boolean): void {
    const remoteStatusText = this._getDomElement('remote-status-text');
    const remoteStatus = this._getDomElement('remote-status');
    
    remoteStatusText.textContent = text;
    
    remoteStatus.className = isConnected 
      ? 'statusbar-item remote-kind connected' 
      : 'statusbar-item remote-kind';
  }

  private resetCodespaceConnection(): void {
    const connectCodespaceButton = this._getDomElement<HTMLButtonElement>('connectCodespaceButton');
    connectCodespaceButton.textContent = 'Connect to Codespace';
    connectCodespaceButton.classList.remove('success', 'error');
    connectCodespaceButton.disabled = false;
    connectCodespaceButton.onclick = () => this.connectToSelectedCodespace();
    
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
    
    this.resetCodespaceConnection();
    this.updateStatus('Disconnected', false);
    
    this.showConnectionModal();
  }

  disconnect(): void {
    this.isIntentionalDisconnect = true;
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
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