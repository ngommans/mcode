# Minimal Terminal Client (mcode) for VS Code Codespaces

This project demonstrates a minimal terminal-only client that can connect to remote development environments, specifically designed to work with VS Code Codespaces and remote servers.

## Architecture Overview

The solution consists of three main components:

1.  **Frontend Client** (`client.html`): A minimal web interface using xterm.js for terminal emulation.
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
-   **Client-Side Enhancements:** Terminal height now dynamically fills the remaining browser window space using flexbox CSS and `xterm-addon-fit`. "Open Gemini" button added to the client, which writes a predefined command to the terminal. Ability to connect to a codespace by providing a GitHub repository URL.
-   **Port Configuration:** Client and server default ports adjusted to avoid conflicts (client on 8080, server on 3001).

## Installation & Setup

### Prerequisites

```bash
# Install Node.js dependencies
npm init -y
npm install ws node-pty
# Install GitHub CLI (gh) if not already installed
# Follow instructions at https://cli.github.com/
# Ensure 'ssh' client is installed and in your system's PATH
```

### Package.json Configuration

```json
{
  "name": "minimal-terminal-client",
  "version": "1.0.0",
  "description": "Minimal terminal-only client for VS Code Codespaces",
  "main": "server.js",
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
2.  Enter your GitHub Token in the input field and click "Authenticate".
3.  Select a Codespace from the dropdown or enter a GitHub Repository URL (e.g., `https://github.com/ngommans/mcode.git`) and click "Connect to Repo Codespace".
4.  Click "Connect Codespace" to establish the terminal session. The button will change to "Disconnect Codespace" when connected.

## Next Steps

1.  **Fix "Open Gemini" Button:** Ensure the command is correctly sent to the server for execution in the codespace.
2.  **Reorganize UI:** Implement a connection menu consistent with the VS Code bottom-left icon, integrating with the command box to reduce button clutter.
3.  **Port Tunneling Information:** Add support to view tunneling information on ports, allowing users to connect to running web applications (e.g., `localhost:3000` from the remote codespace).
4.  **Integration with Other Consoles (MCP):** Explore integration with other consoles (potentially via a Multi-Console Protocol) to share and monitor debug and log messaging with a coding agent.
5.  **Streamlined Startup Workflow:**
    *   Login to GitHub.
    *   Select a repository.
    *   Select an existing codespace or create a new one (with setup options).
    *   Connect and automatically open Gemini/Claude.
6.  **GitHub PR Comments Integration:** Investigate plugging into GitHub (potentially via an existing Multi-Console Protocol) to create and monitor PR comments, enabling the agent to respond with check-ins/updates. (Need to cross-check if this brings us too close to existing headless agent flows).
7.  **Voice Commanding/Instructions:** Explore options for voice commanding and instructions to improve the user experience, especially on mobile, to mitigate the challenges of a text-based messaging interface.
8. Remove need for github cli and use oauth directly to ensure user has the right scopes - keys based does not allow starting/stopping of codespaces and we need to explore how to establish the tunnel either over websockets or by establishing the tunnel via server-side code instead of the cli dependency.

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
