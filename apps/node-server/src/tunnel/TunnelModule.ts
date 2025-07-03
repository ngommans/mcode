/**
 * Tunnel management module for codespace connections
 * Converted from the original codespaceTunnelModule.js
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { ManagementApiVersions, TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { TunnelAccessScopes, TunnelProtocol } from '@microsoft/dev-tunnels-contracts';
import type { TunnelProperties, TunnelConnectionResult, PortInformation } from '@minimal-terminal-client/shared';

interface TunnelReference {
  tunnelId: string;
  clusterId: string;
}

interface TunnelRequestOptions {
  tokenScopes: string[];
  accessToken: string;
}

interface UserAgent {
  name: string;
  version: string;
}

export async function forwardSshPortOverTunnel(tunnelProperties: TunnelProperties): Promise<TunnelConnectionResult> {
  const userAgent: UserAgent = {
    name: "codespace-tunnel-client",
    version: "1.0.0",
  };

  const tunnelManagementClient = new TunnelManagementHttpClient(
    userAgent,
    ManagementApiVersions.Version20230927preview,
    () => Promise.resolve(`Bearer ${tunnelProperties.managePortsAccessToken}`)
  );

  const tunnelReference: TunnelReference = {
    tunnelId: tunnelProperties.tunnelId,
    clusterId: tunnelProperties.clusterId,
  };

  const tunnelRequestOptions: TunnelRequestOptions = {
    tokenScopes: [TunnelAccessScopes.Connect, TunnelAccessScopes.ManagePorts],
    accessToken: tunnelProperties.connectAccessToken,
  };

  let client: TunnelRelayTunnelClient | null = null;
  let portInfo: PortInformation = { userPorts: [], managementPorts: [], allPorts: [] };

  try {
    console.log('Fetching full tunnel object for port forwarding...');
    const tunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
    
    if (!tunnel) {
      throw new Error('Failed to retrieve tunnel from management client');
    }
    
    tunnel.accessTokens = {
      connect: tunnelProperties.connectAccessToken,
      "manage:ports": tunnelProperties.managePortsAccessToken,
    };

    const sshPort = 22;

    // Get all existing ports and categorize them
    const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
      tokenScopes: [TunnelAccessScopes.ManagePorts],
      accessToken: tunnelProperties.managePortsAccessToken,
    });
    
    // Categorize ports
    portInfo.allPorts = existingPorts;
    portInfo.userPorts = existingPorts.filter(port => 
      port.labels && port.labels.includes('UserForwardedPort')
    );
    portInfo.managementPorts = existingPorts.filter(port => 
      port.labels && port.labels.includes('InternalPort')
    );

    console.log(`Found ${portInfo.userPorts.length} user ports, ${portInfo.managementPorts.length} management ports`);

    const port22Exists = existingPorts.find(p => p.portNumber === sshPort);

    if (!port22Exists) {
      console.log(`Creating tunnel port ${sshPort}...`);
      const tunnelPort = { portNumber: sshPort, protocol: TunnelProtocol.Ssh, sshUser: "node" };
      const createPortOptions = {
        tokenScopes: [TunnelAccessScopes.ManagePorts],
        accessToken: tunnelProperties.managePortsAccessToken,
      };
      await tunnelManagementClient.createTunnelPort(tunnel, tunnelPort, createPortOptions);
      console.log(`Tunnel port ${sshPort} created.`);
    } else {
      console.log(`Tunnel port ${sshPort} already exists.`);
    }

    client = new TunnelRelayTunnelClient();
    // Track SSH port forwarding from trace messages
    let detectedSSHPort: number | null = null;
    
    client.trace = (_level: any, _eventId: any, msg: any, err?: any) => {
      console.log(`Tunnel Client Trace: ${msg}`);
      if (err) console.error(err);
      
      // Parse trace messages to detect SSH port forwarding
      if (typeof msg === 'string') {
        // Look for "Forwarding from 127.0.0.1:XXXXX to host port 22"
        const sshForwardMatch = msg.match(/Forwarding from 127\.0\.0\.1:(\d+) to host port 22\./);
        if (sshForwardMatch) {
          const localPort = parseInt(sshForwardMatch[1], 10);
          console.log(`Detected SSH forwarding: local port ${localPort} -> remote port 22`);
          detectedSSHPort = localPort;
        }
        
        // Also look for "PortForwardingService listening on 127.0.0.1:XXXXX" for SSH
        const listeningMatch = msg.match(/PortForwardingService listening on 127\.0\.0\.1:(\d+)\./);
        if (listeningMatch && msg.includes('port 22')) {
          const localPort = parseInt(listeningMatch[1], 10);
          console.log(`Detected SSH listening port: ${localPort}`);
          detectedSSHPort = localPort;
        }
      }
    };

    console.log('Connecting tunnel client for port forwarding...');
    const updatedTunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
    
    if (!updatedTunnel) {
      throw new Error('Failed to retrieve updated tunnel from management client');
    }
    
    updatedTunnel.accessTokens = {
      connect: tunnelProperties.connectAccessToken,
      "manage:ports": tunnelProperties.managePortsAccessToken,
    };

    await client.connect(updatedTunnel);
    console.log('Tunnel client connected for port forwarding.');

    // Wait for SSH port 22 to be forwarded by the tunnel
    try {
      console.log(`Waiting for SSH port ${sshPort} to be forwarded...`);
      
      // Add a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout waiting for SSH port forwarding')), 10000);
      });
      
      await Promise.race([
        client.waitForForwardedPort(sshPort),
        timeoutPromise
      ]);
      
      console.log(`SSH port ${sshPort} is now ready for connections.`);
    } catch (waitError: any) {
      console.error('Failed to wait for SSH port forwarding:', waitError.message);
      console.log('Attempting to continue without explicit port wait...');
      // Don't throw - try to continue anyway
    }

    // Note: TunnelRelayTunnelClient doesn't have direct event listeners for port forwarding
    // We'll detect the port through the port forwarding service

    // Extract the actual local port that SSH is forwarded to
    let extractedLocalPort = 2222; // Default fallback
    
    console.log('Attempting to extract SSH port forwarding information...');
    
    // First, check if SSH port 22 is actually being forwarded by looking at tunnel ports
    const refreshedPorts = await tunnelManagementClient.listTunnelPorts(updatedTunnel, {
      tokenScopes: [TunnelAccessScopes.ManagePorts],
      accessToken: tunnelProperties.managePortsAccessToken,
    });
    
    console.log('Available tunnel ports:', refreshedPorts.map((p: any) => ({ 
      port: p.portNumber, 
      protocol: p.protocol,
      urls: p.portForwardingUris 
    })));
    
    // Extract the actual forwarded port from the tunnel client
    const sshSession = (client as any).sshSession;
    console.log('SSH Session available:', !!sshSession);
    
    if (sshSession) {
      try {
        const pfs = sshSession.getService('PortForwardingService');
        console.log('Port Forwarding Service available:', !!pfs);
        
        if (pfs && pfs.listeners && pfs.listeners.size > 0) {
          console.log(`Available listener ports: ${Array.from(pfs.listeners.keys()).join(', ')}`);
          const listeners = Array.from(pfs.listeners.keys());
          
          // Find the port that's forwarding SSH port 22
          for (const port of listeners) {
            if (typeof port === 'number' && port > 1024 && port < 65535) {
              console.log(`Checking if port ${port} forwards SSH...`);
              
              // Check if this port is forwarding to SSH port 22
              const portInfo = pfs.listeners.get(port);
              if (portInfo) {
                console.log(`Port ${port} info:`, portInfo);
                // If this is likely the SSH forwarding port, use it
                extractedLocalPort = port;
                console.log(`Using detected SSH forwarding port: ${extractedLocalPort}`);
                break;
              }
            }
          }
          
          // If we still haven't found the right port, check for forwarded ports
          if (extractedLocalPort === 2222 && pfs.localForwardedPorts) {
            console.log('Checking local forwarded ports...');
            const forwardedPorts = Array.from(pfs.localForwardedPorts.values());
            console.log('Forwarded ports details:', forwardedPorts.map((fp: any) => ({ 
              remotePort: fp.remotePort, 
              localPort: (fp as any).localPort 
            })));
            
            const sshForwarded = forwardedPorts.find((fp: any) => fp.remotePort === sshPort);
            if (sshForwarded && (sshForwarded as any).localPort) {
              extractedLocalPort = (sshForwarded as any).localPort;
              console.log(`Found SSH forwarded port: remote ${sshPort} -> local ${extractedLocalPort}`);
            }
          }
        }
      } catch (pfsError: any) {
        console.log('Could not access port forwarding service:', pfsError.message);
      }
    }
    
    // If we still haven't found the port, try tunnel session forwarding
    if (extractedLocalPort === 2222 && (client as any).tunnelSession) {
      try {
        console.log('Attempting to forward port via tunnel session...');
        const forwarded = await (client as any).tunnelSession.forwardPort({ remotePort: sshPort });
        extractedLocalPort = forwarded.localPort;
        console.log(`Port forwarded via tunnel session: remote ${sshPort} -> local ${extractedLocalPort}`);
      } catch (forwardError: any) {
        console.log('Port forwarding via session failed:', forwardError.message);
      }
    }
    
    console.log(`Final extracted local port for SSH: ${extractedLocalPort}`);

    // Get endpoint information for URL construction
    const endpoints = (client as any).endpoints || [];
    const endpointInfo = endpoints.length > 0 && endpoints[0].portUriFormat ? {
      portUriFormat: endpoints[0].portUriFormat,
      portSshCommandFormat: endpoints[0].portSshCommandFormat || '',
      tunnelUri: endpoints[0].tunnelUri || ''
    } : null;

    // Update port info with fresh data after connection
    portInfo.allPorts = refreshedPorts;
    portInfo.userPorts = refreshedPorts.filter(port => 
      port.labels && port.labels.includes('UserForwardedPort')
    );
    portInfo.managementPorts = refreshedPorts.filter(port => 
      port.labels && port.labels.includes('InternalPort')
    );

    return { 
      localPort: extractedLocalPort, 
      tunnelClient: client, 
      portInfo: portInfo,
      endpointInfo: endpointInfo,
      tunnelManagementClient: tunnelManagementClient
    };

  } catch (err) {
    console.error('Failed to forward port over tunnel:', err);
    if (client) {
      client.dispose();
    }
    throw err;
  }
}

export async function getPortInformation(
  tunnelManagementClient: any,
  tunnel: any,
  tunnelProperties: TunnelProperties
): Promise<PortInformation> {
  try {
    const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
      tokenScopes: [TunnelAccessScopes.ManagePorts],
      accessToken: tunnelProperties.managePortsAccessToken,
    });
    
    const portInfo: PortInformation = {
      allPorts: existingPorts,
      userPorts: existingPorts.filter((port: any) => 
        port.labels && port.labels.includes('UserForwardedPort')
      ),
      managementPorts: existingPorts.filter((port: any) => 
        port.labels && port.labels.includes('InternalPort')
      ),
      timestamp: new Date().toISOString()
    };

    return portInfo;
  } catch (error: any) {
    console.error('Failed to get port information:', error);
    return { 
      allPorts: [], 
      userPorts: [], 
      managementPorts: [], 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}