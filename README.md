# Minimal Terminal Client (mcode) for VS Code Codespaces

This project demonstrates a minimal terminal-only client that can connect to remote development environments, specifically designed to work with VS Code Codespaces and remote servers.

## Architecture Overview

The solution consists of three main components:

1.  **Frontend Client** (`packages/client/index.html`): A minimal web interface using xterm.js for terminal emulation.
2.  **WebSocket Server** (`server.js`): A Node.js proxy server that handles WebSocket connections from the client and manages interactions with remote environments.
3.  **Codespace Integration**: The server layer responsible for connecting to GitHub Codespaces, leveraging the GitHub CLI (`gh`) and SSH for robust terminal access.

## Features

-   🖥️ **Terminal-only interface** - No file explorer, editor, or other VS Code UI elements.
-   🔗 **WebSocket-based communication** - Real-time terminal I/O between client and server.
-   🎨 **VS Code-like theming** - Familiar dark theme and terminal styling.
-   🔄 **Auto-reconnection** - Automatically attempts to reconnect on connection loss.
-   🔐 **Authentication support** - Token-based authentication for secure connections to GitHub.
-   📱 **Responsive design** - Works on desktop and mobile devices.
-   ⚡ **Lightweight** - Minimal dependencies and fast loading.
-   **Dynamic Codespace Management:** Client UI includes "Start/Stop Codespace" button, dynamically changing based on codespace state. "Connect Codespace" button changes to "Disconnect Codespace" when connected. Server-side logic to start a codespace if it's in a "Shutdown" state upon connection attempt. Server-side handlers for explicit "start" and "stop" codespace requests.
-   **Improved Terminal Connectivity:** Switched to SSH tunneling via `gh codespace ssh --config` and `node-pty` for more robust terminal connections, resolving previous WebSocket redirection issues. Enhanced error reporting for SSH connection failures directly to the client terminal.
-   **Client-Side Enhancements:** Terminal height now dynamically fills the remaining browser window space using flexbox CSS and `xterm-addon-fit`. Ability to connect to a codespace by providing a GitHub repository URL.
-   **Port Configuration:** Client and server default ports adjusted to avoid conflicts (client on 8080, server on 3001). The client now automatically sends the Gemini CLI command upon successful connection if the "Google" shell type is selected and an API key is provided.
-   **Port Forwarding & Monitoring:** Real-time port tracking with automatic detection of user-initiated vs management ports. Interactive port status dialog accessible via network icon in status bar, showing clickable URLs for web applications. Dynamic port count updates and comprehensive port information extraction from tunnel client.

## Installation & Setup

### Prerequisites

```bash
# Install Node.js dependencies
npm init -y
npm install ws node-pty
```

### GitHub CLI and SSH
Ensure GitHub CLI (`gh`) is installed and configured, and `ssh` client is available in your system's PATH.

### Package.json Configuration

```json
{
  "name": "minimal-terminal-client",
  "version": "1.0.0",
  "description": "Minimal terminal-only client for VS Code Codespaces",
  "main": "packages/server/codespace_connector.js",
  "scripts": {
    "start": "npm run start --workspace=server",
    "client": "cd packages/client && npx serve -l 8080 .",
    "test": "npm test --workspace=server"
  },
  "dependencies": {
    "serve": "^14.2.4"
  }
}
```

### Environment Configuration

Create a `.env` file in the project root:

```bash
# Server configuration
PORT=3001

# GitHub Personal Access Token with 'codespace' scope
GITHUB_TOKEN=your-github-personal-access-token-with-codespace-scope
```

## Running the Application

### 1. Start the WebSocket Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### 2. Serve the Client

```bash
# Using npx serve (simple HTTP server)
npm run client

# The client will be available at http://localhost:8080
```

### 3. Connect to Remote Terminal

1.  Open the client in your browser (e.g., `http://localhost:8080`)
2.  Enter your GitHub Token in the input field and click "Authenticate". If you intend to use the Gemini CLI, ensure you select "Google" as the shell type and provide your Gemini API Key.
3.  Select a Codespace from the dropdown or enter a GitHub Repository URL (e.g., `https://github.com/ngommans/mcode.git`) and click "Connect to Repo Codespace".
4.  Click "Connect Codespace" to establish the terminal session. The button will change to "Disconnect Codespace" when connected.

## Port Information Extraction

### Understanding Tunnel Ports

The application provides comprehensive port information extraction capabilities through the tunnel client. Here's how to identify and work with different types of ports:

