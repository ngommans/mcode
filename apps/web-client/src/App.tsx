import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { VNode } from 'preact';
import type { ServerMessage, Codespace, ForwardedPort } from 'tcode-shared';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { StatusBar } from './components/StatusBar';
import { ConnectionModal } from './components/ConnectionModal';
import { PortsDialog } from './components/PortsDialog';
import { BranchDialog, type BranchInfo } from './components/BranchDialog';
import { getAccessiblePortCount, type Port } from './utils/portUtils';
import { getDefaultWebSocketUrl } from './utils/websocket';
import { parseWebSocketMessage } from './utils/typeSafeData';

type Status = 'connected' | 'disconnected' | 'connecting' | 'error';

function codespaceTobranchInfo(codespace: Codespace): BranchInfo {
  return {
    repository: {
      id: codespace.repository.id,
      name: codespace.repository.name,
      full_name: codespace.repository.full_name,
      html_url: codespace.repository.html_url,
      fork: false, // Default values since not available in Codespace
      private: false,
    },
    git_status: codespace.git_status,
    last_used_at: codespace.last_used_at,
    created_at: codespace.created_at,
    display_name: codespace.display_name ?? undefined, // Convert null to undefined
    state: codespace.state,
  };
}

function forwardedPortToPort(forwardedPort: ForwardedPort): Port {
  return {
    portNumber: forwardedPort.portNumber,
    protocol: forwardedPort.protocol,
    urls: forwardedPort.urls,
    labels: [], // ForwardedPort doesn't have labels
    accessControl: forwardedPort.accessControl as unknown as Record<string, unknown>,
  };
}

