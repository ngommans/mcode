const { connectToCodespace } = require('./codespaceSshModule');

const host = 'cs.special-memory-r7pgwrgxr93wjj9.master'; // Host is still needed for context, but connection is via proxy
const user = 'node';
const identityFile = '/home/ngommans/.ssh/codespaces.auto';
const proxyCommand = '/usr/bin/gh cs ssh -c special-memory-r7pgwrgxr93wjj9 --stdio -- -i /home/ngommans/.ssh/codespaces.auto';

async function testConnection() {
    try {
        console.log(`Attempting to connect to ${user}@${host} using ${identityFile} via ProxyCommand`);
        const conn = await connectToCodespace(host, user, identityFile, proxyCommand);
        console.log('Successfully connected to codespace.');
    } catch (err) {
        console.error('Failed to connect to codespace:', err);
    }
}

testConnection();