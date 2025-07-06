# Minimal Terminal Client (mcode) for VS Code Codespaces

A modern, lightweight terminal client that connects to GitHub Codespaces with a clean, VS Code-inspired interface. Built with TypeScript, Preact, and DaisyUI for a fast, responsive experience.

## Architecture Overview

The solution consists of two main components:

1. **Web Client** (`apps/web-client`): A modern Preact PWA with xterm.js for terminal emulation and DaisyUI for styling
2. **Node.js Server** (`apps/node-server`): WebSocket server managing connections to GitHub Codespaces via Microsoft Dev Tunnels

## ✨ Features

### 🖥️ **Terminal Interface**
- **Full terminal emulation** using xterm.js with VS Code theming
- **Real-time I/O** via WebSocket communication
- **Auto-reconnection** with retry logic and status indicators
- **Responsive design** that works on desktop and mobile

### 🔗 **GitHub Codespaces Integration**
- **Direct codespace connection** using GitHub tokens
- **Automatic codespace discovery** and state management
- **Progressive connection flow** with clear status updates
- **Smart display names** using codespace display names

### 🎛️ **Intelligent Status Bar**
- **Connection status** with visual indicators and click actions
- **Git branch information** with ahead/behind commit indicators
- **Port forwarding status** showing accessible port count
- **Conditional visibility** - elements appear when relevant data is available

### 🌐 **Port Forwarding Management**
- **Real-time port detection** with automatic filtering
- **Accessible ports only** - excludes SSH and non-standard ports
- **One-click browser access** with "Open in Browser" buttons
- **Dynamic updates** as services start/stop

### 📋 **Repository Information**
- **Comprehensive branch dialog** with repository details
- **Git status display** showing commits ahead/behind with arrows
- **Repository metadata** including fork status and visibility
- **Codespace timeline** with creation and last-used timestamps

### 🎨 **User Experience**
- **Auto-opening connection dialog** when disconnected
- **Click-outside-to-close** for all dialogs
- **Consistent theming** with VS Code color scheme
- **Progressive disclosure** - UI elements appear as data becomes available

## Installation & Setup

### Prerequisites

```bash
# Install Node.js dependencies for the entire project
npm install
```

### Environment Configuration

Optionally create a `.env` file in the project root:

```bash
# Server configuration = defaults to 3000
PORT=3000

# User public key for authentication via SSH - interim solution (part of server config - you can get this by runnign gh cs ssh -c [my codespace name] --config  and then looking up the codespaces.auto.pub file)
USER_PUBLIC_KEY=your-user-public-key
```

## Running the Application

### Development Mode

```bash
# Start both client and server in development mode
npm run dev

# Or run individually:
npm run dev --workspace=apps/web-client    # Client on http://localhost:8080
npm run dev --workspace=apps/node-server   # Server on ws://localhost:3001
```

### Production Mode

```bash
npm run build     # Build all packages
npm start         # Start production server
```

## Usage

1. **Open the client** in your browser at `http://localhost:8080`
2. **Connection dialog opens automatically** when disconnected
3. **Enter your GitHub Token** and click "Connect"
4. **Authenticate** with GitHub when connected
5. **Select a codespace** from the list and click "Open"
6. **Terminal becomes active** when connected to the codespace

### Status Bar Features

- **Connection Status**: Click to open connection dialog when disconnected
- **Branch Information**: Click to view repository details and git status  
- **Port Access**: Click to see accessible forwarded ports (when available)

## Current Architecture (Phase 2 Complete)

### Modern Tech Stack
- **Frontend**: Preact + DaisyUI + Vite + TypeScript
- **Backend**: Node.js + Express + WebSocket + TypeScript
- **Terminal**: xterm.js with VS Code theming
- **Styling**: DaisyUI (Tailwind CSS framework)
- **Port Filtering**: Centralized utility functions

