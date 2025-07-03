const { Client } = require('ssh2');
const fs = require('fs');
const { spawn } = require('child_process');

async function connectToCodespace(host, user, identityFile, proxyCommand) {
    const conn = new Client();
    return new Promise((resolve, reject) => {
        // Parse the proxyCommand string into command and arguments
        const parts = proxyCommand.split(' ');
        const command = parts[0];
        const args = parts.slice(1);

        const proxyProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', process.stderr] // stdin, stdout, stderr
        });

        proxyProcess.on('error', (err) => {
            reject(new Error(`ProxyCommand failed to start: ${err.message}`));
        });

        proxyProcess.on('exit', (code, signal) => {
            if (code !== 0 && signal !== 'SIGTERM') {
                console.error(`ProxyCommand exited with code ${code} and signal ${signal}`);
            }
        });

        conn.on('ready', () => {
            console.log('SSH Client :: ready');
            conn.shell((err, stream) => {
                if (err) return reject(err);
                stream.on('close', () => {
                    console.log('Stream :: close');
                    conn.end();
                    proxyProcess.kill(); // Terminate the proxy process when SSH stream closes
                }).on('data', (data) => {
                    console.log('STDOUT: ' + data);
                }).stderr.on('data', (data) => {
                    console.error('STDERR: ' + data);
                });
                stream.end(`ls -la\nexit\n`); // Example command
            });
            resolve(conn);
        }).on('error', (err) => {
            reject(err);
        }).connect({
            sock: proxyProcess.stdout, // Pipe proxy process stdout to ssh2 client
            username: user,
            privateKey: fs.readFileSync(identityFile)
        });

        // Pipe ssh2 client stdin to proxy process stdin
        conn.on('tcp connection', (info, callback) => {
            callback(proxyProcess.stdin);
        });
    });
}

module.exports = { connectToCodespace };