#### Port Categories

1. **User-Initiated Ports**: Ports that you specifically forward (e.g., SSH port 22)
2. **Management Ports**: Internal ports used by the codespace infrastructure (e.g., ports 16634, 16635)
3. **Application Ports**: Ports forwarded for web applications running in the codespace

#### Extracting Port Information

The tunnel client provides several methods to extract port information:

```javascript
// 1. Via Management API (most reliable)
const existingPorts = await tunnelManagementClient.listTunnelPorts(tunnel, {
    tokenScopes: [TunnelAccessScopes.ManagePorts],
    accessToken: tunnelProperties.managePortsAccessToken,
});

// 2. Via client.endpoints (provides URL templates)
const endpoints = client.endpoints; // Array of endpoint objects
const portUriFormat = endpoints[0].portUriFormat; // "https://codespace-name-{port}.app.github.dev/"
const portSshFormat = endpoints[0].portSshCommandFormat; // "ssh codespace-name-{port}@ssh.app.github.dev"

// 3. Via connected tunnel object
const connectedTunnel = client.connectedTunnel;
const tunnelEndpoints = connectedTunnel.endpoints;
```

#### Identifying User vs Management Ports

User-initiated ports can be identified by their labels:

```javascript
const userPorts = existingPorts.filter(port => 
    port.labels && port.labels.includes('UserForwardedPort')
);

const managementPorts = existingPorts.filter(port => 
    port.labels && port.labels.includes('InternalPort')
);
```

#### Port Information Structure

Each port object contains:
- `portNumber`: The actual port number (e.g., 22, 3000, 8080)
- `protocol`: The protocol type (http, https, ssh)
- `portForwardingUris`: Array of accessible URLs
- `labels`: Array indicating port type (UserForwardedPort, InternalPort)
- `accessControl`: Security settings for the port

#### Testing Port Extraction

Use the provided test script to systematically examine port information:

```bash
cd packages/server
node testTunnelPorts.js
```

**What the test script does:**
- Connects to your active codespace using tunnel properties
- Lists and categorizes all existing ports (user vs management)
- Tests multiple port extraction methods (`forwardedPorts()`, `client.endpoints`, etc.)
- Attempts port forwarding to trigger `tunnelChanged` events
- Provides detailed output for debugging port detection issues

**Requirements:**
- Active codespace (update the `codespaceName` variable in the script)
- Valid GitHub token with codespace access
- Codespace must be in "Available" state

This script provides detailed inspection of all available port extraction methods and properties, helping debug any port detection issues.

## Recent Updates & Implementation Status

### ✅ Completed Features

1. **Port Information Extraction System**
   - Comprehensive port tracking using Microsoft Dev Tunnels API
   - Automatic categorization of user-initiated vs management ports
   - Real-time port status updates with WebSocket communication

2. **Enhanced Server-Side Architecture**
   - Updated `codespaceTunnelModule.js` with systematic port extraction
   - Implemented `getPortInformation()` function for dynamic port querying
   - Server-side hooks in both `codespace_node_connector.js` and `codespace_connector.js`
   - Automatic local port detection for SSH forwarding (resolves hardcoded port 2222)

3. **Interactive Client UI**
   - Network status indicator with dynamic port count in status bar
   - Clickable port dialog showing all forwarded ports with URLs
   - VS Code-like interface with radio tower icon for port status
   - Real-time updates when ports are added/removed

4. **Port Dialog Features**
   - Click-to-open port information from network icon
   - Displays port numbers, protocols, and access URLs
   - Clickable URLs that open web applications in new tabs
   - Clean close button and overlay functionality

### 🔧 Technical Implementation Details

- **Port Detection**: Uses `tunnelManagementClient.listTunnelPorts()` for comprehensive port enumeration
- **Categorization**: Filters ports by labels (`UserForwardedPort` vs `InternalPort`)
- **URL Generation**: Leverages endpoint `portUriFormat` templates for dynamic URL construction
- **WebSocket Messages**: New message types `port_update`, `get_port_info`, `refresh_ports`
- **Backward Compatibility**: Stub implementations in legacy connector return 0 ports

### 📋 Usage

1. **Viewing Ports**: Click the radio tower icon (🗼) in the status bar
2. **Accessing Applications**: Click any URL in the port dialog to open web apps
3. **Real-time Updates**: Port count updates automatically as services start/stop
4. **Manual Refresh**: Use the refresh functionality to update port information

## Next Steps & TODO Items

### 🔧 **High Priority Technical Tasks**

