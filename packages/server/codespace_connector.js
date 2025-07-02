// codespace-connector.js
// Example implementation for connecting to GitHub Codespaces

const WebSocket = require('ws');
const pty = require('node-pty');
const https = require('https');
const { URL } = require('url');

class GitHubCodespaceConnector {
    constructor(accessToken, ws, server) {
        this.accessToken = accessToken;
        this.ws = ws; // Store the WebSocket connection for sending state updates
        this.server = server; // Store the server instance to access sendMessage
        console.log(`[DEBUG] GitHubCodespaceConnector initialized with token: ${accessToken ? '*****' + accessToken.substring(accessToken.length - 4) : 'None'}`);
        this.codespaces = new Map();
    }
    
    /**
     * List available codespaces for the authenticated user
     */
    async listCodespaces() {
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
        
        console.log(`[DEBUG] Requesting: ${options.method} https://${options.hostname}${options.path}`);
        
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    console.log(`[DEBUG] Response Status: ${res.statusCode}`);
                    try {
                        const result = JSON.parse(data);
                        console.log(`[DEBUG] Response Data: ${JSON.stringify(result)}`);
                        resolve(result.codespaces || []);
                    } catch (error) {
                        console.error(`[ERROR] Failed to parse response: ${error.message}`);
                        reject(error);
                    }
                });
            });
            
            req.on('error', (e) => {
                console.error(`[ERROR] Request error: ${e.message}`);
                reject(e);
            });
            req.end();
        });
    }
    
    /**
     * Get connection details for a specific codespace
     */
    async getCodespaceConnection(codespaceName) {
        const options = {
            hostname: 'api.github.com',
            path: `/user/codespaces/${codespaceName}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${this.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MinimalTerminalClient/1.0'
            }
        };
        
        console.log(`[DEBUG] Requesting: ${options.method} https://${options.hostname}${options.path}`);
        
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    console.log(`[DEBUG] Response Status: ${res.statusCode}`);
                    try {
                        const codespace = JSON.parse(data);
                        console.log(`[DEBUG] Response Data: ${JSON.stringify(codespace)}`);
                        resolve(codespace);
                    } catch (error) {
                        console.error(`[ERROR] Failed to parse response: ${error.message}`);
                        reject(error);
                    }
                });
            });
            
            req.on('error', (e) => {
                console.error(`[ERROR] Request error: ${e.message}`);
                reject(e);
            });
            req.end();
        });
    }

    async getSshConfigForCodespace(codespaceName) {
        const { exec } = require('child_process');
        return new Promise((resolve, reject) => {
            const command = `gh codespace ssh --codespace ${codespaceName} --config`;
            console.log(`[DEBUG] Executing command: ${command}`);
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[ERROR] gh codespace ssh --config exec error: ${error.message}`);
                    console.error(`[ERROR] gh codespace ssh --config stderr: ${stderr}`);
                    return reject(new Error(`Failed to execute gh codespace ssh --config: ${error.message}. Stderr: ${stderr}`));
                }
                if (stderr) {
                    console.warn(`[WARN] gh codespace ssh --config stderr: ${stderr}`);
                }
                console.log(`[DEBUG] gh codespace ssh --config stdout:\n${stdout}`);

                const config = {};
                stdout.split('\n').forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        config[parts[0]] = parts.slice(1).join(' ');
                    }
                });
                // Extract relevant SSH parameters
                const hostname = config['Host']; // Use 'Host' instead of 'HostName'
                const user = config['User'];
                const identityFile = config['IdentityFile'];
                const proxyCommand = config['ProxyCommand'];

                if (!hostname || !user || !identityFile || !proxyCommand) {
                    console.error(`[ERROR] Failed to parse SSH config. Missing one or more of: Host, User, IdentityFile, ProxyCommand. Parsed config: ${JSON.stringify(config)}`);
                    return reject(new Error('Failed to parse SSH config from gh CLI. Missing required fields.'));
                }
                resolve({ hostname, user, identityFile, proxyCommand });
            });
        });
    }
    
    /**
     * Create a terminal connection to a codespace
     * Note: This is a simplified example - actual VS Code Server protocol is more complex
     */
    async connectToCodespace(codespaceName, onTerminalData, ws) {
        try {
            const codespace = await this.getCodespaceConnection(codespaceName);
            
            if (codespace.state === 'Shutdown') {
                console.log(`[INFO] Codespace ${codespaceName} is Shutdown. Attempting to start...`);
                this.sendCodespaceState(ws, codespaceName, 'Starting');
                await this.startCodespace(codespaceName);
                // Poll until the codespace is available
                let retries = 0;
                const maxRetries = 30; // Wait up to 60 seconds (2s * 30)
                while (codespace.state !== 'Available' && retries < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds
                    codespace = await this.getCodespaceConnection(codespaceName);
                    console.log(`[INFO] Codespace ${codespaceName} state: ${codespace.state} (retry ${retries + 1}/${maxRetries})`);
                    this.sendCodespaceState(ws, codespaceName, codespace.state);
                    retries++;
                }
                if (codespace.state !== 'Available') {
                    throw new Error(`Failed to start codespace ${codespaceName}. Current state: ${codespace.state}`);
                }
            } else if (codespace.state !== 'Available') {
                throw new Error(`Codespace is not available. Current state: ${codespace.state}`);
            }
            
            // Using SSHCodespaceConnector for a more robust connection
            const sshConnector = new SSHCodespaceConnector(this); // Pass GitHubCodespaceConnector instance
            const terminalConnection = await sshConnector.connectViaSSH(
                codespace.name,
                (data) => { onTerminalData(data); },
                (error) => { 
                    console.error('[SSH Terminal Error]', error);
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'error', message: error }));
                    }
                }
            );
            this.sendCodespaceState(ws, codespaceName, 'Connected');
            return terminalConnection;
            
        } catch (error) {
            console.error('Failed to connect to codespace:', error);
            this.sendCodespaceState(ws, codespaceName, 'Disconnected'); // Or previous state if known
            throw error;
        }
    }

    async startCodespace(codespaceName) {
        const codespace = await this.getCodespaceConnection(codespaceName);
        if (!codespace || !codespace.start_url) {
            throw new Error(`Codespace ${codespaceName} not found or no start URL.`);
        }

        const url = new URL(codespace.start_url);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `token ${this.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MinimalTerminalClient/1.0',
                'Content-Length': 0 // POST request with no body
            }
        };

        console.log(`[DEBUG] Requesting: ${options.method} https://${options.hostname}${options.path}`);

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    console.log(`[DEBUG] Response Status: ${res.statusCode}`);
                    try {
                        const result = JSON.parse(data);
                        console.log(`[DEBUG] Response Data: ${JSON.stringify(result)}`);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(result);
                        } else {
                            reject(new Error(`Failed to start codespace: ${result.message || 'Unknown error'}`));
                        }
                    } catch (error) {
                        console.error(`[ERROR] Failed to parse response: ${error.message}`);
                        reject(error);
                    }
                });
            });
            req.on('error', (e) => {
                console.error(`[ERROR] Request error: ${e.message}`);
                reject(e);
            });
            req.end();
        });
    }

    async stopCodespace(codespaceName) {
        const codespace = await this.getCodespaceConnection(codespaceName);
        if (!codespace || !codespace.stop_url) {
            throw new Error(`Codespace ${codespaceName} not found or no stop URL.`);
        }

        const url = new URL(codespace.stop_url);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `token ${this.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MinimalTerminalClient/1.0',
                'Content-Length': 0 // POST request with no body
            }
        };

        console.log(`[DEBUG] Requesting: ${options.method} https://${options.hostname}${options.path}`);

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    console.log(`[DEBUG] Response Status: ${res.statusCode}`);
                    try {
                        const result = JSON.parse(data);
                        console.log(`[DEBUG] Response Data: ${JSON.stringify(result)}`);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(result);
                        } else {
                            reject(new Error(`Failed to stop codespace: ${result.message || 'Unknown error'}`));
                        }
                    } catch (error) {
                        console.error(`[ERROR] Failed to parse response: ${error.message}`);
                        reject(error);
                    }
                });
            });
            req.on('error', (e) => {
                console.error(`[ERROR] Request error: ${e.message}`);
                reject(e);
            });
            req.end();
        });
    }

    sendCodespaceState(ws, codespaceName, state) {
        if (this.server && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.server.sendMessage(this.ws, {
                type: 'codespace_state',
                codespace_name: codespaceName,
                state: state
            });
        }
    }
    
    /**
     * Build the WebSocket URL for the terminal connection
     * Note: This is speculative - actual VS Code Server endpoints may differ
     */
    buildTerminalUrl(webUrl) {
        const url = new URL(webUrl);
        // Convert HTTPS to WSS
        return `wss://${url.hostname}${url.pathname}`; // Use the full path from web_url
    }
    
    /**
     * Create the actual WebSocket connection to the terminal
     */
    createTerminalConnection(terminalUrl, onTerminalData) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(terminalUrl, {
                headers: {
                    'Authorization': `token ${this.accessToken}`,
                    'Origin': 'https://github.dev'
                }
            });
            
            ws.on('open', () => {
                console.log('Connected to codespace terminal');
                
                // Send initial terminal setup
                ws.send(JSON.stringify({
                    type: 'create',
                    data: {
                        cols: 80,
                        rows: 24,
                        shell: '/bin/bash'
                    }
                }));
                
                resolve(ws);
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'data' && onTerminalData) {
                        onTerminalData(message.data);
                    }
                } catch (error) {
                    // Handle raw terminal data
                    if (onTerminalData) {
                        onTerminalData(data.toString());
                    }
                }
            });
            
            ws.on('error', (error) => {
                console.error('Terminal connection error:', error);
                reject(error);
            });
            
            ws.on('close', () => {
                console.log('Terminal connection closed');
            });
        });
    }
}

