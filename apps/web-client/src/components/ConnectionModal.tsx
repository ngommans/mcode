import { useState, useEffect } from 'preact/hooks';
import type { VNode, JSX } from 'preact';
import type { Codespace } from 'tcode-shared';
import { getDefaultWebSocketUrl } from '../utils/websocket';

interface ConnectionModalProps {
  isOpen: boolean;
  codespaces: Codespace[];
  onConnect: (serverUrl: string, githubToken: string) => void;
  onAuthenticate: (githubToken: string) => void;
  onConnectCodespace: (codespaceName: string) => void;
  onClose: () => void;
  connectionStatus?: string;
  authenticationStatus?: string;
  statusText?: string;
}

export function ConnectionModal({
  isOpen,
  codespaces,
  onConnect,
  onAuthenticate,
  onConnectCodespace,
  onClose,
  connectionStatus,
  authenticationStatus,
  statusText,
}: ConnectionModalProps): VNode {
  const [serverUrl, setServerUrl] = useState(getDefaultWebSocketUrl());
  const [githubToken, setGithubToken] = useState('');
  const [isServerUrlProvided, setIsServerUrlProvided] = useState(true);

  useEffect(() => {
    setIsServerUrlProvided(!!serverUrl);
  }, [serverUrl]);

  const handleConnect = () => {
    onConnect(serverUrl, githubToken);
    // Auto-authenticate if token is provided
    if (githubToken.trim()) {
      setTimeout(() => {
        onAuthenticate(githubToken);
      }, 1000);
    }
  };

  const handleAuthenticate = () => {
    onAuthenticate(githubToken);
  };

  const handleCodespaceClick = (codespace: Codespace) => {
    try {
      onConnectCodespace(codespace.name);
    } catch (error) {
      console.error('Error connecting to codespace:', error);
    }
  };

  if (!isOpen) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- null is safe return for conditional rendering
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Preact JSX elements are properly typed but ESLint can't infer this
  return (
    <div className="modal modal-open" onClick={onClose}>
      <div
        className="modal-box w-11/12 max-w-2xl bg-[#1e1e1e] border border-[#333]"
        onClick={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header bg-[#2d2d2d] p-4 rounded-t-lg -mx-6 -mt-6 mb-4">
          <h3 className="font-bold text-lg text-white">Connect to Remote Terminal</h3>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center gap-2">
            <label className="label whitespace-nowrap">
              <span className="label-text text-[#cccccc] font-medium">1. Connect to Server</span>
            </label>
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                className="input input-bordered w-full bg-[#2d2d2d] border-[#444] text-[#cccccc] focus:border-[#007acc] focus:ring-2 focus:ring-[#007acc]/20"
                value={serverUrl}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                  setServerUrl((e.target as HTMLInputElement).value)
                }
                placeholder="Server URL"
              />
              <button
                onClick={handleConnect}
                className={`btn border-none ${
                  connectionStatus === 'connected'
                    ? 'btn-success bg-[#00ff00] text-black'
                    : 'btn-primary bg-[#007acc] hover:bg-[#005a9e]'
                }`}
                disabled={connectionStatus === 'connected'}
              >
                {connectionStatus === 'connected' ? (
                  <>
                    <i className="codicon codicon-check"></i>
                    Connected
                  </>
                ) : (
                  'Connect'
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center gap-2">
            <label className="label whitespace-nowrap">
              <span className="label-text text-[#cccccc] font-medium">2. Authenticate</span>
            </label>
            <div className="flex items-center gap-2 w-full">
              <input
                type="password"
                className="input input-bordered w-full bg-[#2d2d2d] border-[#444] text-[#cccccc] focus:border-[#007acc] focus:ring-2 focus:ring-[#007acc]/20 disabled:opacity-50"
                value={githubToken}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                  setGithubToken((e.target as HTMLInputElement).value)
                }
                placeholder="GitHub Token"
                disabled={!isServerUrlProvided}
              />
              <button
                onClick={handleAuthenticate}
                className={`btn border-none disabled:opacity-50 ${
                  authenticationStatus === 'authenticated'
                    ? 'btn-success bg-[#00ff00] text-black'
                    : connectionStatus === 'connected'
                      ? 'btn-primary bg-[#007acc] hover:bg-[#005a9e]'
                      : 'btn-secondary bg-[#2d2d2d] border-[#444] text-[#cccccc] hover:bg-[#404040]'
                }`}
                disabled={!isServerUrlProvided || authenticationStatus === 'authenticated'}
              >
                {authenticationStatus === 'authenticated' ? (
                  <>
                    <i className="codicon codicon-check"></i>
                    Authenticated
                  </>
                ) : (
                  'Authenticate'
                )}
              </button>
            </div>
          </div>

          {codespaces.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="label">
                <span className="label-text text-[#cccccc] font-medium">3. Select Codespace</span>
              </label>
              <div className="border border-[#444] rounded-lg max-h-48 overflow-y-auto bg-[#2d2d2d]">
                {codespaces.map((codespace) => (
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Preact JSX elements in map are properly typed
                  <div
                    key={codespace.name}
                    className="flex items-center justify-between p-3 hover:bg-[#404040] border-b border-[#333] last:border-b-0"
                  >
                    <div className="flex flex-col">
                      <div className="text-[#cccccc] font-medium">
                        {codespace.display_name ?? codespace.repository.full_name}
                      </div>
                      <div className="text-xs text-[#aaaaaa]">{codespace.repository.full_name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`badge badge-outline text-xs ${
                          codespace.state.toLowerCase() === 'available'
                            ? 'badge-success'
                            : codespace.state.toLowerCase() === 'starting'
                              ? 'badge-warning'
                              : 'badge-info'
                        }`}
                      >
                        {codespace.state}
                      </div>
                      <button
                        onClick={() => handleCodespaceClick(codespace)}
                        className="btn btn-sm btn-primary bg-[#007acc] hover:bg-[#005a9e] border-none"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="alert bg-[#2d2d2d] border-[#444] text-[#cccccc]">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                Status
                {(statusText?.includes('Connecting') ||
                  statusText?.includes('Starting') ||
                  statusText?.includes('Unavailable')) && (
                  <i className="codicon codicon-sync animate-spin text-[#ffd43b]"></i>
                )}
              </h3>
              <div className="text-sm">
                {statusText?.includes('Connecting') ||
                statusText?.includes('Starting') ||
                statusText?.includes('Unavailable') ? (
                  <span className="text-[#ffd43b]">{statusText}</span>
                ) : connectionStatus === 'connected' ? (
                  authenticationStatus === 'authenticated' ? (
                    codespaces.length > 0 ? (
                      'Select a codespace from the list above to connect.'
                    ) : (
                      'No codespaces found. Create one in GitHub first.'
                    )
                  ) : (
                    'Enter your GitHub token and click Authenticate.'
                  )
                ) : (
                  'Enter server URL and click Connect to begin.'
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-action bg-[#2d2d2d] p-4 rounded-b-lg -mx-6 -mb-6 mt-4">
          <button
            onClick={onClose}
            className="btn btn-ghost text-[#cccccc] hover:bg-[#404040]"
            disabled={
              statusText?.includes('Connecting') ||
              statusText?.includes('Starting') ||
              statusText?.includes('Getting') ||
              statusText?.includes('Opening') ||
              statusText?.includes('Authenticating')
            }
          >
            {statusText?.includes('Connecting') ||
            statusText?.includes('Starting') ||
            statusText?.includes('Getting') ||
            statusText?.includes('Opening') ||
            statusText?.includes('Authenticating')
              ? 'Connecting...'
              : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
