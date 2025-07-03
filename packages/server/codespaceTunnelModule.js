const { TunnelRelayTunnelClient } = require('@microsoft/dev-tunnels-connections');
const { ManagementApiVersions, TunnelManagementHttpClient } = require('@microsoft/dev-tunnels-management');
const { TunnelAccessScopes, TunnelProtocol } = require('@microsoft/dev-tunnels-contracts');

async function createSshStreamOverTunnel(tunnelProperties, githubToken) {
    const userAgent = {
        name: "codespace-tunnel-client",
        version: "1.0.0",
    };

    const tunnelManagementClient = new TunnelManagementHttpClient(
        userAgent,
        ManagementApiVersions.Version20230927preview,
        () => Promise.resolve(`Bearer ${tunnelProperties.managePortsAccessToken}`)
    );

    const tunnelReference = {
        tunnelId: tunnelProperties.tunnelId,
        clusterId: tunnelProperties.clusterId,
    };

    const tunnelRequestOptions = {
        tokenScopes: [TunnelAccessScopes.Connect, TunnelAccessScopes.ManagePorts],
        accessToken: tunnelProperties.connectAccessToken,
    };

    try {
        console.log('Fetching full tunnel object...');
        const tunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
        
        tunnel.accessTokens = {
            connect: tunnelProperties.connectAccessToken,
            "manage:ports": tunnelProperties.managePortsAccessToken,
        };

        const sshPort = 22;

        const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
            tokenScopes: [TunnelAccessScopes.ManagePorts],
            accessToken: tunnelProperties.managePortsAccessToken,
        });
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

        const client = new TunnelRelayTunnelClient();
        client.trace = (level, eventId, msg, err) => {
            console.log(`Tunnel Client Trace: ${msg}`);
            if (err) console.error(err);
        };

        console.log('Connecting tunnel client...');
        const updatedTunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
        updatedTunnel.accessTokens = {
            connect: tunnelProperties.connectAccessToken,
            "manage:ports": tunnelProperties.managePortsAccessToken,
        };

        await client.connect(updatedTunnel);
        console.log('Tunnel client connected');

        if (!client.tunnelSession) {
            throw new Error('Failed to establish a tunnel session.');
        }

        console.log('Creating session stream...');
        const stream = await client.tunnelSession.createSessionStream();
        console.log('Session stream created.');
        return stream;

    } catch (err) {
        console.error('Failed to create SSH stream over tunnel:', err);
        throw err;
    }
}

async function forwardSshPortOverTunnel(tunnelProperties) {
    const userAgent = {
        name: "codespace-tunnel-client",
        version: "1.0.0",
    };

    const tunnelManagementClient = new TunnelManagementHttpClient(
        userAgent,
        ManagementApiVersions.Version20230927preview,
        () => Promise.resolve(`Bearer ${tunnelProperties.managePortsAccessToken}`)
    );

    const tunnelReference = {
        tunnelId: tunnelProperties.tunnelId,
        clusterId: tunnelProperties.clusterId,
    };

    const tunnelRequestOptions = {
        tokenScopes: [TunnelAccessScopes.Connect, TunnelAccessScopes.ManagePorts],
        accessToken: tunnelProperties.connectAccessToken,
    };

    let client;
    let portInfo = { userPorts: [], managementPorts: [], allPorts: [] };

    try {
        console.log('Fetching full tunnel object for port forwarding...');
        const tunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
        
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
        client.trace = (level, eventId, msg, err) => {
            console.log(`Tunnel Client Trace: ${msg}`);
            if (err) console.error(err);
        };

        console.log('Connecting tunnel client for port forwarding...');
        const updatedTunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
        updatedTunnel.accessTokens = {
            connect: tunnelProperties.connectAccessToken,
            "manage:ports": tunnelProperties.managePortsAccessToken,
        };

        await client.connect(updatedTunnel);
        console.log('Tunnel client connected for port forwarding.');

        // Extract port information from connected client
        let extractedLocalPort = 2222; // Default fallback
        
        if (client.tunnelSession) {
            try {
                console.log('Attempting to forward port via tunnel session...');
                const forwarded = await client.tunnelSession.forwardPort({ remotePort: sshPort });
                extractedLocalPort = forwarded.localPort;
                console.log(`Port forwarded: remote ${sshPort} -> local ${extractedLocalPort}`);
            } catch (forwardError) {
                console.log('Port forwarding via session failed, using default port:', forwardError.message);
            }
        }

        // Get endpoint information for URL construction
        const endpoints = client.endpoints || [];
        const endpointInfo = endpoints.length > 0 ? {
            portUriFormat: endpoints[0].portUriFormat,
            portSshCommandFormat: endpoints[0].portSshCommandFormat,
            tunnelUri: endpoints[0].tunnelUri
        } : null;

        // Update port info with fresh data after connection
        const refreshedPorts = await tunnelManagementClient.listTunnelPorts(updatedTunnel, {
            tokenScopes: [TunnelAccessScopes.ManagePorts],
            accessToken: tunnelProperties.managePortsAccessToken,
        });
        
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


async function getPortInformation(tunnelManagementClient, tunnel, tunnelProperties) {
    try {
        const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
            tokenScopes: [TunnelAccessScopes.ManagePorts],
            accessToken: tunnelProperties.managePortsAccessToken,
        });
        
        const portInfo = {
            allPorts: existingPorts,
            userPorts: existingPorts.filter(port => 
                port.labels && port.labels.includes('UserForwardedPort')
            ),
            managementPorts: existingPorts.filter(port => 
                port.labels && port.labels.includes('InternalPort')
            ),
            timestamp: new Date().toISOString()
        };

        return portInfo;
    } catch (error) {
        console.error('Failed to get port information:', error);
        return { allPorts: [], userPorts: [], managementPorts: [], error: error.message };
    }
}

module.exports = { 
    createSshStreamOverTunnel,
    forwardSshPortOverTunnel,
    getPortInformation
};