// Enhanced Terminal Server with Codespace support
class CodespaceTerminalServer {
    constructor(port) {
        this.port = port || 3001;
        this.wss = null;
        this.connectors = new Map(); // Store codespace connectors per user
        
        this.init();
    }
    
    init() {
        this.wss = new WebSocket.Server({ port: this.port });
        
        console.log(`Codespace Terminal Server started on port ${this.port}`);
        
        this.wss.on('connection', (ws, req) => {
            console.log('New client connected');
            this.handleConnection(ws);
        });
    }
    
    handleConnection(ws) {
        ws.connector = null;
        ws.terminalConnection = null;
        ws.codespaceName = null; // To store the currently connected codespace name
        
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                // Pass ws to handleMessage so it can be used for state updates
                await this.handleMessage(ws, message, ws.connector, ws.terminalConnection);
            } catch (error) {
                console.error('Error handling message:', error);
                this.sendError(ws, error.message);
            }
        });
        
        ws.on('close', () => {
            if (ws.terminalConnection) {
                ws.terminalConnection.close();
            }
            // Clean up connector if it exists
            if (ws.connector) {
                // Potentially stop the codespace if it was started by this connection
                // This is a design decision, for now, just clean up references
                ws.connector = null;
            }
        });
    }
    
    async handleMessage(ws, message, connector, terminalConnection) {
        console.log(`[DEBUG] Server received message type: ${message.type}`);
        switch (message.type) {
            case 'authenticate':
                ws.connector = new GitHubCodespaceConnector(message.token, ws, this); // Pass ws and this (server instance)
                this.sendMessage(ws, {
                    type: 'authenticated',
                    success: true
                });
                break;
                
            case 'list_codespaces':
                if (!ws.connector) {
                    throw new Error('Not authenticated. Please send an authenticate message first.');
                }
                const codespaces = await ws.connector.listCodespaces();
                this.sendMessage(ws, {
                    type: 'codespaces_list',
                    data: codespaces
                });
                break;
                
            case 'connect_codespace':
                if (!ws.connector) {
                    throw new Error('Not authenticated. Please send an authenticate message first.');
                }
                // Close existing terminal connection if any
                if (ws.terminalConnection) {
                    ws.terminalConnection.close();
                }
                ws.terminalConnection = await ws.connector.connectToCodespace(
                    message.codespace_name,
                    (data) => {
                        this.sendMessage(ws, {
                            type: 'output',
                            data: data
                        });
                    },
                    ws // Pass the WebSocket object here
                );
                ws.codespaceName = message.codespace_name; // Store the connected codespace name
                break;

            case 'disconnect_codespace':
                if (ws.terminalConnection) {
                    ws.terminalConnection.close();
                    ws.terminalConnection = null;
                    // Send state update to client
                    if (ws.codespaceName && ws.connector) {
                        ws.connector.sendCodespaceState(ws, ws.codespaceName, 'Shutdown');
                    }
                    this.sendMessage(ws, { type: 'disconnected_from_codespace' });
                } else {
                    this.sendError(ws, 'Not connected to any codespace.');
                }
                break;

            case 'start_codespace':
                if (!ws.connector) {
                    throw new Error('Not authenticated. Please send an authenticate message first.');
                }
                try {
                    ws.connector.sendCodespaceState(ws, message.codespace_name, 'Starting');
                    await ws.connector.startCodespace(message.codespace_name);
                    // After starting, get the updated state and send it
                    const updatedCodespace = await ws.connector.getCodespaceConnection(message.codespace_name);
                    ws.connector.sendCodespaceState(ws, message.codespace_name, updatedCodespace.state);
                } catch (error) {
                    console.error('Failed to start codespace:', error);
                    this.sendError(ws, `Failed to start codespace: ${error.message}`);
                    // Revert state if start fails
                    const currentCodespace = await ws.connector.getCodespaceConnection(message.codespace_name);
                    ws.connector.sendCodespaceState(ws, message.codespace_name, currentCodespace.state);
                }
                break;

            case 'stop_codespace':
                if (!ws.connector) {
                    throw new Error('Not authenticated. Please send an authenticate message first.');
                }
                try {
                    ws.connector.sendCodespaceState(ws, message.codespace_name, 'Stopping');
                    await ws.connector.stopCodespace(message.codespace_name);
                    // After stopping, get the updated state and send it
                    const updatedCodespace = await ws.connector.getCodespaceConnection(message.codespace_name);
                    ws.connector.sendCodespaceState(ws, message.codespace_name, updatedCodespace.state);
                } catch (error) {
                    console.error('Failed to stop codespace:', error);
                    this.sendError(ws, `Failed to stop codespace: ${error.message}`);
                    // Revert state if stop fails
                    const currentCodespace = await ws.connector.getCodespaceConnection(message.codespace_name);
                    ws.connector.sendCodespaceState(ws, message.codespace_name, currentCodespace.state);
                }
                break;
                
            case 'input':
                console.log(`[DEBUG] Received input: ${JSON.stringify(message.data)}`);
                if (ws.terminalConnection) {
                    ws.terminalConnection.write(message.data);
                }
                break;
                
            case 'resize':
                if (ws.terminalConnection && ws.terminalConnection.resize) {
                    ws.terminalConnection.resize(message.cols, message.rows);
                }
                break;

            case 'query_codespace_status':
                if (!ws.connector) {
                    this.sendError(ws, 'Not authenticated.');
                    return;
                }
                let status = 'Disconnected';
                if (ws.terminalConnection && ws.terminalConnection.ptyProcess && ws.terminalConnection.ptyProcess.pid) {
                    // If there's an active pty process, assume connected for now
                    // A more robust check would involve sending a test command and waiting for response
                    status = 'Connected';
                } else if (ws.codespaceName) {
                    // If a codespace was selected but not connected, assume shutdown
                    status = 'Shutdown';
                }
                this.sendMessage(ws, {
                    type: 'codespace_connection_status',
                    codespace_name: ws.codespaceName,
                    state: status
                });
                break;

            case 'connect_to_repo_codespace':
                if (!ws.connector) {
                    this.sendError(ws, 'Not authenticated. Please send an authenticate message first.');
                    return;
                }
                const repoUrl = message.repo_url;
                try {
                    const codespaces = await ws.connector.listCodespaces();
                    const matchingCodespace = codespaces.find(cs => cs.repository && cs.repository.html_url === repoUrl);

                    if (matchingCodespace) {
                        console.log(`[INFO] Found codespace '${matchingCodespace.name}' for repository ${repoUrl}. Connecting...`);
                        // Close existing terminal connection if any
                        if (ws.terminalConnection) {
                            ws.terminalConnection.close();
                        }
                        ws.terminalConnection = await ws.connector.connectToCodespace(
                            matchingCodespace.name,
                            (data) => {
                                this.sendMessage(ws, {
                                    type: 'output',
                                    data: data
                                });
                            },
                            ws
                        );
                        ws.codespaceName = matchingCodespace.name;
                    } else {
                        this.sendError(ws, `No codespace found for repository: ${repoUrl}`);
                    }
                } catch (error) {
                    console.error(`[ERROR] Failed to connect to codespace for repo ${repoUrl}:`, error);
                    this.sendError(ws, `Failed to connect to codespace for repository: ${repoUrl}. Error: ${error.message}`);
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
            message: error
        });
    }
}

