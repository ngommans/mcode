/**
 * Configuration types for the application
 */

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  websocket: {
    heartbeatInterval: number;
    connectionTimeout: number;
  };
}

export interface ClientConfig {
  serverUrl: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  terminal: {
    theme: TerminalTheme;
    fontSize: number;
    fontFamily: string;
    cursorStyle: 'block' | 'underline' | 'bar';
    cursorBlink: boolean;
  };
}

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface GitHubConfig {
  token: string;
  apiUrl: string;
  scopes: string[];
}

export interface AppConfig {
  server: ServerConfig;
  client: ClientConfig;
  github: GitHubConfig;
  environment: 'development' | 'production' | 'test';
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    format: 'json' | 'text';
  };
}