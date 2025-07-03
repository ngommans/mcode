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

    let client; // Declare client here

    try {
        console.log('Fetching full tunnel object for port forwarding...');
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

        client = new TunnelRelayTunnelClient(); // Assign client here
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

		//TODO: WARNING - HARDCODED
		return { localPort:2222, tunnelClient:client };
		/*
		//TODO: The code in this block is not behaving - starting with client.tunnelSession being null
        if (!client.tunnelSession) {
            throw new Error('Failed to establish a tunnel session.');
        }

        console.log('Forwarding port...');
        const forwarded = await client.tunnelSession.forwardPort({ remotePort: sshPort });
        const localPort = forwarded.localPort;
        
        console.log(`Port forwarded: remote ${sshPort} -> local ${localPort}`);
        return { localPort, tunnelClient: client };
		*/
    } catch (err) {
        console.error('Failed to forward port over tunnel:', err);
        // If the client was created, ensure it's closed on failure.
        if (client) {
            client.dispose();
        }
        throw err;
    }
}


module.exports = { 
    createSshStreamOverTunnel,
    forwardSshPortOverTunnel
};