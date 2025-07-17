import type { VNode } from 'preact';
import { useState, useEffect } from 'preact/hooks';

type Status = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';

interface StatusBarProps {
  status: Status;
  statusText?: string;
  portCount: number;
  branchName?: string;
  repositoryName?: string;
  isConnectedToCodespace?: boolean;
  gitStatus?: { ahead?: number; behind?: number };
  onOpenConnectionModal: () => void;
  onDisconnect: () => void;
  onOpenPortsDialog: () => void;
  onOpenBranchDialog: () => void;
}

// Map statuses to VS Code theme colors and correct Codicons
const statusConfig = {
  connected: {
    bgColor: '#007acc',
    iconColor: '#ffffff',
    textColor: '#ffffff',
    icon: 'codicon-remote',
    text: 'Connected',
  },
  disconnected: {
    bgColor: '#2d2d2d',
    iconColor: '#cccccc',
    textColor: '#cccccc',
    icon: 'codicon-remote',
    text: 'Open Connection',
  },
  connecting: {
    bgColor: '#2d2d2d',
    iconColor: '#ffd43b',
    textColor: '#cccccc',
    icon: 'codicon-sync',
    text: 'Connecting...',
    spin: true,
  },
  reconnecting: {
    bgColor: '#2d2d2d',
    iconColor: '#ffd43b',
    textColor: '#cccccc',
    icon: 'codicon-sync',
    text: 'Reconnecting...',
    spin: true,
  },
  error: {
    bgColor: '#2d2d2d',
    iconColor: '#ff6b6b',
    textColor: '#cccccc',
    icon: 'codicon-error',
    text: 'Error',
  },
};

export function StatusBar({
  status,
  statusText,
  portCount,
  branchName = 'main',
  gitStatus,
  onOpenConnectionModal,
  onDisconnect,
  onOpenPortsDialog,
  onOpenBranchDialog,
}: StatusBarProps): VNode {
  const config = statusConfig[status] || statusConfig.disconnected;
  const displayText = statusText || config.text;

  // Theme toggle state
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Initialize theme from document attribute
  useEffect(() => {
    const htmlElement = document.querySelector('html');
    const currentTheme = htmlElement?.getAttribute('data-theme');
    setIsDarkMode(currentTheme === 'vscode' || currentTheme === null);
  }, []);

  // Toggle theme function
  const toggleTheme = () => {
    const htmlElement = document.querySelector('html');
    const newTheme = isDarkMode ? 'vscode-light' : 'vscode';
    htmlElement?.setAttribute('data-theme', newTheme);
    setIsDarkMode(!isDarkMode);
  };

  const handleStatusClick = () => {
    if (status === 'disconnected' || status === 'error') {
      onOpenConnectionModal();
    } else if (status === 'connected') {
      onDisconnect();
    }
  };

  const handleBranchClick = () => {
    onOpenBranchDialog();
  };

  const handleNetworkClick = () => {
    onOpenPortsDialog();
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Preact JSX elements are properly typed but ESLint can't infer this
  return (
    <div className="flex items-center bg-neutral text-secondary-content font-mono text-xs h-9 w-full">
      {/* Left side: Connection, Branch, and Ports buttons connected */}
      <div className="flex items-center">
        <button
          className="flex items-center gap-2 px-3 py-1 h-9 border-r border-base-300 hover:bg-base-300"
          onClick={handleStatusClick}
          style={{
            backgroundColor: config.bgColor,
            color: config.textColor,
          }}
        >
          <i
            className={`codicon ${config.icon}${(config as { spin?: boolean }).spin ? ' animate-spin' : ''}`}
            style={{ color: config.iconColor }}
          ></i>
          <span>{displayText}</span>
        </button>

        {gitStatus && (
          <button
            className="flex items-center gap-2 px-3 py-1 h-9 bg-info hover:bg-base-300 border-r border-base-300"
            onClick={handleBranchClick}
          >
            <i className="codicon codicon-git-branch"></i>
            <span className="flex items-center gap-1">
              <span>{branchName}</span>
              {gitStatus?.behind !== undefined && (
                <span className="flex items-center gap-0.5">
                  {gitStatus.behind}
                  <i className="codicon codicon-arrow-down text-xs"></i>
                </span>
              )}
              {gitStatus?.ahead !== undefined && gitStatus.ahead > 0 && (
                <span className="flex items-center gap-0.5">
                  {gitStatus.ahead}
                  <i className="codicon codicon-arrow-up text-xs"></i>
                </span>
              )}
            </span>
          </button>
        )}

        {portCount > 0 && (
          <button
            className="flex items-center gap-2 px-3 py-1 h-9 bg-info hover:bg-base-300 border-r border-base-300"
            onClick={handleNetworkClick}
          >
            <i className="codicon codicon-radio-tower"></i>
            <span>{portCount}</span>
          </button>
        )}
      </div>

      {/* Right side: Theme toggle button */}
      <div className="flex-1"></div>
      <button
        className="flex items-center justify-center px-2 py-1 h-9 bg-info hover:bg-base-300 border-l border-base-300"
        onClick={toggleTheme}
        title={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
        style={{ zIndex: 1000 }}
      >
        <i className={`codicon ${isDarkMode ? 'codicon-circle-large-outline' : 'codicon-circle-large-filled'}`}></i>
      </button>
    </div>
  );
}
