# Codespace RPC Integration

This directory contains the RPC (Remote Procedure Call) integration layer for connecting to GitHub Codespace internal services. This implementation is based on the GitHub CLI's RPC invoker system.

## Architecture Overview

The RPC system enables communication with internal codespace services that provide:

- SSH server management (start/stop SSH servers)
- JupyterLab server management  
- Container rebuild operations
- Port forwarding coordination
- VS Code environment integration

## Key Components

### `CodespaceRPCInvoker.ts`

The main RPC invoker that:

1. **Establishes gRPC Connection**: Connects to the codespace's internal RPC server on port 16634
2. **Manages Authentication**: Handles bearer token authentication for RPC calls
3. **Provides SSH Management**: Starts SSH servers and retrieves connection details
4. **Maintains Keep-Alive**: Sends periodic heartbeats to prevent codespace shutdown

## How It Works

### 1. RPC Connection Flow

```
Tunnel Client → Port 16634 Forward → gRPC Client → Codespace Internal Services
```

1. The tunnel client forwards codespace internal port 16634 to a local port
2. A gRPC client connects to the forwarded local port
3. RPC calls are made to start services and get connection details

### 2. SSH Server Integration

```typescript
// Create RPC invoker
const invoker = await createInvoker(tunnelClient);

// Start SSH server in codespace
const sshResult = await invoker.startSSHServerWithOptions({
  userPublicKeyFile: '/path/to/public/key'
});

// Use the returned port and user for SSH connections
if (sshResult.success) {
  connectToSSH(sshResult.port, sshResult.user);
}
```

### 3. Benefits Over Direct Tunnel Connection

**Without RPC (Previous Approach):**
- Tunnel forwards port 22 → SSH connection attempts
- No guarantee SSH server is running
- Hardcoded assumptions about SSH configuration
- No user/authentication information

**With RPC (Current Approach):**
- RPC starts SSH server → Returns actual port and user
- Guaranteed SSH server is running and configured
- Dynamic port allocation
- Proper authentication setup

## Implementation Status

### ✅ Completed

1. **RPC Invoker Structure**: Basic gRPC client and connection management
2. **SSH Server Detection**: Check for existing SSH servers before starting new ones
3. **Port Integration**: Use RPC-provided ports instead of assumptions
4. **Error Handling**: Graceful fallback to direct tunnel connection

### 🚧 In Progress

1. **gRPC Service Definitions**: Need actual .proto files for codespace services
2. **Authentication Tokens**: Proper bearer token handling for RPC calls
3. **SSH Server RPC**: Actual `StartSSHServerWithOptions` implementation

### 📋 TODO

1. **Proto Definitions**: Generate TypeScript clients from .proto files
2. **JupyterLab Support**: Implement JupyterLab server management
3. **Container Management**: Add rebuild container functionality
4. **VS Code Integration**: Connect to VS Code server processes

## GitHub CLI Reference

This implementation mirrors the GitHub CLI's RPC system:

- `internal/codespaces/rpc/invoker.go` - Main RPC invoker
- `internal/codespaces/rpc/ssh/` - SSH service definitions
- `internal/codespaces/rpc/jupyter/` - JupyterLab service definitions
- `internal/codespaces/rpc/codespace/` - Codespace management services

## Usage Example

```typescript
import { createInvoker } from './CodespaceRPCInvoker';

// After tunnel connection is established
const rpcInvoker = await createInvoker(tunnelClient);

// Start SSH server
const sshResult = await rpcInvoker.startSSHServerWithOptions({
  userPublicKeyFile: '~/.ssh/id_rsa.pub'
});

if (sshResult.success) {
  console.log(`SSH server started on port ${sshResult.port}`);
  console.log(`Connect as user: ${sshResult.user}`);
}

// Clean up when done
await rpcInvoker.close();
```

## Future Enhancements

1. **Multiple Service Management**: Support for multiple simultaneous services
2. **Service Discovery**: Automatic detection of available services
3. **Health Monitoring**: Real-time status of codespace services
4. **VS Code Terminal Integration**: Direct access to VS Code integrated terminals
5. **Process Management**: Start/stop arbitrary processes in the codespace

This RPC layer provides the foundation for full codespace integration, enabling our terminal client to behave more like the official GitHub CLI and VS Code remote development experience.