### Project Structure
```
minimal-terminal-client/
├── apps/
│   ├── web-client/              # Preact PWA with DaisyUI
│   └── node-server/             # Node.js WebSocket server
├── packages/
│   ├── shared/                  # Shared TypeScript types
│   └── tunnel-client/           # Microsoft Dev Tunnels integration
└── package.json                 # Root workspace configuration
```

### Key Components

#### **StatusBar** (`apps/web-client/src/components/StatusBar.tsx`)
- Connection status with visual indicators
- Git branch with ahead/behind commit counts
- Port forwarding status (when ports available)
- Conditional visibility based on connection state

#### **ConnectionModal** (`apps/web-client/src/components/ConnectionModal.tsx`)
- Auto-opens when disconnected
- Progressive connection flow with status updates
- Visual success indicators on buttons
- Codespace selection with display names

#### **PortsDialog** (`apps/web-client/src/components/PortsDialog.tsx`)
- Filtered accessible ports only
- "Open in Browser" buttons for clean UX
- Real-time port count updates
- Excludes SSH and non-standard ports

#### **BranchDialog** (`apps/web-client/src/components/BranchDialog.tsx`)
- Repository information with GitHub links
- Git status with ahead/behind indicators
- Codespace timeline and metadata
- Fork and visibility status

#### **Port Utilities** (`apps/web-client/src/utils/portUtils.ts`)
- Centralized port filtering logic
- Consistent behavior across components
- Easy maintenance and updates

## Implementation Status

### ✅ **Phase 1: Project Foundation** (COMPLETED)
- [x] Monorepo structure with TypeScript
- [x] Shared type definitions
- [x] Basic WebSocket communication
- [x] Vite-based web client setup

### ✅ **Phase 2: UI Components & User Experience** (COMPLETED)
- [x] Modern Preact component architecture
- [x] Complete terminal interface with status bar
- [x] Connection flow with progressive status updates
- [x] Port forwarding management with filtering
- [x] Repository information and git status display
- [x] Responsive design with VS Code theming
- [x] Auto-opening dialogs and click-outside-to-close
- [x] Centralized port filtering utilities

### 🔄 **Phase 3: Testing & Quality** (NEXT PRIORITY)
- [ ] Unit tests for components and utilities
- [ ] Integration tests for WebSocket communication
- [ ] E2E tests for complete user flows
- [ ] Code coverage reporting (target: 80%+)

### 🔄 **Phase 4: PWA Enhancement** (PENDING)
- [ ] Service worker implementation
- [ ] Offline capabilities
- [ ] "Add to Home Screen" functionality
- [ ] Performance optimization

### 🔄 **Phase 5: Backend Refinement** (PENDING)
- [ ] Enhanced error handling and logging
- [ ] Rate limiting and security measures
- [ ] Environment-based configuration
- [ ] RESTful configuration endpoints

### 🔄 **Phase 6: CI/CD & Publishing** (PENDING)
- [ ] GitHub Actions workflows
- [ ] Automated testing and deployment
- [ ] Security scanning
- [ ] Package publishing

## Port Information & Filtering

### Centralized Port Management

The application uses a sophisticated port filtering system to show only relevant, accessible ports:

#### **Filtering Criteria**
- **Excludes Port 22**: SSH command port not relevant for UI
- **Standard ports only**: Filters out URLs with `:port` syntax
- **Accessible URLs required**: Only shows ports with forwarding URLs
- **Real-time updates**: Port counts update as services start/stop

#### **Usage in Components**
```typescript
import { filterAccessiblePorts, getAccessiblePortCount } from './utils/portUtils';

// Get filtered ports for display
const accessiblePorts = filterAccessiblePorts(allPorts);

// Get count for status bar
const portCount = getAccessiblePortCount(allPorts);
```

### Port Categories Handled
1. **User-Initiated Ports**: Development servers (e.g., port 3000)
2. **Management Ports**: Internal codespace infrastructure (filtered out)
3. **SSH Ports**: Command access (filtered out)

## Technical Achievements

### 🎯 **Major Architecture Simplification** ✅
**Problem Solved**: Eliminated complex Shadow DOM and decorator conflicts

