# Minimal Terminal Client

> A modern, lightweight terminal client that connects to GitHub Codespaces with a clean, VS Code-inspired interface.

[![CI](https://github.com/ngommans/mcode/actions/workflows/ci.yml/badge.svg)](https://github.com/ngommans/mcode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/mcode.svg)](https://badge.fury.io/js/mcode)


---

![Minimal Terminal Client Screenshot](https://raw.githubusercontent.com/ngommans/mcode/main/docs/mcode-v1-running.jpeg)

## ✨ Features

- **Full Terminal Emulation:** Powered by xterm.js with VS Code theming.
- **Direct GitHub Codespaces Integration:** Discover and connect to your codespaces seamlessly.
- **Intelligent Status Bar:** Real-time git branch, connection status, and port forwarding info.
- **Port Management:** Automatically detect and access forwarded ports.
- **Responsive PWA:** Clean, modern interface built with Preact and DaisyUI.

## Install

Clone the repository and install the dependencies:

```bash
git clone https://github.com/ngommans/mcode.git
cd mcode
npm ci
```

## Usage

1.  **Start the application:**
    ```bash
    npm run dev
    ```
2.  **Open the client** in your browser at `http://localhost:8080`.
3.  The connection dialog will open automatically. Enter a GitHub Token with `codespace` scope to connect.

## Contributing

We welcome contributions! Please see the **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines on how to get started, run tests, and submit pull requests.

All participants are expected to adhere to our **[Code of Conduct](CODE_OF_CONDUCT.md)**.

## Architecture & Project Status

This project is a monorepo using a Preact frontend and a Node.js backend. For a detailed explanation of the technical architecture, please see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

For a detailed breakdown of project status, development priorities, and technical achievements, please see the **[Project Plan & Status](PLAN.md)** document.

## License

[MIT](LICENSE) © Nick Gommans
