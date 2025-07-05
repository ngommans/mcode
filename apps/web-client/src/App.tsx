import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import '@mcode/ui-base';
import type { ServerMessage } from '@minimal-terminal-client/shared';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

type Status = 'connected' | 'disconnected' | 'connecting' | 'error';

export function App() {
  const [status, setStatus] = useState<Status>('disconnected');
  const [statusText, setStatusText] = useState('Disconnected');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState('ws://localhost:3002');
  const [githubToken, setGithubToken] = useState('');
  const [codespaces, setCodespaces] = useState([]);
  const [portInfo, setPortInfo] = useState({ ports: [], portCount: 0 });
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const statusBarRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  const requestCodespaces = useCallback(() => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      console.error('Socket not open');
      return;
    }
    socket.current.send(JSON.stringify({ type: 'list_codespaces' }));
  }, []);

  const handleMessage = useCallback((message: ServerMessage) => {
    console.log('Received message:', message);
    switch (message.type) {
      case 'authenticated':
        if (message.success) {
          setStatusText('Authenticated. Listing codespaces...');
          requestCodespaces();
        } else {
          setStatus('error');
          setStatusText('Authentication failed');
        }
        break;
      case 'codespaces_list':
        console.log('App.tsx: Received codespaces_list', message.data);
        setCodespaces(message.data || []);
        break;
      case 'output':
        if (terminalInstance.current && message.data) {
          terminalInstance.current.write(message.data);
        }
        break;
      case 'error':
        setStatus('error');
        setStatusText(message.message || 'An error occurred');
        break;
      case 'codespace_state':
        console.log('App.tsx: Received codespace_state', message);
        setStatusText(`${message.codespace_name}: ${message.state}`);
        if (message.state === 'Connected') {
          setIsModalOpen(false);
        }
        break;
      case 'port_update':
        console.log('App.tsx: Received port_update', message);
        setPortInfo({
          ports: message.ports || [],
          portCount: message.portCount || 0,
        });
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }, [requestCodespaces, setIsModalOpen, setPortInfo]);

  const authenticate = useCallback((token: string) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      console.error('Socket not open for authentication');
      return;
    }
    if (!token) {
      console.error('GitHub token not set');
      setStatus('error');
      setStatusText('GitHub token is missing.');
      return;
    }
    setGithubToken(token);
    socket.current.send(JSON.stringify({ type: 'authenticate', token }));
  }, []);

  const connect = useCallback((serverUrlToConnect: string) => {
    if (socket.current) {
      socket.current.close();
    }

    setServerUrl(serverUrlToConnect);
    setStatus('connecting');
    setStatusText(`Connecting to ${serverUrlToConnect}...`);

    const newSocket = new WebSocket(serverUrlToConnect);

    newSocket.onopen = () => {
      setStatus('connected');
      setStatusText('Connected to server. Ready to authenticate.');
      setReconnectAttempts(0);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    };

    newSocket.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    newSocket.onclose = () => {
      handleReconnect();
    };

    newSocket.onerror = (error) => {
      setStatus('error');
      setStatusText('Connection Error');
      console.error('WebSocket error:', error);
    };

    socket.current = newSocket;
  }, [handleMessage]);

  const handleReconnect = useCallback(() => {
    if (reconnectAttempts < 5) {
      const attempt = reconnectAttempts + 1;
      setReconnectAttempts(attempt);
      setStatusText(`Connection lost. Reconnecting... (Attempt ${attempt}/5)`);
      reconnectTimeout.current = window.setTimeout(() => {
        connect(serverUrl);
      }, 2000);
    } else {
      setStatus('disconnected');
      setStatusText('Disconnected. Click to reconnect.');
      socket.current = null;
    }
  }, [reconnectAttempts, serverUrl, connect]);

  const connectToCodespace = useCallback((codespaceName: string) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      console.error('Socket not open');
      return;
    }
    socket.current.send(JSON.stringify({ type: 'connect_codespace', codespace_name: codespaceName }));
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: 'disconnect_codespace' }));
      socket.current.close();
    }
    setStatus('disconnected');
    setStatusText('Disconnected');
    socket.current = null;
    setCodespaces([]);
    setPortInfo({ ports: [], portCount: 0 });
    setReconnectAttempts(5); // Prevent reconnection after manual disconnect
  }, []);

  useEffect(() => {
    console.log('Terminal useEffect: running');
    if (terminalRef.current && !terminalInstance.current) {
      console.log('Terminal useEffect: initializing terminal');
      const terminal = new Terminal({
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
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalRef.current);
      fitAddon.fit();

      terminalInstance.current = terminal;
      fitAddonInstance.current = fitAddon;

      console.log('Terminal initialized:', terminalInstance.current);

      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          if (entry.target === terminalRef.current && fitAddonInstance.current) {
            fitAddonInstance.current.fit();
            if (socket.current?.readyState === WebSocket.OPEN && terminalInstance.current) {
              socket.current.send(JSON.stringify({
                type: 'resize',
                cols: terminalInstance.current.cols,
                rows: terminalInstance.current.rows
              }));
            }
          }
        }
      });
      resizeObserver.observe(terminalRef.current);

      return () => {
        console.log('Terminal useEffect: cleaning up');
        terminal.dispose();
        resizeObserver.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    if (terminalInstance.current && socket.current) {
      const disposable = terminalInstance.current.onData((data) => {
        if (socket.current?.readyState === WebSocket.OPEN) {
          socket.current.send(JSON.stringify({ type: 'input', data }));
        }
      });
      return () => disposable.dispose();
    }
  }, [socket.current]);

  useEffect(() => {
    return () => {
      socket.current?.close();
    };
  }, []);

  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.isOpen = isModalOpen;

      const handleConnect = (e: Event) => {
        const customEvent = e as CustomEvent<{ serverUrl: string; githubToken: string }>;
        console.log('App.tsx: Received connect event', customEvent.detail);
        connect(customEvent.detail.serverUrl);
        // DO NOT close modal here.
      };

      const handleAuthenticate = (e: Event) => {
        const customEvent = e as CustomEvent<{ githubToken: string }>;
        authenticate(customEvent.detail.githubToken);
        // DO NOT close modal here.
      };

      const handleConnectCodespace = (e: Event) => {
        const customEvent = e as CustomEvent<{ codespaceName: string }>;
        connectToCodespace(customEvent.detail.codespaceName);
        setIsModalOpen(false);
      };

      const handleClose = () => {
        setIsModalOpen(false);
      };

      modalRef.current.addEventListener('connect', handleConnect);
      modalRef.current.addEventListener('authenticate', handleAuthenticate);
      modalRef.current.addEventListener('connect-codespace', handleConnectCodespace);
      modalRef.current.addEventListener('close', handleClose);

      return () => {
        modalRef.current?.removeEventListener('connect', handleConnect);
        modalRef.current?.removeEventListener('authenticate', handleAuthenticate);
        modalRef.current?.removeEventListener('connect-codespace', handleConnectCodespace);
        modalRef.current?.removeEventListener('close', handleClose);
      };
    }
  }, [isModalOpen, connect, authenticate, connectToCodespace]);

  useEffect(() => {
    const statusBarElement = statusBarRef.current;
    const handleOpenModal = () => {
      if (status === 'disconnected' && reconnectAttempts >= 5) {
        connect(serverUrl);
      } else {
        setIsModalOpen(true);
      }
    };
    const handleDisconnect = () => disconnect();

    if (statusBarElement) {
      statusBarElement.addEventListener('open-connection-modal', handleOpenModal);
      statusBarElement.addEventListener('disconnect', handleDisconnect);
      return () => {
        statusBarElement.removeEventListener('open-connection-modal', handleOpenModal);
        statusBarElement.removeEventListener('disconnect', handleDisconnect);
      };
    }
  }, [disconnect, status, reconnectAttempts, serverUrl]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0f0f0f' }}>
      <status-bar 
        ref={statusBarRef}
        status={status} 
        statusText={statusText} 
        portCount={portInfo.portCount}
      >
      </status-bar>
      <connection-modal-codespaces
        ref={modalRef}
        codespaces={codespaces}
      >
      </connection-modal-codespaces>
      <div ref={terminalRef} id="terminal-container" style={{ flexGrow: 1, padding: '0 10px' }}></div>
    </div>
  );
}