**Previous**: Lit web components with Shadow DOM, pre-compilation workflow, decorator syntax conflicts
**Current**: Clean Preact components with DaisyUI, standard Vite build process

**Benefits**:
- No more pre-compilation requirements
- Hot Module Replacement (HMR) works seamlessly
- Simplified build process
- Better developer experience
- Smaller bundle size

### 🎨 **Modern UI Framework Migration** ✅
**Achievement**: Complete migration from custom Lit components to DaisyUI design system

**Implementation**:
- Professional UI components with consistent theming
- VS Code-inspired design language
- Responsive layout system
- Accessible component patterns

### 🔧 **Centralized Port Management** ✅
**Achievement**: Unified port filtering logic across all components

**Benefits**:
- Single source of truth for port filtering
- Consistent behavior everywhere
- Easy maintenance and updates
- Type-safe port handling

### 🚀 **Enhanced User Experience** ✅
**Achievements**:
- Auto-opening connection dialog for seamless onboarding
- Progressive status updates during connection
- Visual success indicators on buttons
- Click-outside-to-close for intuitive interaction
- Git status indicators in status bar
- Conditional UI element visibility

## Next Development Priorities

### 🧪 **Immediate (Current Sprint)**
1. **Testing Infrastructure**: Unit, integration, and E2E test setup
2. **Code Coverage**: Target 80%+ coverage with quality gates
3. **Error Handling**: Comprehensive error boundaries and fallbacks

### 🚀 **Short Term (1-2 months)**
1. **PWA Implementation**: Service worker, offline support, installability
2. **Performance Optimization**: Bundle splitting, lazy loading, Web Vitals
3. **Security Hardening**: Rate limiting, input validation, token management

### 🏗️ **Medium Term (3-6 months)**
1. **Backend Refinement**: Enhanced logging, monitoring, configuration
2. **CI/CD Pipeline**: Automated testing, deployment, security scanning
3. **Documentation**: API docs, architecture decisions, tutorials

### 🔮 **Future Exploration**
1. **Direct GitHub Integration**: Evaluate eliminating server-side components
2. **Mobile Experience**: PWA optimization for mobile devices
3. **Voice Commands**: Voice interface for mobile accessibility
4. **Multi-Console Protocol**: Integration with coding agents and PR workflows

## Dependencies & Requirements

### Core Dependencies
- **Runtime**: Node.js 18+, npm 9+
- **Frontend**: Preact, DaisyUI, xterm.js, Vite
- **Backend**: Express, WebSocket, Microsoft Dev Tunnels
- **Development**: TypeScript, ESLint, Prettier

### Microsoft Dev Tunnels Requirements
The server requires specific peer dependencies for tunnel functionality:
```json
{
  "asynckit": "^0.4.0",
  "bcrypt-pbkdf": "^1.0.2", 
  "combined-stream": "^1.0.8",
  "typedarray-to-buffer": "^4.0.0",
  "vscode-jsonrpc": "^8.2.1",
  "websocket": "^1.0.35"
}
```

⚠️ **Important**: These are essential for tunnel operations and should not be removed by dependency cleanup tools.

## Troubleshooting

### Common Issues

1. **Connection Fails**: Check GitHub token has 'codespace' scope
2. **Codespace Starting**: Normal during initialization - retry in 30-60 seconds  
3. **No Ports Showing**: Ports appear automatically when services start
4. **Build Errors**: Run `npm install` to ensure all dependencies are installed

### Debug Mode
```bash
npm run dev -- --debug    # Enable detailed logging
```

## Contributing

1. **Development Setup**: `npm install && npm run dev`
2. **Code Style**: ESLint + Prettier (pre-commit hooks)
3. **Testing**: Run `npm test` before submitting changes
4. **TypeScript**: All new code must include proper typing

## License

MIT License - see LICENSE file for details.

---

**Status**: Phase 2 Complete - Modern UI architecture with centralized port management
**Next**: Phase 3 - Testing infrastructure and quality assurance