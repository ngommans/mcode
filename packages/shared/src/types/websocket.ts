/**
 * WebSocket message types for communication between client and server
 */

export interface BaseMessage {
  type: string;
}

// Client to Server messages
export interface AuthenticateMessage extends BaseMessage {
  type: 'authenticate';
  token: string;
}

export interface ListCodespacesMessage extends BaseMessage {
  type: 'list_codespaces';
}

export interface ConnectCodespaceMessage extends BaseMessage {
  type: 'connect_codespace';
  codespace_name: string;
}

export interface DisconnectCodespaceMessage extends BaseMessage {
  type: 'disconnect_codespace';
}

export interface StartCodespaceMessage extends BaseMessage {
  type: 'start_codespace';
  codespace_name: string;
}

export interface StopCodespaceMessage extends BaseMessage {
  type: 'stop_codespace';
  codespace_name: string;
}

export interface InputMessage extends BaseMessage {
  type: 'input';
  data: string;
}

export interface ResizeMessage extends BaseMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface SendInitialCommandMessage extends BaseMessage {
  type: 'send_initial_command';
  command: string;
}

export interface GetPortInfoMessage extends BaseMessage {
  type: 'get_port_info';
}

export interface RefreshPortsMessage extends BaseMessage {
  type: 'refresh_ports';
}

export interface ConnectToRepoCodespaceMessage extends BaseMessage {
  type: 'connect_to_repo_codespace';
  repo_url: string;
}

export interface QueryCodespaceStatusMessage extends BaseMessage {
  type: 'query_codespace_status';
}

export type ClientMessage = 
  | AuthenticateMessage
  | ListCodespacesMessage
  | ConnectCodespaceMessage
  | DisconnectCodespaceMessage
  | StartCodespaceMessage
  | StopCodespaceMessage
  | InputMessage
  | ResizeMessage
  | SendInitialCommandMessage
  | GetPortInfoMessage
  | RefreshPortsMessage
  | ConnectToRepoCodespaceMessage
  | QueryCodespaceStatusMessage;

// Server to Client messages
export interface AuthenticatedMessage extends BaseMessage {
  type: 'authenticated';
  success: boolean;
}

export interface CodespacesListMessage extends BaseMessage {
  type: 'codespaces_list';
  data: Codespace[];
}

export interface OutputMessage extends BaseMessage {
  type: 'output';
  data: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  message: string;
}

export interface CodespaceStateMessage extends BaseMessage {
  type: 'codespace_state';
  codespace_name: string;
  state: CodespaceState;
  repository_full_name?: string;
}

export interface CodespaceConnectionStatusMessage extends BaseMessage {
  type: 'codespace_connection_status';
  codespace_name: string;
  state: CodespaceState;
}

export interface PortUpdateMessage extends BaseMessage {
  type: 'port_update';
  portCount: number;
  ports: ForwardedPort[];
  timestamp: string;
}

export interface PortInfoResponseMessage extends BaseMessage {
  type: 'port_info_response';
  portInfo: PortInformation;
}

export interface DisconnectedFromCodespaceMessage extends BaseMessage {
  type: 'disconnected_from_codespace';
}

export type ServerMessage = 
  | AuthenticatedMessage
  | CodespacesListMessage
  | OutputMessage
  | ErrorMessage
  | CodespaceStateMessage
  | CodespaceConnectionStatusMessage
  | PortUpdateMessage
  | PortInfoResponseMessage
  | DisconnectedFromCodespaceMessage;

export type WebSocketMessage = ClientMessage | ServerMessage;

// Supporting types
export type CodespaceState = 'Starting' | 'Available' | 'Shutdown' | 'Connected' | 'Disconnected' | 'Stopping';

export interface Codespace {
  id: number;
  name: string;
  display_name?: string;
  environment_id: string;
  owner: {
    login: string;
    id: number;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
  };
  machine: {
    name: string;
    display_name: string;
    operating_system: string;
    storage_in_bytes: number;
    memory_in_bytes: number;
    cpus: number;
  };
  created_at: string;
  updated_at: string;
  last_used_at: string;
  state: string;
  url: string;
  web_url: string;
  start_url?: string;
  stop_url?: string;
  git_status: {
    ahead: number;
    behind: number;
    has_unpushed_changes: boolean;
    has_uncommitted_changes: boolean;
    ref: string;
  };
  location: string;
  idle_timeout_minutes: number;
}

export interface ForwardedPort {
  portNumber: number;
  protocol: string;
  urls: string[];
  accessControl?: any;
  isUserPort: boolean;
}

export interface PortInformation {
  userPorts: any[];
  managementPorts: any[];
  allPorts: any[];
  timestamp?: string;
  error?: string;
}