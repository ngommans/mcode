/**
 * Shared constants
 */

export const DEFAULT_PORTS = {
  SERVER: 3001,
  CLIENT_DEV: 8080,
  SSH: 22,
} as const;

export const WEBSOCKET_EVENTS = {
  OPEN: 'open',
  CLOSE: 'close',
  ERROR: 'error',
  MESSAGE: 'message',
} as const;

export const CODESPACE_STATES = {
  STARTING: 'Starting',
  AVAILABLE: 'Available', 
  SHUTDOWN: 'Shutdown',
  CONNECTED: 'Connected',
  DISCONNECTED: 'Disconnected',
  STOPPING: 'Stopping',
} as const;

export const PORT_LABELS = {
  USER_FORWARDED: 'UserForwardedPort',
  INTERNAL: 'InternalPort',
} as const;

export const MESSAGE_TYPES = {
  // Client to Server
  AUTHENTICATE: 'authenticate',
  LIST_CODESPACES: 'list_codespaces',
  CONNECT_CODESPACE: 'connect_codespace',
  DISCONNECT_CODESPACE: 'disconnect_codespace',
  START_CODESPACE: 'start_codespace',
  STOP_CODESPACE: 'stop_codespace',
  INPUT: 'input',
  RESIZE: 'resize',
  SEND_INITIAL_COMMAND: 'send_initial_command',
  GET_PORT_INFO: 'get_port_info',
  REFRESH_PORTS: 'refresh_ports',
  CONNECT_TO_REPO_CODESPACE: 'connect_to_repo_codespace',
  QUERY_CODESPACE_STATUS: 'query_codespace_status',
  
  // Server to Client
  AUTHENTICATED: 'authenticated',
  CODESPACES_LIST: 'codespaces_list',
  OUTPUT: 'output',
  ERROR: 'error',
  CODESPACE_STATE: 'codespace_state',
  CODESPACE_CONNECTION_STATUS: 'codespace_connection_status',
  PORT_UPDATE: 'port_update',
  PORT_INFO_RESPONSE: 'port_info_response',
  DISCONNECTED_FROM_CODESPACE: 'disconnected_from_codespace',
} as const;

export const TERMINAL_DEFAULTS = {
  COLS: 80,
  ROWS: 24,
  FONT_SIZE: 14,
  FONT_FAMILY: 'Monaco, Menlo, "Ubuntu Mono", monospace',
  LINE_HEIGHT: 1.2,
} as const;

export const RECONNECT_DEFAULTS = {
  MAX_ATTEMPTS: 5,
  DELAY_MS: 2000,
  BACKOFF_FACTOR: 1.5,
} as const;

export const GITHUB_API = {
  BASE_URL: 'https://api.github.com',
  USER_AGENT: 'MinimalTerminalClient/1.0',
  REQUIRED_SCOPES: ['codespace'],
} as const;