# Terminal Code (tcode)

> A clean and mobile friendly, lightweight terminal focused front-end connecting to GitHub Codespaces (any dev container in future) aiming for a VS Code familiar UI look and feel where possible.

[![CI](https://github.com/ngommans/tcode/actions/workflows/ci.yml/badge.svg)](https://github.com/ngommans/tcode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

![Terminal Code Screenshot](https://raw.githubusercontent.com/ngommans/tcode/main/docs/tcode-v1-running.jpeg)
![As PWA running Claude Code](https://raw.githubusercontent.com/ngommans/tcode/main/docs/PWA-Windows-min-term-client2.png)

## ✨ Features

- **Full Terminal Emulation:** Powered by xterm.js with VS Code theming.
- **Direct GitHub Codespaces Integration:** Discover and connect to your codespaces seamlessly from any device.
- **Intelligent Status Bar:** Real-time git branch, connection status, and port forwarding info from your remote development environment.
- **Port Management:** Automatically detect and access forwarded ports.
- **Responsive PWA:** Clean, mobile friendly interface built with Preact and DaisyUI.

## Install

### Option 1: NPM Package (Recommended)

```bash
# Install globally
npm install -g tcode

# Or run directly
npx tcode
```

### Option 2: From Source

Clone the repository and install the dependencies:

```bash
git clone https://github.com/ngommans/tcode.git
cd tcode
npm ci
```

## Usage

### Quick Start (NPM)

```bash
# Run directly
npx tcode

# Or if installed globally
tcode
```
### Build/Run Locally

1.  **Build the application:**
    ```bash
    npm run build
    ```
2.  **Run the standalone:**
    ```bash
    npm run start:standalone

3.  **Open the client** in your browser at `http://localhost:3000`.
4.  The connection dialog will open automatically. Enter a GitHub Token with `codespace` scope to connect.
    ```

### Local Development

1.  **Start the application:**
    ```bash
    npm run dev
    ```
2.  **Open the client** in your browser at `http://localhost:8080` - note the backend defaults to ws://localhost:3000 when running both in development mode.
3.  The connection dialog will open automatically. Enter a GitHub Token with `codespace` scope to connect.

### Docker

#### Production (Using published npm package)

```bash
# Build and run production image
docker build -t tcode .
docker run -p 3000:3000 tcode

# Or run directly from GitHub Container Registry
docker run -p 3000:3000 ghcr.io/ngommans/tcode:latest
```

#### Development (Building from source)

```bash
# Using docker-compose (recommended for development)
docker-compose up

# With custom port
PORT=8080 docker-compose up

# With GitHub token (optional - you can also enter it in the web UI)
GITHUB_TOKEN=ghp_xxx docker-compose up

# Using .env.local file
echo "GITHUB_TOKEN=ghp_xxx" > .env.local
docker-compose up

# Build development image manually
docker build -f Dockerfile.dev -t tcode-dev .
docker run -p 3000:3000 tcode-dev
```

#### Environment Variables

- `PORT` - Server port (default: 3000)
- `GITHUB_TOKEN` - GitHub personal access token with `codespace` scope (optional, can be entered via web UI)
- `NODE_ENV` - Environment mode (development/production)
- `HEADLESS` - Disable auto-opening browser (useful for Docker)

## Contributing

We welcome contributions! Please see the **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines on how to get started, run tests, and submit pull requests.

All participants are expected to adhere to our **[Code of Conduct](CODE_OF_CONDUCT.md)**.

## Architecture & Project Status

This project is a monorepo using a Preact frontend and a Node.js backend. For a detailed explanation of the technical architecture, please see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

For a detailed breakdown of project status, development priorities, and technical achievements, please see the **[Project Plan & Status](PLAN.md)** document.

## License

[MIT](LICENSE) © Nick Gommans
