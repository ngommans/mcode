import { h } from 'preact';

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
  connected: { bgColor: '#007acc', iconColor: '#ffffff', textColor: '#ffffff', icon: 'codicon-remote', text: 'Connected' },
  disconnected: { bgColor: '#2d2d2d', iconColor: '#cccccc', textColor: '#cccccc', icon: 'codicon-remote', text: 'Open Connection' },
  connecting: { bgColor: '#2d2d2d', iconColor: '#ffd43b', textColor: '#cccccc', icon: 'codicon-sync', text: 'Connecting...', spin: true },
  reconnecting: { bgColor: '#2d2d2d', iconColor: '#ffd43b', textColor: '#cccccc', icon: 'codicon-sync', text: 'Reconnecting...', spin: true },
  error: { bgColor: '#2d2d2d', iconColor: '#ff6b6b', textColor: '#cccccc', icon: 'codicon-error', text: 'Error' },
};

export function StatusBar({ 
  status, 
  statusText, 
  portCount, 
  branchName = 'main',
  repositoryName,
  isConnectedToCodespace = false,
  gitStatus,
  onOpenConnectionModal,
  onDisconnect,
  onOpenPortsDialog,
  onOpenBranchDialog
}: StatusBarProps) {
  const config = statusConfig[status] || statusConfig.disconnected;
  const displayText = statusText || config.text;
  

  const handleStatusClick = () => {
    console.log('StatusBar: handleStatusClick called, status:', status);
    if (status === 'disconnected' || status === 'error') {
      console.log('StatusBar: Calling onOpenConnectionModal');
      onOpenConnectionModal();
    } else if (status === 'connected') {
      console.log('StatusBar: Calling onDisconnect');
      onDisconnect();
    }
  };

  const handleBranchClick = () => {
    console.log('Branch button clicked');
    onOpenBranchDialog();
  };

  const handleNetworkClick = () => {
    console.log('Network button clicked');
    onOpenPortsDialog();
  };

  return (
    <div className="flex items-center bg-[#252526] text-[#cccccc] font-mono text-xs h-9 w-full">
      {/* Left side: Connection, Branch, and Ports buttons connected */}
      <div className="flex items-center">
        <button 
          className="flex items-center gap-2 px-3 py-1 h-9 border-r border-[#333] hover:bg-[#404040]"
          onClick={handleStatusClick}
          style={{ 
            backgroundColor: config.bgColor,
            color: config.textColor
          }}
        >
          <i 
            className={`codicon ${config.icon}${config.spin ? ' animate-spin' : ''}`}
            style={{ color: config.iconColor }}
          ></i>
          <span>{displayText}</span>
        </button>
        
        {gitStatus && (
          <button 
            className="flex items-center gap-2 px-3 py-1 h-9 bg-[#2d2d2d] hover:bg-[#404040] border-r border-[#333]"
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
            className="flex items-center gap-2 px-3 py-1 h-9 bg-[#2d2d2d] hover:bg-[#404040] border-r border-[#333]"
            onClick={handleNetworkClick}
          >
            <i className="codicon codicon-radio-tower"></i>
            <span>{portCount}</span>
          </button>
        )}
      </div>

      {/* Right side: Spacer */}
      <div className="flex-1"></div>
    </div>
  );
}