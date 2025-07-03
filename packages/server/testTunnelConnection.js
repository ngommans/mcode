const { connectToCodespaceTunnel, createTunneledSshStream } = require('./codespaceTunnelModule');
const { exec } = require('child_process');
const net = require('net');
const pty = require('node-pty');

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
                console.log('Curl stdout:', stdout); // Add this line for debugging
                const response = JSON.parse(stdout);
                if (response.connection && response.connection.tunnelProperties) {
                    resolve(response.connection.tunnelProperties);
                } else {
                    reject(new Error('Tunnel properties not found in response.'));
                }
            } catch (parseError) {
                console.error('JSON parse error:', parseError); // Add this line for debugging
                reject(parseError);
            }
        });
    });
}

async function testTunnelConnection() {
    require('dotenv').config();

    const codespaceName = process.env.CODESPACE_NAME;
    const githubToken = process.env.GITHUB_TOKEN;
    const localPort = 2222; // Local port for SSH to connect to

    try {
        console.log(`Fetching tunnel properties for codespace: ${codespaceName} using direct API call.`);
        const tunnelProperties = await getTunnelProperties(codespaceName, githubToken);
        console.log('Tunnel Properties fetched:', tunnelProperties);

        console.log('Attempting to connect to codespace tunnel...');
        const tunnelClient = await connectToCodespaceTunnel(tunnelProperties, githubToken);
        console.log('Tunnel client established.');

        // Create a local TCP server to proxy SSH connections
        const server = net.createServer((socket) => {
            console.log('Local SSH client connected.');
            createTunneledSshStream(tunnelClient).then((sshStream) => {
                socket.pipe(sshStream).pipe(socket);
                sshStream.on('close', () => {
                    console.log('Tunneled SSH stream closed.');
                    socket.end();
                });
                socket.on('close', () => {
                    console.log('Local SSH client disconnected.');
                    sshStream.end();
                });
            }).catch((err) => {
                console.error('Error creating tunneled SSH stream:', err);
                socket.end();
            });
        });

        server.listen(localPort, () => {
            console.log(`Local SSH proxy listening on port ${localPort}`);
            console.log('Now, you can connect via SSH using:');
            console.log(`ssh -p ${localPort} localhost`);

            // Optionally, spawn a pty process to test the SSH connection
            /*
            const sshArgs = [
                '-p',
                localPort.toString(),
                'localhost',
                // Add any other SSH arguments you need, e.g., user, identity file
                '-l', 'node',
                // '-i', '/home/ngommans/.ssh/codespaces.auto'
            ];

            const ptyProcess = pty.spawn('ssh', sshArgs, {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: process.env.HOME,
                env: process.env
            });

            ptyProcess.onData((data) => {
                process.stdout.write(data);
            });

            ptyProcess.onExit(({ exitCode, signal }) => {
                console.log(`SSH process exited with code ${exitCode}, signal ${signal}`);
                server.close();
                tunnelClient.dispose();
            });

            process.stdin.on('data', (data) => {
                ptyProcess.write(data.toString());
            });

            process.stdin.setRawMode(true);
            process.stdin.resume();
            */
        });

        server.on('error', (err) => {
            console.error('Local SSH proxy server error:', err);
            tunnelClient.dispose();
        });

    } catch (err) {
        console.error('Failed to establish tunnel connection:', err);
    }
}

testTunnelConnection();