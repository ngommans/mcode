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

export class GitHubCodespaceConnector {
  private accessToken: string;
  private ws: WebSocket;
  private server: any; // CodespaceTerminalServer

  constructor(accessToken: string, ws: WebSocket, server: any) {
    this.accessToken = accessToken;
    this.ws = ws;
    this.server = server;
    logger.debug('GitHubCodespaceConnector initialized', {
      tokenSuffix: accessToken ? '*****' + accessToken.substring(accessToken.length - 4) : 'None'
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
              const error = new Error(`Codespace is not available. Current state: ${response.state}. Please start the codespace first.`);
              this.sendCodespaceState(this.ws, codespaceName, response.state);
              return reject(error);
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

      // If there's an existing tunnel client, dispose of it
      if ((ws as any).tunnelClient) {
        logger.info('Disposing of existing tunnel client');
        try {
          await (ws as any).tunnelClient.dispose();
        } catch (disposeError) {
          logger.error('Error disposing tunnel client', disposeError as Error);
        }
        (ws as any).tunnelClient = null;
        (ws as any).portInfo = null;
        (ws as any).endpointInfo = null;
        (ws as any).tunnelManagementClient = null;
        (ws as any).tunnelProperties = null;
      }

      const tunnelProperties = await this.getTunnelProperties(codespaceName);
      const result: TunnelConnectionResult = await forwardSshPortOverTunnel(tunnelProperties);
      
      // Store tunnel information on the WebSocket session
      (ws as any).tunnelClient = result.tunnelClient;
      (ws as any).portInfo = result.portInfo;
      (ws as any).endpointInfo = result.endpointInfo;
      (ws as any).tunnelManagementClient = result.tunnelManagementClient;
      (ws as any).tunnelProperties = tunnelProperties;

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
        result.localPort
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