// Alternative approach using SSH tunneling to codespaces
class SSHCodespaceConnector {
    constructor(gitHubConnector) {
        this.gitHubConnector = gitHubConnector;
        this.connections = new Map();
    }
    
    /**
     * Connect to codespace via SSH tunnel
     * This approach uses the GitHub CLI or direct SSH connection
     */
    async connectViaSSH(codespaceName, onTerminalData, onTerminalError) {
        return new Promise(async (resolve, reject) => {
            let sshConfig;
            try {
                sshConfig = await this.gitHubConnector.getSshConfigForCodespace(codespaceName);
            } catch (err) {
                return reject(new Error(`Failed to get SSH config: ${err.message}`));
            }

            const sshArgs = [
                `${sshConfig.user}@${sshConfig.hostname}`,
                '-i', sshConfig.identityFile,
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                '-o', `ProxyCommand=${sshConfig.proxyCommand}`,
                '-tt', // Force pseudo-terminal allocation, even if stdin is not a TTY
                'bash', // The shell to execute on the remote codespace
                '-l' // Make it a login shell
            ];

            const ptyProcess = pty.spawn('ssh', sshArgs, {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: process.env.HOME, // Or a more appropriate default
                env: process.env
            });

            ptyProcess.onData((data) => {
                onTerminalData(data);
            });

            ptyProcess.onExit(({ exitCode, signal }) => {
                console.log(`PTY process exited with code ${exitCode} and signal ${signal}`);
                onTerminalError(`Terminal session ended. Exit code: ${exitCode}`);
            });

            ptyProcess.on('error', (err) => {
                console.error('PTY process error:', err);
                reject(err);
            });

            // Give it a moment to start up
            setTimeout(() => {
                if (ptyProcess.pid) {
                    resolve({
                        write: (data) => ptyProcess.write(data),
                        resize: (cols, rows) => ptyProcess.resize(cols, rows),
                        close: () => ptyProcess.kill()
                    });
                } else {
                    reject(new Error('PTY process did not start.'));
                }
            }, 1000);
        });
    }
}

