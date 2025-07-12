/**
 * Tunnel Port Service - Clean utility interface for port detection
 * Handles error management and provides fallbacks for robust port detection
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import type { TunnelProperties } from 'tcode-shared';
import PortForwardingManager, { PortMapping, PortForwardingState } from './PortForwardingManager.js';
import TraceListenerService from './TraceListenerService.js';
import { logger } from '../utils/logger';
import net from 'net';

export interface PortDetectionResult {
  success: boolean;
  localPort?: number;
  error?: string;
  source: 'api' | 'direct' | 'fallback' | 'trace' | 'none';
  mapping?: PortMapping;
}

export interface TunnelPortServiceOptions {
  enableTraceParsingFallback?: boolean;
  portDetectionTimeoutMs?: number;
  fallbackToPortScanning?: boolean;
}

/**
 * Service class that provides clean API for port detection and management
 * Moves error handling away from main flow into utility layer
 */
export class TunnelPortService {
  private portManager: PortForwardingManager;
  private traceListener?: TraceListenerService;
  private options: Required<TunnelPortServiceOptions>;
  private isInitialized = false;
  private tunnelClient?: TunnelRelayTunnelClient;

  constructor(options: TunnelPortServiceOptions = {}) {
    this.portManager = PortForwardingManager.getInstance();
    this.options = {
      enableTraceParsingFallback: true,
      portDetectionTimeoutMs: 5000,
      fallbackToPortScanning: true,
      ...options
    };
  }

