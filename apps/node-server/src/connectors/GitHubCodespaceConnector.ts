/**
 * GitHub Codespace Connector for managing codespace connections
 */

import { request } from 'https';
import WebSocket from 'ws';
import type { 
  Codespace, 
  TunnelProperties, 
  TerminalConnection,
  PortInformation,
  TunnelConnectionResult
} from '@minimal-terminal-client/shared';
import { GITHUB_API } from '@minimal-terminal-client/shared';
import { forwardSshPortOverTunnel, getPortInformation } from '../tunnel/TunnelModule.js';
import { Ssh2Connector } from './Ssh2Connector.js';
import { logger } from '../utils/logger.js';

interface ConnectorOptions {
  debugMode?: boolean;
}

export class GitHubCodespaceConnector {
  private accessToken: string;
  private ws: WebSocket;
  private server: any; // CodespaceTerminalServer
  private options: ConnectorOptions;

  constructor(accessToken: string, ws: WebSocket, server: any, options: ConnectorOptions = {}) {
    this.accessToken = accessToken;
    this.ws = ws;
    this.server = server;
    this.options = options;
    logger.debug('GitHubCodespaceConnector initialized', {
      tokenSuffix: accessToken ? '*****' + accessToken.substring(accessToken.length - 4) : 'None',
      debugMode: options.debugMode
    });
  }

