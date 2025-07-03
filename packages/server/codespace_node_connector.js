// codespace_node_connector.js
// This script now connects to a GitHub Codespace via a tunnel and establishes an SSH connection,
// bypassing the need for a local port forward.

const WebSocket = require('ws');
const https = require('https');
const { URL } = require('url');
const os = require('os');
const path = require('path');
const { Client } = require('ssh2');
const fs = require('fs');
const { forwardSshPortOverTunnel } = require('./codespaceTunnelModule');

// This class connects to the hardcoded local SSH server using the ssh2 library.
class Ssh2Connector {
    async connectViaSSH(onTerminalData, onTerminalError, port) {
        return new Promise((resolve, reject) => {
			//TODO: HARDCODED - this needs to come in from somewhere else gh cs ssh generates it on the fly and injects if unavailable: https://github.com/cli/cli/pull/5752/files ( Automatically create ssh keys in gh cs ssh )
            const userHomeDir = os.homedir();
            const identityFilePath = process.platform === "win32"
                ? path.join(userHomeDir, '.ssh', 'id_ed25519')
                : path.join(userHomeDir, '.ssh', 'id_ed25519');

            console.log(`[INFO] Using SSH identity file: ${identityFilePath}`);
            
            const privateKey = fs.readFileSync(identityFilePath);

            const conn = new Client();
            conn.on('ready', () => {
                console.log('[ssh2] Client :: ready');
                conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
                    if (err) {
                        onTerminalError(err.message);
                        return reject(err);
                    }
                    stream.on('close', () => {
                        console.log('[ssh2] stream :: close');
                        conn.end();
                        onTerminalError('Terminal session closed.');
                    }).on('data', (data) => {
                        onTerminalData(data.toString());
                    }).stderr.on('data', (data) => {
                        onTerminalData(data.toString()); // Also forward stderr to the terminal
                    });

                    resolve({
                        write: (data) => stream.write(data),
                        resize: (cols, rows) => stream.setWindow(rows, cols, 0, 0),
                        close: () => conn.end()
                    });
                });
            }).on('error', (err) => {
                console.error('[ssh2] Client :: error', err);
                onTerminalError(err.message);
                reject(err);
            }).connect({
                host: 'localhost',
                port: port,
                username: 'node',
                privateKey: privateKey,
                debug: (str) => { console.log('[SSH2 DEBUG]', str); }
            });
        });
    }
}


// This class is mostly the same as the original, using the GitHub API.
class GitHubCodespaceConnector {
    constructor(accessToken, ws, server) {
        this.accessToken = accessToken;
        this.ws = ws;
        this.server = server;
        console.log(`[DEBUG] GitHubCodespaceConnector initialized for test harness.`);
    }