1. **SSH Key Management & GitHub Permissions** 
   - Review and document the SSH key generation process for codespace tunnel authentication
   - Identify GitHub token scopes required for SSH key access (current scopes documentation is unclear)
   - Investigate GitHub API endpoints to discover which public keys are available on the server
   - Document the relationship between GitHub permissions and SSH key availability

2. **Connection Architecture Evaluation**
   - Skip filesystem-based tunnel approach and evaluate non-tunneling client architecture
   - Explore keeping all tunnel resources in-process rather than file-based SSH connections
   - Compare performance and reliability of in-memory vs filesystem tunnel approaches
   - Assess if direct WebSocket connections could replace SSH tunneling entirely

3. **Port Forwarding Validation**
   - Test complete Node.js development setup with port forwarding (e.g., `npm run dev` on port 3000)
   - Verify that forwarded development server ports appear correctly in the UI
   - Test clickable URLs in port dialog with real web applications
   - Validate real-time port detection when services start/stop during development

### 📱 **Progressive Web App Enhancement**

4. **PWA Implementation**
   - Add Progressive Web App components (service worker, manifest.json)
   - Enable "Add to Home Screen" / "Download as App" functionality
   - Test offline capabilities and caching strategies
   - Evaluate PWA experience on mobile devices and desktop

### 🏗️ **Architecture Simplification**

5. **Single-App Architecture with Direct GitHub Integration**
   - Evaluate using GitHub token for all operations, eliminating OAuth flow complexity
   - Investigate moving terminal streaming directly into the browser (WebRTC/WebSocket)
   - Assess feasibility of fully "offline" mode (challenges: port forwarding still requires server-side tunnel)
   - Determine if thin server-side components can be eliminated entirely or reduced to minimal port-forwarding proxy

### 🔄 **Future Integration Tasks**

6. **Integration with Other Consoles (MCP):** Explore integration with other consoles (potentially via a Multi-Console Protocol) to share and monitor debug and log messaging with a coding agent.

7. **Streamlined Startup Workflow:**
   - Login to GitHub with simplified token-based auth
   - Select a repository
   - Select an existing codespace or create a new one (with setup options)
   - Connect and automatically open Gemini/Claude

8. **GitHub PR Comments Integration:** Investigate plugging into GitHub (potentially via an existing Multi-Console Protocol) to create and monitor PR comments, enabling the agent to respond with check-ins/updates.

9. **Voice Commanding/Instructions:** Explore options for voice commanding and instructions to improve the user experience, especially on mobile, to mitigate the challenges of a text-based messaging interface.

### Alternative Connection (GitHub CLI-less)

This project includes a robust alternative connection method that does not rely on the GitHub CLI (`gh`). This approach uses the `@microsoft/dev-tunnels` libraries to establish a direct tunnel to the codespace.

#### ✅ **Completed Implementation:**
*   **✅ Dynamic Port Detection:** Fully implemented dynamic port retrieval using tunnel management API
*   **✅ Port Categorization:** Automatic detection of user vs management ports via label filtering  
*   **✅ Local Port Resolution:** Resolved hardcoded port 2222 limitation with actual forwarded port detection
*   **✅ Real-time Updates:** Live port monitoring and client UI updates
*   **✅ SSH Key Management:** Automated SSH key handling for tunnel connections

#### **Requirements:**
*   **SSH Keys:** Requires a private SSH key at `~/.ssh/id_ed25519` for tunnel authentication
*   **Microsoft Dev Tunnels:** Uses `@microsoft/dev-tunnels-connections` and `@microsoft/dev-tunnels-management` packages

## Implementation Considerations

### Security

1.  **HTTPS/WSS**: Always use secure connections in production.
2.  **Authentication**: Implement proper token validation.
3.  **Rate Limiting**: Prevent abuse of terminal sessions.
4.  **Input Sanitization**: Validate all incoming WebSocket messages.

### Performance

1.  **Connection Pooling**: Reuse connections where possible.
2.  **Buffer Management**: Handle large terminal outputs efficiently.
3.  **Compression**: Use WebSocket compression for better performance.

### Limitations & Workarounds

Based on research, VS Code Server has several limitations:

1.  **Single User**: VS Code Server instances are designed for single-user access.
2.  **No Public API**: The terminal protocol is not officially documented.
3.  **Authentication**: Requires GitHub OAuth for Codespaces.

## Monitoring & Logging

TBD

## Testing Strategy

TBD

## Production Deployment

TBD