  async listCodespaces(): Promise<Codespace[]> {
    const options = {
      hostname: 'api.github.com',
      path: '/user/codespaces',
      method: 'GET',
      headers: {
        'Authorization': `token ${this.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': GITHUB_API.USER_AGENT
      }
    };

    logger.debug('Requesting codespaces list', { url: `https://${options.hostname}${options.path}` });

    return new Promise((resolve, reject) => {
      const req = request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          logger.debug('Codespaces list response', { statusCode: res.statusCode });
          
          if (res.statusCode === 401) {
            reject(new Error('Bad credentials'));
            return;
          }
          
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GitHub API Error: ${res.statusCode} ${data}`));
            return;
          }

          try {
            const result = JSON.parse(data);
            logger.debug('Codespaces list parsed', { count: result.codespaces?.length || 0 });
            resolve(result.codespaces || []);
          } catch (error) {
            logger.error('Failed to parse codespaces response', error as Error);
            reject(error);
          }
        });
      });

      req.on('error', (e) => {
        logger.error('Request error', e);
        reject(e);
      });
      
      req.end();
    });
  }

  async getTunnelProperties(codespaceName: string): Promise<TunnelProperties> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/user/codespaces/${codespaceName}?internal=true&refresh=true`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': GITHUB_API.USER_AGENT
        }
      };

      const req = request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          logger.debug('Tunnel properties response', { statusCode: res.statusCode });
          
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GitHub API Error: ${res.statusCode} ${data}`));
            return;
          }
          
          try {
            const response = JSON.parse(data);
            
            // Check codespace state before attempting connection
            if (response.state && response.state !== 'Available') {
              // Handle specific states that might become available
              if (response.state === 'Starting' || response.state === 'Provisioning') {
                const retryableError = new Error(`Codespace is ${response.state}. This is normal during initialization - please retry in 30-60 seconds.`);
                (retryableError as any).retryable = true;
                (retryableError as any).codespaceState = response.state;
                this.sendCodespaceState(this.ws, codespaceName, response.state);
                return reject(retryableError);
              } else {
                const error = new Error(`Codespace is not available. Current state: ${response.state}. Please start the codespace first.`);
                this.sendCodespaceState(this.ws, codespaceName, response.state);
                return reject(error);
              }
            }
            
            if (response.connection && response.connection.tunnelProperties) {
              resolve(response.connection.tunnelProperties);
            } else {
              reject(new Error('Tunnel properties not found in response. Codespace may not be ready.'));
            }
          } catch (parseError) {
            logger.error('Failed to parse tunnel properties', parseError as Error);
            reject(parseError);
          }
        });
      });

      req.on('error', (e) => {
        logger.error('Tunnel properties request error', e);
        reject(e);
      });

      req.end();
    });
  }

  async connectToCodespace(
    codespaceName: string,
    onTerminalData: (data: string) => void,
    ws: WebSocket
  ): Promise<TerminalConnection> {
    try {
      logger.info('Intercepting connection request for codespace', { codespaceName });

      // If there's an existing tunnel client, dispose of it properly
      if ((ws as any).tunnelClient || (ws as any).rpcConnection) {
        logger.info('Disposing of existing tunnel and RPC connections');
        try {
          // Close RPC connection first (stops heartbeat)
          if ((ws as any).rpcConnection) {
            await (ws as any).rpcConnection.close();
          }
          // Then dispose tunnel client
          if ((ws as any).tunnelClient) {
            await (ws as any).tunnelClient.dispose();
          }
        } catch (disposeError) {
          logger.error('Error disposing existing connections', disposeError as Error);
        }
        (ws as any).tunnelClient = null;
        (ws as any).rpcConnection = null;
        (ws as any).portInfo = null;
        (ws as any).endpointInfo = null;
        (ws as any).tunnelManagementClient = null;
        (ws as any).tunnelProperties = null;
      }

      const tunnelProperties = await this.getTunnelProperties(codespaceName);
      const result: TunnelConnectionResult = await forwardSshPortOverTunnel(tunnelProperties, { 
        debugMode: this.options.debugMode 
      });
      
      // Store tunnel information on the WebSocket session
      (ws as any).tunnelClient = result.tunnelClient;
      (ws as any).portInfo = result.portInfo;
      (ws as any).endpointInfo = result.endpointInfo;
      (ws as any).tunnelManagementClient = result.tunnelManagementClient;
      (ws as any).tunnelProperties = tunnelProperties;
      (ws as any).rpcConnection = result.rpcConnection; // Store RPC connection for cleanup

      logger.info('Connecting to local port', { localPort: result.localPort });

      // Send connecting state first
      this.sendCodespaceState(ws, codespaceName, 'Connecting', `Establishing SSH connection via tunnel`);

      const sshConnector = new Ssh2Connector();
      const terminalConnection = await sshConnector.connectViaSSH(
        (data) => { onTerminalData(data); },
        (error) => {
          logger.error('SSH Terminal Error', { error });
          if (ws && ws.readyState === WebSocket.OPEN) {
            this.server.sendError(ws, error.toString());
            this.sendCodespaceState(ws, codespaceName, 'Shutdown');
          }
        },
        result.localPort || 2222
      );

      // Send connected state after successful SSH connection
      this.sendCodespaceState(ws, codespaceName, 'Connected', `tunnel -> ${codespaceName}`);
      logger.info('Successfully connected to codespace SSH', { codespaceName, localPort: result.localPort });

      // Send initial port information to client
      this.sendPortUpdate(ws, result.portInfo);

      return terminalConnection;

    } catch (error) {
      logger.error('Failed to connect to codespace', error as Error);
      this.sendCodespaceState(ws, codespaceName, 'Disconnected');
      throw error;
    }
  }

  sendCodespaceState(
    _ws: WebSocket,
    codespaceName: string,
    state: string,
    repositoryFullName?: string
  ): void {
    if (this.server && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.server.sendMessage(this.ws, {
        type: 'codespace_state',
        codespace_name: codespaceName,
        state: state,
        repository_full_name: repositoryFullName
      });
    }
  }

  sendPortUpdate(_ws: WebSocket, portInfo: any): void {
    if (this.server && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const userPortsWithUrls = portInfo.userPorts.map((port: any) => ({
        portNumber: port.portNumber,
        protocol: port.protocol,
        urls: port.portForwardingUris || [],
        accessControl: port.accessControl,
        isUserPort: true
      }));

      this.server.sendMessage(this.ws, {
        type: 'port_update',
        portCount: portInfo.userPorts.length,
        ports: userPortsWithUrls,
        timestamp: portInfo.timestamp || new Date().toISOString()
      });
    }
  }

  async refreshPortInformation(ws: WebSocket): Promise<PortInformation> {
    const wsAny = ws as any;
    if (wsAny.tunnelManagementClient && wsAny.tunnelProperties && wsAny.tunnelClient?.connectedTunnel) {
      try {
        const updatedPortInfo = await getPortInformation(
          wsAny.tunnelManagementClient,
          wsAny.tunnelClient.connectedTunnel,
          wsAny.tunnelProperties
        );
        wsAny.portInfo = updatedPortInfo;
        this.sendPortUpdate(ws, updatedPortInfo);
        return updatedPortInfo;
      } catch (error) {
        logger.error('Failed to refresh port information', error as Error);
        return wsAny.portInfo || { userPorts: [], managementPorts: [], allPorts: [] };
      }
    }
    return { userPorts: [], managementPorts: [], allPorts: [] };
  }
}