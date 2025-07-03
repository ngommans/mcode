const { TunnelRelayTunnelClient } = require('@microsoft/dev-tunnels-connections');
const { ManagementApiVersions, TunnelManagementHttpClient } = require('@microsoft/dev-tunnels-management');
const { TunnelAccessScopes, TunnelProtocol } = require('@microsoft/dev-tunnels-contracts');
const { exec } = require('child_process');

async function getTunnelProperties(codespaceName, token) {
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/user/codespaces/${codespaceName}?internal=true&refresh=true`;
        const command = `curl -H "Authorization: Bearer ${token}" "${url}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                console.error(`stderr: ${stderr}`);
                return reject(error);
            }
            try {
                console.log('Raw API response:', stdout);
                const response = JSON.parse(stdout);
                console.log('Parsed response structure:', Object.keys(response));
                if (response.connection && response.connection.tunnelProperties) {
                    resolve(response.connection.tunnelProperties);
                } else {
                    console.log('Connection object:', response.connection);
                    reject(new Error('Tunnel properties not found in response.'));
                }
            } catch (parseError) {
                console.log('JSON parse error:', parseError.message);
                console.log('Raw stdout:', stdout);
                reject(parseError);
            }
        });
    });
}

function inspectObject(obj, name, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
        return `${name}: [Max depth reached]`;
    }
    
    if (obj === null || obj === undefined) {
        return `${name}: ${obj}`;
    }
    
    if (typeof obj === 'function') {
        return `${name}: [Function: ${obj.name || 'anonymous'}]`;
    }
    
    if (typeof obj !== 'object') {
        return `${name}: ${obj}`;
    }
    
    if (Array.isArray(obj)) {
        return `${name}: [Array length: ${obj.length}] ${obj.length > 0 ? JSON.stringify(obj.slice(0, 3)) : '[]'}`;
    }
    
    const indent = '  '.repeat(currentDepth);
    let result = `${name}: {\n`;
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            try {
                const value = obj[key];
                if (typeof value === 'object' && value !== null) {
                    result += `${indent}  ${inspectObject(value, key, maxDepth, currentDepth + 1)}\n`;
                } else {
                    result += `${indent}  ${key}: ${typeof value === 'function' ? '[Function]' : JSON.stringify(value)}\n`;
                }
            } catch (e) {
                result += `${indent}  ${key}: [Error accessing: ${e.message}]\n`;
            }
        }
    }
    
    result += `${indent}}`;
    return result;
}