    async listCodespaces() {
        // This method is identical to the original.
        const options = {
            hostname: 'api.github.com',
            path: '/user/codespaces',
            method: 'GET',
            headers: {
                'Authorization': `token ${this.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MinimalTerminalClient/1.0'
            }
        };
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        return reject(new Error(`GitHub API Error: ${res.statusCode} ${data}`));
                    }
                    try {
                        resolve(JSON.parse(data).codespaces || []);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            req.on('error', (e) => reject(e));
            req.end();
        });
    }

    async getTunnelProperties(codespaceName) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: `/user/codespaces/${codespaceName}?internal=true&refresh=true`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'User-Agent': 'MinimalTerminalClient/1.0'
                }
            };
    
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        return reject(new Error(`GitHub API Error: ${res.statusCode} ${data}`));
                    }
                    try {
                        const response = JSON.parse(data);
                        if (response.connection && response.connection.tunnelProperties) {
                            resolve(response.connection.tunnelProperties);
                        } else {
                            reject(new Error('Tunnel properties not found in response.'));
                        }
                    } catch (parseError) {
                        reject(parseError);
                    }
                });
            });
    
            req.on('error', (e) => {
                reject(e);
            });
    
            req.end();
        });
    }

    // This is the key difference: connectToCodespace is intercepted.
    async connectToCodespace(codespaceName, onTerminalData, ws) {
        try {
            console.log(`[INFO] Intercepting connection request for codespace: ${codespaceName}`);

            // If there's an existing tunnel client, dispose of it.
            if (ws.tunnelClient) {
                console.log('[INFO] Disposing of existing tunnel client.');
                ws.tunnelClient.dispose();
                ws.tunnelClient = null;
            }
            
            const tunnelProperties = await this.getTunnelProperties(codespaceName);
            const { localPort, tunnelClient } = await forwardSshPortOverTunnel(tunnelProperties);
            ws.tunnelClient = tunnelClient; // Store the new tunnel client on the ws session.

            console.log(`[INFO] Connecting to local port ${localPort}`);

            const sshConnector = new Ssh2Connector();
            const terminalConnection = await sshConnector.connectViaSSH(
                (data) => { onTerminalData(data); },
                (error) => {
                    console.error('[SSH Terminal Error]', error);
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        this.server.sendError(ws, error.toString());
                        this.sendCodespaceState(ws, codespaceName, 'Shutdown');
                    }
                },
                localPort
            );

            this.sendCodespaceState(ws, codespaceName, 'Connected', `tunnel -> ${codespaceName}`);
            return terminalConnection;

        } catch (error) {
            console.error('Failed to connect to codespace test harness:', error);
            this.sendCodespaceState(ws, codespaceName, 'Disconnected');
            throw error;
        }
    }

    sendCodespaceState(ws, codespaceName, state, repositoryFullName = null) {
        if (this.server && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.server.sendMessage(this.ws, {
                type: 'codespace_state',
                codespace_name: codespaceName,
                state: state,
                repository_full_name: repositoryFullName
            });
        }
    }
}

// This server is also mostly the same as the original.
class CodespaceTerminalServer {
    constructor(port) {
        this.port = port;
        this.wss = null;
        this.init();
    }

    init() {
        this.wss = new WebSocket.Server({ port: this.port });
        console.log(`Codespace Test Harness Server started on port ${this.port}`);
        this.wss.on('connection', (ws) => {
            console.log('New client connected to test harness');
            this.handleConnection(ws);
        });
    }

    handleConnection(ws) {
        ws.connector = null;
        ws.terminalConnection = null;
        ws.codespaceName = null;
        ws.tunnelClient = null; // Initialize tunnelClient to null

        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                await this.handleMessage(ws, message);
            } catch (error) {
                console.error('Error handling message:', error);
                this.sendError(ws, error.message);
            }
        });

        ws.on('close', () => {
            if (ws.terminalConnection) {
                ws.terminalConnection.close();
            }
            if (ws.tunnelClient) {
                console.log('[INFO] Disposing of tunnel client on WebSocket close.');
                ws.tunnelClient.dispose();
            }
        });
    }

    async handleMessage(ws, message) {
        console.log(`[DEBUG] Server received message type: ${message.type}`);
        switch (message.type) {
            case 'authenticate':
                ws.connector = new GitHubCodespaceConnector(message.token, ws, this);
                this.sendMessage(ws, {
                    type: 'authenticated',
                    success: true
                });
                break;

            case 'list_codespaces':
                if (!ws.connector) return this.sendError(ws, 'Not authenticated.');
                const codespaces = await ws.connector.listCodespaces();
                this.sendMessage(ws, {
                    type: 'codespaces_list',
                    data: codespaces
                });
                break;

            case 'connect_codespace':
                if (!ws.connector) return this.sendError(ws, 'Not authenticated.');
                if (ws.terminalConnection) ws.terminalConnection.close();

                ws.terminalConnection = await ws.connector.connectToCodespace(
                    message.codespace_name,
                    (data) => {
                        this.sendMessage(ws, { type: 'output', data: data });
                    },
                    ws
                );
                ws.codespaceName = message.codespace_name;
                break;

            case 'disconnect_codespace':
                if (ws.terminalConnection) {
                    ws.terminalConnection.close();
                    ws.terminalConnection = null;
                    if (ws.tunnelClient) {
                        console.log('[INFO] Disposing of tunnel client on disconnect.');
                        ws.tunnelClient.dispose();
                        ws.tunnelClient = null;
                    }
                    if (ws.codespaceName && ws.connector) {
                        ws.connector.sendCodespaceState(ws, ws.codespaceName, 'Shutdown');
                    }
                    this.sendMessage(ws, { type: 'disconnected_from_codespace' });
                }
                break;

            case 'input':
                if (ws.terminalConnection) {
                    ws.terminalConnection.write(message.data);
                }
                break;

            case 'resize':
                if (ws.terminalConnection && ws.terminalConnection.resize) {
                    ws.terminalConnection.resize(message.cols, message.rows);
                }
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    sendMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    sendError(ws, error) {
        this.sendMessage(ws, {
            type: 'error',
            message: error.toString()
        });
    }
}

if (require.main === module) {
    const port = 3002;
    const server = new CodespaceTerminalServer(port);
}

module.exports = {
    CodespaceTerminalServer
};