export function App(): VNode {
  const [status, setStatus] = useState<Status>('disconnected');
  const [statusText, setStatusText] = useState('Disconnected');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPortsDialogOpen, setIsPortsDialogOpen] = useState(false);
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [authenticationStatus, setAuthenticationStatus] = useState<string>('unauthenticated');
  const [currentCodespace, setCurrentCodespace] = useState<BranchInfo | null>(null);
  const [serverUrl, setServerUrl] = useState(getDefaultWebSocketUrl());
  const [codespaces, setCodespaces] = useState<Codespace[]>([]);
  const [portInfo, setPortInfo] = useState<{ ports: Port[]; portCount: number }>({
    ports: [],
    portCount: 0,
  });
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);
  const isManualDisconnect = useRef<boolean>(false);
  const reconnectAttempt = useRef<number>(0); // New: Track reconnection attempts
  const connectRef = useRef<((url: string) => void) | null>(null);

  const requestCodespaces = useCallback(() => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      console.error('Socket not open');
      return;
    }
    socket.current.send(JSON.stringify({ type: 'list_codespaces' }));
  }, []);

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'authenticated':
          if (message.success) {
            setStatusText('Authenticated');
            setAuthenticationStatus('authenticated');
            // Auto-update status after 2 seconds
            setTimeout(() => {
              setStatusText('Listing available codespaces...');
              requestCodespaces();
            }, 2000);
          } else {
            setStatus('error');
            setStatusText('Authentication failed');
            setAuthenticationStatus('failed');
          }
          break;
        case 'codespaces_list': {
          // Log the first codespace to see available properties
          if (message.data && message.data.length > 0) {
            // Set the first codespace as current for branch dialog data
            setCurrentCodespace(codespaceTobranchInfo(message.data[0]));
          }
          setCodespaces(message.data || []);
          const count = message.data?.length || 0;
          setStatusText(`Codespaces found: ${count} - Open a codespace`);
          break;
        }
        case 'output':
          if (terminalInstance.current && message.data) {
            terminalInstance.current.write(message.data);
          }
          break;
        case 'error':
          setStatus('error');
          setStatusText(message.message || 'An error occurred');
          break;
        case 'codespace_state': {
          const displayName =
            message.codespace_data?.display_name ||
            message.codespace_data?.repository?.full_name ||
            message.codespace_name?.replace(/-/g, ' ');
          const stateText =
            message.state === 'Starting'
              ? 'Getting session ready...'
              : message.state === 'Unavailable'
                ? 'Codespace unavailable, retrying...'
                : message.state === 'Available'
                  ? 'Codespace available, connecting...'
                  : message.state === 'Connected'
                    ? 'Ready'
                    : `${displayName}: ${message.state}`;

          // Special handling for Connected state
          if (message.state === 'Connected') {
            // Show "Ready" for 1 second, then close modal and show final status
            setTimeout(() => {
              const finalDisplayName = currentCodespace?.display_name || displayName;
              setStatusText(`Codespaces: ${finalDisplayName}`);
              setIsModalOpen(false);
            }, 1000);
          }
          setStatusText(stateText);
          // Store codespace data for branch dialog
          if (message.codespace_data) {
            setCurrentCodespace(codespaceTobranchInfo(message.codespace_data as Codespace));
          }
          // Only close modal when fully connected (handled above with timeout)
          if (message.state === 'Connected') {
            setStatus('connected');
            // Modal closing handled above with timeout
          } else if (
            message.state === 'Starting' ||
            message.state === 'Unavailable' ||
            message.state === 'Available'
          ) {
            setStatus('connecting');
          }
          break;
        }
        case 'port_update': {
          const convertedPorts = (message.ports || []).map(forwardedPortToPort);
          setPortInfo({
            ports: convertedPorts,
            portCount: getAccessiblePortCount(convertedPorts),
          });
          break;
        }
        default:
          break;
      }
    },
    [requestCodespaces, setIsModalOpen, setPortInfo, currentCodespace?.display_name]
  );

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
    socket.current.send(JSON.stringify({ type: 'authenticate', token }));
  }, []);

  const handleReconnect = useCallback(() => {
    // Don't reconnect if it was a manual disconnect
    if (isManualDisconnect.current) {
      isManualDisconnect.current = false;
      return;
    }

    const INITIAL_RECONNECT_DELAY = 1000; // 1 second
    const MAX_RECONNECT_DELAY = 30000; // 30 seconds
    const MAX_RECONNECT_ATTEMPTS = 10; // Max 10 attempts

    reconnectAttempt.current++;

    if (reconnectAttempt.current <= MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(
        MAX_RECONNECT_DELAY,
        INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempt.current - 1)
      );
      setStatusText(
        `Connection lost. Reconnecting... (Attempt ${reconnectAttempt.current}/${MAX_RECONNECT_ATTEMPTS}) in ${delay / 1000}s`
      );
      reconnectTimeout.current = window.setTimeout(() => {
        const currentUrl = serverUrl;
        connectRef.current?.(currentUrl);
      }, delay);
    } else {
      setStatus('disconnected');
      setStatusText('Disconnected. Click to reconnect.');
      setConnectionStatus('disconnected');
      socket.current = null;
      reconnectAttempt.current = 0; // Reset attempts after giving up
    }
  }, [serverUrl]);

  // Store the terminal input disposable to clean up properly
  const inputDisposable = useRef<{ dispose: () => void } | null>(null);

  // Function to set up terminal input handler
  const setupTerminalInputHandler = useCallback(() => {
    if (terminalInstance.current && socket.current?.readyState === WebSocket.OPEN) {
      // Clean up existing handler first
      if (inputDisposable.current) {
        inputDisposable.current.dispose();
      }

      const disposable = terminalInstance.current.onData((data) => {
        if (socket.current?.readyState === WebSocket.OPEN) {
          socket.current.send(JSON.stringify({ type: 'input', data }));
        }
      });

      inputDisposable.current = disposable;
      return disposable;
    }
    return null;
  }, []);

  // Clean up input handler on unmount
  useEffect(() => {
    return () => {
      if (inputDisposable.current) {
        inputDisposable.current.dispose();
        inputDisposable.current = null;
      }
    };
  }, []);

  const connect = useCallback(
    (serverUrlToConnect: string) => {
      if (socket.current) {
        socket.current.close();
      }

      // Reset manual disconnect flag when starting a new connection
      isManualDisconnect.current = false;

      setServerUrl(serverUrlToConnect);
      setStatus('connecting');
      setStatusText(`Connecting to ${serverUrlToConnect}...`);

      const newSocket = new WebSocket(serverUrlToConnect);

      newSocket.onopen = () => {
        setStatus('connected');
        setStatusText('Connected to server');
        setConnectionStatus('connected');
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
        reconnectAttempt.current = 0; // Reset attempts on successful connection

        // Set up terminal input handler now that socket is connected
        setupTerminalInputHandler();

        // Auto-update status after 2 seconds
        setTimeout(() => {
          setStatusText('Authenticate with GitHub');
        }, 2000);
      };

      newSocket.onmessage = (event) => {
        const message = parseWebSocketMessage(event.data);
        if (message) {
          handleMessage(message);
        }
      };

      newSocket.onclose = () => {
        // Clean up input handler when socket closes
        if (inputDisposable.current) {
          inputDisposable.current.dispose();
          inputDisposable.current = null;
        }
        handleReconnect();
      };

      newSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus('error');
        setStatusText('Connection Error');
        handleReconnect();
      };

      socket.current = newSocket;
    },
    [handleMessage, handleReconnect, setupTerminalInputHandler]
  );

  // Store connect function in ref for handleReconnect to use (after connect is defined)
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const connectToCodespace = useCallback((codespaceName: string) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      console.error('Socket not open');
      return;
    }
    socket.current.send(
      JSON.stringify({ type: 'connect_codespace', codespace_name: codespaceName })
    );
  }, []);

  const disconnect = useCallback(() => {
    // Set flag to prevent reconnection
    isManualDisconnect.current = true;

    // Clean up input handler
    if (inputDisposable.current) {
      inputDisposable.current.dispose();
      inputDisposable.current = null;
    }

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
    setConnectionStatus('disconnected');
    setAuthenticationStatus('unauthenticated');
    socket.current = null;
    setCodespaces([]);
    setPortInfo({ ports: [], portCount: 0 });
  }, []);

  useEffect(() => {
    if (terminalRef.current && !terminalInstance.current) {
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        theme: {
          background: '#0f0f0f',
          foreground: '#ffffff',
          cursor: '#ffffff',
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
          brightWhite: '#e5e5e5',
        },
        fontSize: 14,
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        lineHeight: 1.2,
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalRef.current);
      fitAddon.fit();

      terminalInstance.current = terminal;
      fitAddonInstance.current = fitAddon;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === terminalRef.current && fitAddonInstance.current) {
            fitAddonInstance.current.fit();
            if (socket.current?.readyState === WebSocket.OPEN && terminalInstance.current) {
              socket.current.send(
                JSON.stringify({
                  type: 'resize',
                  cols: terminalInstance.current.cols,
                  rows: terminalInstance.current.rows,
                })
              );
            }
          }
        }
      });
      resizeObserver.observe(terminalRef.current);

      return () => {
        terminal.dispose();
        resizeObserver.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    return () => {
      socket.current?.close();
    };
  }, []);

  // Event handlers for the new Preact components
  const handleOpenConnectionModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // Auto-open connection modal when disconnected
  useEffect(() => {
    if (status === 'disconnected' && !isModalOpen) {
      setIsModalOpen(true);
    }
  }, [status, isModalOpen]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const handleModalConnect = useCallback(
    (serverUrl_hmc: string, githubToken: string) => {
      setStatusText('Connecting to server...');
      connect(serverUrl_hmc);
      // DO NOT close modal here.
      if (githubToken) {
        // Wait for connection to establish before authenticating
        setTimeout(() => authenticate(githubToken), 1000);
      }
    },
    [connect, authenticate]
  );

  const handleModalAuthenticate = useCallback(
    (githubToken: string) => {
      setStatusText('Authenticating with GitHub...');
      authenticate(githubToken);
      // DO NOT close modal here.
    },
    [authenticate]
  );

  const handleModalConnectCodespace = useCallback(
    (codespaceName: string) => {
      // Find the codespace to get its display name
      const selectedCodespace = codespaces.find((cs: Codespace) => cs.name === codespaceName);
      const displayName =
        selectedCodespace?.display_name ||
        selectedCodespace?.repository?.full_name ||
        codespaceName;
      setStatusText(`Opening codespace ${displayName}...`);
      connectToCodespace(codespaceName);
      // Don't close modal - let codespace_state handler close it when Connected
    },
    [connectToCodespace, codespaces]
  );

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleOpenPortsDialog = useCallback(() => {
    setIsPortsDialogOpen(true);
  }, []);

  const handlePortsDialogClose = useCallback(() => {
    setIsPortsDialogOpen(false);
  }, []);

  const handlePortsRefresh = useCallback(() => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: 'refresh_ports' }));
    }
  }, []);

  const handleOpenBranchDialog = useCallback(() => {
    setIsBranchDialogOpen(true);
  }, []);

  const handleBranchDialogClose = useCallback(() => {
    setIsBranchDialogOpen(false);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Preact JSX elements are properly typed but ESLint can't infer this
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#0f0f0f',
      }}
    >
      <StatusBar
        status={status}
        statusText={statusText}
        portCount={portInfo.portCount}
        branchName={currentCodespace?.git_status?.ref || 'main'}
        gitStatus={currentCodespace?.git_status}
        onOpenConnectionModal={handleOpenConnectionModal}
        onDisconnect={handleDisconnect}
        onOpenPortsDialog={handleOpenPortsDialog}
        onOpenBranchDialog={handleOpenBranchDialog}
      />
      <ConnectionModal
        isOpen={isModalOpen}
        codespaces={codespaces}
        onConnect={handleModalConnect}
        onAuthenticate={handleModalAuthenticate}
        onConnectCodespace={handleModalConnectCodespace}
        onClose={handleModalClose}
        connectionStatus={connectionStatus}
        authenticationStatus={authenticationStatus}
        statusText={statusText}
      />
      <PortsDialog
        isOpen={isPortsDialogOpen}
        portInfo={portInfo}
        onClose={handlePortsDialogClose}
        onRefresh={handlePortsRefresh}
      />
      <BranchDialog
        isOpen={isBranchDialogOpen}
        branchInfo={currentCodespace ?? undefined}
        onClose={handleBranchDialogClose}
      />
      <div
        ref={terminalRef}
        id="terminal-container"
        style={{ flexGrow: 1, padding: '0 10px' }}
      ></div>
    </div>
  );
}