async function testPortExtractionMethods() {
    require('dotenv').config();

const codespaceName = process.env.CODESPACE_NAME;
const githubToken = process.env.GITHUB_TOKEN;

    try {
        console.log('=== STEP 1: Fetching tunnel properties ===');
        const tunnelProperties = await getTunnelProperties(codespaceName, githubToken);
        console.log('✓ Tunnel properties fetched successfully');

        console.log('\n=== STEP 2: Setting up tunnel management client ===');
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

        console.log('\n=== STEP 3: Fetching tunnel object from management API ===');
        const tunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
        tunnel.accessTokens = {
            connect: tunnelProperties.connectAccessToken,
            "manage:ports": tunnelProperties.managePortsAccessToken,
        };
        
        console.log('✓ Tunnel object fetched from management API');
        console.log('🔍 Tunnel object properties:');
        console.log(inspectObject(tunnel, 'tunnel'));

        console.log('\n=== STEP 4: Listing existing ports via management API ===');
        const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
            tokenScopes: [TunnelAccessScopes.ManagePorts],
            accessToken: tunnelProperties.managePortsAccessToken,
        });
        
        console.log('✓ Existing ports from management API:');
        console.log(inspectObject(existingPorts, 'existingPorts'));

        console.log('\n=== STEP 5: Creating and connecting tunnel client ===');
        const client = new TunnelRelayTunnelClient();
        
        // Add detailed tracing
        client.trace = (level, eventId, msg, err) => {
            console.log(`🔍 Tunnel Client Trace [${level}:${eventId}]: ${msg}`);
            if (err) console.error('🔍 Trace Error:', err);
        };

        console.log('🔍 TunnelRelayTunnelClient properties before connection:');
        console.log(inspectObject(client, 'client'));

        console.log('\n⚡ Connecting tunnel client...');
        await client.connect(tunnel);
        console.log('✓ Tunnel client connected successfully');

        console.log('\n=== STEP 6: Inspecting tunnel client after connection ===');
        console.log('🔍 TunnelRelayTunnelClient properties after connection:');
        console.log(inspectObject(client, 'client'));

        console.log('\n=== STEP 7: Testing forwardedPorts() method ===');
        try {
            if (typeof client.forwardedPorts === 'function') {
                console.log('✓ forwardedPorts() method exists');
                const forwardedPorts = await client.forwardedPorts();
                console.log('🔍 forwardedPorts() result:');
                console.log(inspectObject(forwardedPorts, 'forwardedPorts'));
            } else {
                console.log('❌ forwardedPorts() method not found');
            }
        } catch (error) {
            console.log('❌ Error calling forwardedPorts():', error.message);
        }

        console.log('\n=== STEP 8: Testing endpoints property ===');
        try {
            if (client.endpoints !== undefined) {
                console.log('✓ endpoints property exists');
                console.log('🔍 endpoints property:');
                console.log(inspectObject(client.endpoints, 'client.endpoints'));
            } else {
                console.log('❌ endpoints property not found');
            }
        } catch (error) {
            console.log('❌ Error accessing endpoints property:', error.message);
        }

        console.log('\n=== STEP 9: Testing tunnel session properties ===');
        try {
            if (client.tunnelSession) {
                console.log('✓ tunnelSession exists');
                console.log('🔍 tunnelSession properties:');
                console.log(inspectObject(client.tunnelSession, 'client.tunnelSession'));
                
                // Test session methods
                if (typeof client.tunnelSession.forwardPort === 'function') {
                    console.log('✓ tunnelSession.forwardPort() method exists');
                } else {
                    console.log('❌ tunnelSession.forwardPort() method not found');
                }
            } else {
                console.log('❌ tunnelSession not found');
            }
        } catch (error) {
            console.log('❌ Error accessing tunnelSession:', error.message);
        }

        console.log('\n=== STEP 10: Testing tunnel property on client ===');
        try {
            if (client.tunnel) {
                console.log('✓ tunnel property exists on client');
                console.log('🔍 client.tunnel properties:');
                console.log(inspectObject(client.tunnel, 'client.tunnel'));
                
                // Check for endpoints on the tunnel object
                if (client.tunnel.endpoints) {
                    console.log('✓ client.tunnel.endpoints exists');
                    console.log('🔍 client.tunnel.endpoints:');
                    console.log(inspectObject(client.tunnel.endpoints, 'client.tunnel.endpoints'));
                } else {
                    console.log('❌ client.tunnel.endpoints not found');
                }
            } else {
                console.log('❌ tunnel property not found on client');
            }
        } catch (error) {
            console.log('❌ Error accessing tunnel property:', error.message);
        }

        console.log('\n=== STEP 11: Testing port forwarding to trigger tunnelChanged ===');
        try {
            // Ensure SSH port exists
            const sshPort = 22;
            const port22Exists = existingPorts.find(p => p.portNumber === sshPort);
            
            if (!port22Exists) {
                console.log(`Creating tunnel port ${sshPort} to test port forwarding...`);
                const tunnelPort = { portNumber: sshPort, protocol: TunnelProtocol.Ssh, sshUser: "node" };
                const createPortOptions = {
                    tokenScopes: [TunnelAccessScopes.ManagePorts],
                    accessToken: tunnelProperties.managePortsAccessToken,
                };
                await tunnelManagementClient.createTunnelPort(tunnel, tunnelPort, createPortOptions);
                console.log(`✓ Tunnel port ${sshPort} created`);
            }
            
            // Try to forward a port to trigger potential tunnelChanged event
            if (client.tunnelSession && typeof client.tunnelSession.forwardPort === 'function') {
                console.log('🔍 Attempting to forward port to trigger tunnelChanged...');
                try {
                    const forwarded = await client.tunnelSession.forwardPort({ remotePort: sshPort });
                    console.log('✓ Port forwarded successfully');
                    console.log('🔍 Port forwarding result:');
                    console.log(inspectObject(forwarded, 'forwarded'));
                    
                    // Re-check client properties after port forwarding
                    console.log('\n🔍 Client properties after port forwarding:');
                    console.log(inspectObject(client, 'client_after_forwarding'));
                    
                } catch (forwardError) {
                    console.log('❌ Port forwarding failed:', forwardError.message);
                }
            }
        } catch (error) {
            console.log('❌ Error during port forwarding test:', error.message);
        }

        console.log('\n=== STEP 12: Testing direct tunnel refresh ===');
        try {
            console.log('🔍 Refreshing tunnel object to check for updated endpoints...');
            const refreshedTunnel = await tunnelManagementClient.getTunnel(tunnelReference, tunnelRequestOptions);
            refreshedTunnel.accessTokens = {
                connect: tunnelProperties.connectAccessToken,
                "manage:ports": tunnelProperties.managePortsAccessToken,
            };
            
            console.log('✓ Tunnel refreshed from management API');
            console.log('🔍 Refreshed tunnel properties:');
            console.log(inspectObject(refreshedTunnel, 'refreshedTunnel'));
            
            if (refreshedTunnel.endpoints) {
                console.log('✓ Endpoints found on refreshed tunnel');
                console.log('🔍 Refreshed tunnel endpoints:');
                console.log(inspectObject(refreshedTunnel.endpoints, 'refreshedTunnel.endpoints'));
            } else {
                console.log('❌ No endpoints found on refreshed tunnel');
            }
        } catch (error) {
            console.log('❌ Error refreshing tunnel:', error.message);
        }

        console.log('\n=== STEP 13: Final summary ===');
        console.log('🔍 Final client inspection:');
        console.log(inspectObject(client, 'final_client'));

        // Clean up
        console.log('\n=== CLEANUP ===');
        try {
            client.dispose();
            console.log('✓ Tunnel client disposed');
        } catch (error) {
            console.log('❌ Error disposing client:', error.message);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Error details:', error.stack);
    }
}

// Run the test
console.log('🚀 Starting tunnel port extraction test...\n');
testPortExtractionMethods().then(() => {
    console.log('\n✅ Test completed');
}).catch((error) => {
    console.error('\n❌ Test failed with error:', error);
});