// Usage example
async function demonstrateCodespaceConnection() {
    const accessToken = process.env.GITHUB_TOKEN;
    
    if (!accessToken) {
        console.error('GITHUB_TOKEN environment variable is required');
        return;
    }
    
    try {
        const connector = new GitHubCodespaceConnector(accessToken);
        
        // List available codespaces
        const codespaces = await connector.listCodespaces();
        console.log('Available codespaces:', codespaces.map(c => c.name));
        
        if (codespaces.length > 0) {
            const firstCodespace = codespaces[0];
            console.log(`Connecting to: ${firstCodespace.name}`);
            
            // Connect to the first available codespace
            const terminal = await connector.connectToCodespace(
                firstCodespace.name,
                (data) => {
                    process.stdout.write(data);
                }
            );
            
            // Send a test command
            terminal.send(JSON.stringify({
                type: 'input',
                data: 'echo "Hello from terminal client!"\n'
            }));
            
        } else {
            console.log('No codespaces available');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    const port = process.argv[2] ? parseInt(process.argv[2], 10) : 3001;
    const server = new CodespaceTerminalServer(port);
    
    // Demonstration (uncomment to test)
    // demonstrateCodespaceConnection();
}

module.exports = {
    GitHubCodespaceConnector,
    CodespaceTerminalServer,
    SSHCodespaceConnector
};