  /**
   * Initialize the service with tunnel clients
   */
  async initialize(
    tunnelClient: TunnelRelayTunnelClient,
    tunnelManager: TunnelManagementHttpClient,
    tunnelProperties: TunnelProperties
  ): Promise<void> {
    try {
      this.tunnelClient = tunnelClient;
      await this.portManager.initialize(tunnelClient, tunnelManager, tunnelProperties);
      
      // Optionally set up trace listener for debugging/fallback
      if (this.options.enableTraceParsingFallback) {
        this.enableTraceListener();
      }
      
      this.isInitialized = true;
      logger.info('✅ TunnelPortService initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to initialize TunnelPortService:', { error: errorMessage });
      throw new Error(`TunnelPortService initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Detect RPC port (16634) using multiple strategies with fallbacks
   */
  async detectRpcPort(): Promise<PortDetectionResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Service not initialized',
        source: 'none'
      };
    }

    logger.info('🔍 === RPC PORT DETECTION START ===');
    
    try {
      // Strategy 1: Check if we already have RPC port in managed state
      const existingRpcPort = this.portManager.getRpcPortMapping();
      if (existingRpcPort && existingRpcPort.isActive) {
        logger.info(`✅ Found existing RPC port mapping: ${existingRpcPort.localPort} -> ${existingRpcPort.remotePort}`);
        return {
          success: true,
          localPort: existingRpcPort.localPort,
          source: 'api',
          mapping: existingRpcPort
        };
      }

      // Strategy 2: Use enhanced waitForForwardedPort
      logger.info('🎯 Attempting enhanced waitForForwardedPort for RPC...');
      const rpcMapping = await this.portManager.waitForForwardedPortWithMapping(
        16634, 
        this.options.portDetectionTimeoutMs
      );
      
      if (rpcMapping) {
        logger.info(`✅ RPC port detected via enhanced wait: ${rpcMapping.localPort} -> ${rpcMapping.remotePort}`);
        return {
          success: true,
          localPort: rpcMapping.localPort,
          source: 'api',
          mapping: rpcMapping
        };
      }

      // Strategy 3: Fallback to port scanning
      if (this.options.fallbackToPortScanning) {
        logger.info('🔍 Falling back to port scanning for RPC...');
        const scannedPort = await this.scanForRpcPort();
        if (scannedPort) {
          logger.info(`✅ RPC port found via scanning: ${scannedPort}`);
          return {
            success: true,
            localPort: scannedPort,
            source: 'fallback'
          };
        }
      }

      // Strategy 4: Trace parsing fallback (if enabled)
      if (this.options.enableTraceParsingFallback && this.traceListener) {
        logger.warn('⚠️  Falling back to trace parsing for RPC detection...');
        const tracedPort = this.extractRpcPortFromTraces();
        if (tracedPort) {
          logger.info(`✅ RPC port found via trace parsing: ${tracedPort}`);
          return {
            success: true,
            localPort: tracedPort,
            source: 'trace'
          };
        }
      }

      return {
        success: false,
        error: 'All RPC port detection strategies failed',
        source: 'none'
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ RPC port detection failed:', { error: errorMessage });
      return {
        success: false,
        error: errorMessage,
        source: 'none'
      };
    }
  }

  /**
   * Detect SSH port (22/2222) using multiple strategies with fallbacks
   */
  async detectSshPort(): Promise<PortDetectionResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Service not initialized',
        source: 'none'
      };
    }

    logger.info('🔍 === SSH PORT DETECTION START ===');
    
    try {
      // Strategy 1: Check managed state for SSH port
      const existingSshPort = this.portManager.getSshPortMapping();
      if (existingSshPort && existingSshPort.isActive) {
        logger.info(`✅ Found existing SSH port mapping: ${existingSshPort.localPort} -> ${existingSshPort.remotePort}`);
        return {
          success: true,
          localPort: existingSshPort.localPort,
          source: 'api',
          mapping: existingSshPort
        };
      }

      // Strategy 2: Check for direct port mappings (common case where remote port = local port)
      const commonSshPorts = [2222, 22];
      for (const port of commonSshPorts) {
        const directMapping = this.getPortMapping(port);
        if (directMapping && directMapping.isActive && directMapping.localPort === directMapping.remotePort) {
          logger.info(`✅ Direct SSH mapping detected: ${directMapping.localPort} -> ${directMapping.remotePort}`);
          return {
            success: true,
            localPort: directMapping.localPort,
            source: 'direct',
            mapping: directMapping
          };
        }
      }

      // Strategy 3: Try common SSH ports with enhanced wait
      const sshPorts = [2222, 22]; // Try 2222 first as it's more common for codespaces
      
      for (const remotePort of sshPorts) {
        logger.info(`🎯 Checking SSH port ${remotePort} with enhanced wait...`);
        const sshMapping = await this.portManager.waitForForwardedPortWithMapping(
          remotePort,
          this.options.portDetectionTimeoutMs
        );
        
        if (sshMapping) {
          logger.info(`✅ SSH port detected via enhanced wait: ${sshMapping.localPort} -> ${sshMapping.remotePort}`);
          return {
            success: true,
            localPort: sshMapping.localPort,
            source: 'api',
            mapping: sshMapping
          };
        }
      }

      // Strategy 4: Fallback to port scanning
      if (this.options.fallbackToPortScanning) {
        logger.info('🔍 Falling back to port scanning for SSH...');
        const scannedPort = await this.scanForSshPort();
        if (scannedPort) {
          logger.info(`✅ SSH port found via scanning: ${scannedPort}`);
          return {
            success: true,
            localPort: scannedPort,
            source: 'fallback'
          };
        }
      }

      // Strategy 5: Trace parsing fallback (if enabled)
      if (this.options.enableTraceParsingFallback && this.traceListener) {
        logger.warn('⚠️  Falling back to trace parsing for SSH detection...');
        const tracedPort = this.extractSshPortFromTraces();
        if (tracedPort) {
          logger.info(`✅ SSH port found via trace parsing: ${tracedPort}`);
          return {
            success: true,
            localPort: tracedPort,
            source: 'trace'
          };
        }
      }

      return {
        success: false,
        error: 'All SSH port detection strategies failed',
        source: 'none'
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ SSH port detection failed:', { error: errorMessage });
      return {
        success: false,
        error: errorMessage,
        source: 'none'
      };
    }
  }

  /**
   * Get current port forwarding state
   */
  getPortForwardingState(): PortForwardingState {
    return this.portManager.getPortState();
  }

  /**
   * Subscribe to real-time port state updates
   */
  onPortStateChange(callback: (state: PortForwardingState) => void): () => void {
    return this.portManager.onStateChange(callback);
  }

  /**
   * Force refresh of port state
   */
  async refreshPortState(): Promise<void> {
    await this.portManager.refreshPortState();
  }

  /**
   * Request port forwarding with enhanced detection
   */
  async requestPortForwarding(remotePort: number): Promise<PortDetectionResult> {
    try {
      logger.info(`📡 Requesting port forwarding for remote port ${remotePort}...`);
      
      const mapping = await this.portManager.waitForForwardedPortWithMapping(
        remotePort,
        this.options.portDetectionTimeoutMs
      );
      
      if (mapping) {
        return {
          success: true,
          localPort: mapping.localPort,
          source: 'api',
          mapping
        };
      }
      
      return {
        success: false,
        error: `Failed to establish forwarding for port ${remotePort}`,
        source: 'none'
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        source: 'none'
      };
    }
  }

  /**
   * Test if a port is accepting connections
   */
  private async testPortConnection(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 2000);
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
      
      socket.connect(port, host);
    });
  }

  /**
   * Scan for RPC port by testing common forwarding ports
   */
  private async scanForRpcPort(): Promise<number | null> {
    // Test the actual RPC port first
    if (await this.testPortConnection('127.0.0.1', 16634)) {
      return 16634;
    }

    // Test common forwarding port ranges
    const commonPorts = [16635, 16636, 16637, 16638, 16639, 16640];
    
    for (const port of commonPorts) {
      logger.debug(`🔌 Testing RPC connectivity on port ${port}...`);
      if (await this.testPortConnection('127.0.0.1', port)) {
        logger.info(`✅ Found accessible RPC port: ${port}`);
        return port;
      }
    }
    
    return null;
  }

  /**
   * Scan for SSH port by testing common forwarding ports
   */
  private async scanForSshPort(): Promise<number | null> {
    // Test common SSH forwarding ports
    const sshPorts = [2222, 2223, 2224, 22];
    
    for (const port of sshPorts) {
      logger.debug(`🔌 Testing SSH connectivity on port ${port}...`);
      if (await this.testPortConnection('127.0.0.1', port)) {
        logger.info(`✅ Found accessible SSH port: ${port}`);
        return port;
      }
    }
    
    return null;
  }

  /**
   * Get all user ports (non-management)
   */
  getUserPorts(): PortMapping[] {
    return this.portManager.getPortState().userPorts;
  }

  /**
   * Get all management ports (system/internal)
   */
  getManagementPorts(): PortMapping[] {
    return this.portManager.getPortState().managementPorts;
  }

  /**
   * Check if service is ready for use
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get port mapping for specific remote port
   */
  getPortMapping(remotePort: number): PortMapping | undefined {
    const state = this.portManager.getPortState();
    return [...state.userPorts, ...state.managementPorts]
      .find(p => p.remotePort === remotePort && p.isActive);
  }

  /**
   * Get all active port mappings
   */
  getAllActivePorts(): PortMapping[] {
    const state = this.portManager.getPortState();
    return [...state.userPorts, ...state.managementPorts]
      .filter(p => p.isActive);
  }

  /**
   * Enable trace listener for debugging and fallback port detection
   */
  enableTraceListener(): void {
    if (!this.tunnelClient) {
      logger.warn('⚠️  Cannot enable trace listener - tunnel client not available');
      return;
    }

    if (this.traceListener) {
      logger.warn('⚠️  Trace listener already enabled');
      return;
    }

    logger.info('🎧 Enabling trace listener for debug and fallback detection...');
    this.traceListener = new TraceListenerService({
      enablePortParsing: true,
      enableConnectionLogging: true,
      enableAuthLogging: false, // Keep auth logging disabled for security
      logLevel: 'info',
      maxTraceHistory: 500
    });

    this.traceListener.attachToClient(this.tunnelClient);
    logger.info('✅ Trace listener enabled successfully');
  }

  /**
   * Disable trace listener
   */
  disableTraceListener(): void {
    if (!this.traceListener || !this.tunnelClient) {
      logger.warn('⚠️  Trace listener not enabled or tunnel client not available');
      return;
    }

    logger.info('🔌 Disabling trace listener...');
    this.traceListener.detachFromClient(this.tunnelClient);
    this.traceListener = undefined;
    logger.info('✅ Trace listener disabled successfully');
  }

  /**
   * Extract RPC port from trace history (fallback method)
   */
  private extractRpcPortFromTraces(): number | null {
    if (!this.traceListener) return null;

    const portMappings = this.traceListener.extractPortMappingsFromTraces();
    const rpcMapping = portMappings.find(mapping => mapping.remotePort === 16634);
    
    return rpcMapping ? rpcMapping.localPort : null;
  }

  /**
   * Extract SSH port from trace history (fallback method)
   */
  private extractSshPortFromTraces(): number | null {
    if (!this.traceListener) return null;

    const portMappings = this.traceListener.extractPortMappingsFromTraces();
    const sshMapping = portMappings.find(mapping => 
      mapping.remotePort === 22 || mapping.remotePort === 2222
    );
    
    return sshMapping ? sshMapping.localPort : null;
  }

  /**
   * Get trace listener for direct access (debugging)
   */
  getTraceListener(): TraceListenerService | undefined {
    return this.traceListener;
  }

  /**
   * Export trace data for debugging
   */
  exportTraceData(): string | null {
    return this.traceListener ? this.traceListener.exportTraces() : null;
  }

  /**
   * Get trace statistics
   */
  getTraceStats(): Record<string, number> | null {
    return this.traceListener ? this.traceListener.getTraceStats() : null;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.traceListener && this.tunnelClient) {
      this.disableTraceListener();
    }
  }
}

export default TunnelPortService;