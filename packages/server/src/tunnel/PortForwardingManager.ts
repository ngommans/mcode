/**
 * Port Forwarding Manager - Centralized port state management
 * Replaces brittle trace parsing with proper API-based detection
 */

import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { TunnelAccessScopes } from '@microsoft/dev-tunnels-contracts';
import type { TunnelProperties } from 'tcode-shared';

export interface PortMapping {
  localPort: number;
  remotePort: number;
  protocol: string;
  isActive: boolean;
  source: 'listeners' | 'waitForForwarded' | 'tunnelQuery' | 'trace_fallback';
}

export interface PortForwardingState {
  rpcPort?: PortMapping;
  sshPort?: PortMapping;
  userPorts: PortMapping[];
  managementPorts: PortMapping[];
  lastUpdated: Date;
}

/**
 * Singleton port forwarding manager that maintains real-time port state
 */
class PortForwardingManager {
  private static instance: PortForwardingManager | null = null;
  private state: PortForwardingState;
  private tunnelClient?: TunnelRelayTunnelClient;
  private tunnelManager?: TunnelManagementHttpClient;
  private tunnelProperties?: TunnelProperties;
  private updateCallbacks: Array<(state: PortForwardingState) => void> = [];
  private isInitialized = false;

  private constructor() {
    this.state = {
      userPorts: [],
      managementPorts: [],
      lastUpdated: new Date()
    };
  }

  static getInstance(): PortForwardingManager {
    if (!PortForwardingManager.instance) {
      PortForwardingManager.instance = new PortForwardingManager();
    }
    return PortForwardingManager.instance;
  }

  /**
   * Initialize the port forwarding manager with tunnel clients
   */
  async initialize(
    tunnelClient: TunnelRelayTunnelClient,
    tunnelManager: TunnelManagementHttpClient,
    tunnelProperties: TunnelProperties
  ): Promise<void> {
    console.log('🚀 === PORT FORWARDING MANAGER INITIALIZATION ===');
    
    this.tunnelClient = tunnelClient;
    this.tunnelManager = tunnelManager;
    this.tunnelProperties = tunnelProperties;

    try {
      // Step 1: Query initial port state from multiple sources
      await this.queryInitialPortState();
      
      // Step 2: Set up real-time port forwarding listeners
      await this.setupPortForwardingListeners();
      
      // Step 3: Set up tunnel change monitoring
      this.setupTunnelChangeMonitoring();
      
      this.isInitialized = true;
      console.log('✅ Port forwarding manager initialized successfully');
      
      // Notify all callbacks of initial state
      this.notifyStateChange();
      
    } catch (error: any) {
      console.error('❌ Failed to initialize port forwarding manager:', error.message);
      throw error;
    }
  }

  /**
   * Query initial port state from all available sources
   */
  private async queryInitialPortState(): Promise<void> {
    console.log('🔍 Querying initial port state from multiple sources...');
    
    const detectedPorts: PortMapping[] = [];

    try {
      // Source 1: Check tunnel public arrays first (simplest)
      const publicArrayPorts = await this.queryPublicTunnelArrays();
      if (publicArrayPorts.length > 0) {
        console.log(`✅ Found ${publicArrayPorts.length} ports from tunnel public arrays`);
        detectedPorts.push(...publicArrayPorts);
      }

      // Source 2: Query tunnel management API
      const managementPorts = await this.queryTunnelManagementPorts();
      if (managementPorts.length > 0) {
        console.log(`✅ Found ${managementPorts.length} ports from management API`);
        detectedPorts.push(...managementPorts);
      }

      // Source 3: Check PortForwardingService listeners
      const listenerPorts = await this.queryPortForwardingServiceListeners();
      if (listenerPorts.length > 0) {
        console.log(`✅ Found ${listenerPorts.length} ports from PortForwardingService listeners`);
        detectedPorts.push(...listenerPorts);
      }

      // Merge and deduplicate ports
      this.mergePortMappings(detectedPorts);
      
      console.log(`📊 Initial port state: ${this.state.userPorts.length} user ports, ${this.state.managementPorts.length} management ports`);
      
    } catch (error: any) {
      console.warn('⚠️  Some port detection methods failed during initialization:', error.message);
    }
  }

  /**
   * Check tunnel public arrays for port information (simplest approach)
   */
  private async queryPublicTunnelArrays(): Promise<PortMapping[]> {
    if (!this.tunnelClient) return [];
    
    try {
      console.log('🔍 Checking tunnel public arrays...');
      
      const detectedPorts: PortMapping[] = [];
      const client = this.tunnelClient as any;
      
      // Check connectedTunnel ports
      if (client.connectedTunnel?.ports) {
        console.log('📋 Found connectedTunnel.ports array');
        const ports = client.connectedTunnel.ports;
        for (const port of ports) {
          if (port.portNumber && port.portForwardingUris?.length) {
            const localPort = this.extractLocalPortFromUri(port.portForwardingUris[0]);
            if (localPort) {
              detectedPorts.push({
                localPort,
                remotePort: port.portNumber,
                protocol: port.protocol || 'unknown',
                isActive: true,
                source: 'tunnelQuery'
              });
            }
          }
        }
      }

      // Check session forwarded ports
      if (client.session?.forwardedPorts) {
        console.log('📋 Found session.forwardedPorts');
        // This might be a Map or array depending on implementation
        const forwardedPorts = client.session.forwardedPorts;
        if (forwardedPorts instanceof Map) {
          for (const [localPort, remoteInfo] of forwardedPorts) {
            detectedPorts.push({
              localPort: typeof localPort === 'number' ? localPort : parseInt(localPort, 10),
              remotePort: remoteInfo.remotePort || remoteInfo.port,
              protocol: remoteInfo.protocol || 'unknown',
              isActive: true,
              source: 'tunnelQuery'
            });
          }
        }
      }

      return detectedPorts;
      
    } catch (error: any) {
      console.warn('⚠️  Failed to query tunnel public arrays:', error.message);
      return [];
    }
  }

  /**
   * Query tunnel management API for port information
   */
  private async queryTunnelManagementPorts(): Promise<PortMapping[]> {
    if (!this.tunnelManager || !this.tunnelProperties) return [];
    
    try {
      console.log('🔍 Querying tunnel management API...');
      
      const tunnel = {
        tunnelId: this.tunnelProperties.tunnelId,
        clusterId: this.tunnelProperties.clusterId
      };
      
      const ports = await this.tunnelManager.listTunnelPorts(tunnel, {
        tokenScopes: [TunnelAccessScopes.Connect],
        accessToken: this.tunnelProperties.connectAccessToken
      });
      
      const detectedPorts: PortMapping[] = [];
      
      for (const port of ports) {
        if (port.portForwardingUris?.length) {
          const localPort = this.extractLocalPortFromUri(port.portForwardingUris[0]);
          if (localPort) {
            detectedPorts.push({
              localPort,
              remotePort: port.portNumber!,
              protocol: port.protocol || 'unknown',
              isActive: true,
              source: 'tunnelQuery'
            });
          }
        }
      }
      
      return detectedPorts;
      
    } catch (error: any) {
      console.warn('⚠️  Failed to query tunnel management ports:', error.message);
      return [];
    }
  }

  /**
   * Query PortForwardingService listeners (most direct approach)
   */
  private async queryPortForwardingServiceListeners(): Promise<PortMapping[]> {
    if (!this.tunnelClient) return [];
    
    try {
      console.log('🔍 Querying PortForwardingService listeners...');
      
      const client = this.tunnelClient as any;
      const tunnelSession = client.tunnelSession;
      
      if (!tunnelSession) {
        console.log('⚠️  No tunnel session available');
        return [];
      }
      
      // Try to get PortForwardingService
      let portForwardingService;
      try {
        portForwardingService = tunnelSession.getService('PortForwardingService');
      } catch (serviceError) {
        console.log('⚠️  PortForwardingService not available:', serviceError);
        return [];
      }
      
      if (!portForwardingService || !portForwardingService.listeners) {
        console.log('⚠️  No listeners available on PortForwardingService');
        return [];
      }
      
      const detectedPorts: PortMapping[] = [];
      const listeners = portForwardingService.listeners;
      
      console.log(`📋 Found ${listeners.size} active listeners`);
      
      for (const [localPort, remoteInfo] of listeners) {
        console.log(`📍 Listener: local ${localPort} -> remote ${remoteInfo.remotePort || remoteInfo.port}`);
        
        detectedPorts.push({
          localPort: typeof localPort === 'number' ? localPort : parseInt(localPort, 10),
          remotePort: remoteInfo.remotePort || remoteInfo.port,
          protocol: remoteInfo.protocol || 'unknown',
          isActive: true,
          source: 'listeners'
        });
      }
      
      return detectedPorts;
      
    } catch (error: any) {
      console.warn('⚠️  Failed to query PortForwardingService listeners:', error.message);
      return [];
    }
  }

  /**
   * Set up real-time port forwarding listeners for async updates
   */
  private async setupPortForwardingListeners(): Promise<void> {
    if (!this.tunnelClient) return;
    
    try {
      console.log('🎧 Setting up real-time port forwarding listeners...');
      
      const client = this.tunnelClient as any;
      const tunnelSession = client.tunnelSession;
      
      if (tunnelSession) {
        try {
          const portForwardingService = tunnelSession.getService('PortForwardingService');
          
          if (portForwardingService) {
            // Set up event listeners for port changes
            if (typeof portForwardingService.on === 'function') {
              portForwardingService.on('portAdded', (localPort: number, remoteInfo: any) => {
                console.log(`🎯 Port added: ${localPort} -> ${remoteInfo.remotePort || remoteInfo.port}`);
                this.handlePortAdded(localPort, remoteInfo);
              });
              
              portForwardingService.on('portRemoved', (localPort: number) => {
                console.log(`🗑️  Port removed: ${localPort}`);
                this.handlePortRemoved(localPort);
              });
              
              console.log('✅ Port forwarding event listeners set up');
            } else {
              console.log('⚠️  PortForwardingService does not support event listeners');
            }
          }
        } catch (serviceError) {
          console.log('⚠️  Could not set up PortForwardingService listeners:', serviceError);
        }
      }
      
      // Set up timeout-based polling as fallback
      this.setupPollingFallback();
      
    } catch (error: any) {
      console.warn('⚠️  Failed to set up port forwarding listeners:', error.message);
    }
  }

  /**
   * Set up polling fallback for port state updates
   */
  private setupPollingFallback(): void {
    // Poll every 30 seconds to refresh port state
    setInterval(async () => {
      try {
        await this.refreshPortState();
      } catch (error: any) {
        console.error('⚠️  Port state refresh failed:', error.message);
      }
    }, 30000);
  }

  /**
   * Set up tunnel change monitoring
   */
  private setupTunnelChangeMonitoring(): void {
    if (!this.tunnelClient) return;
    
    const client = this.tunnelClient as any;
    
    // Monitor tunnel connection changes
    if (typeof client.on === 'function') {
      client.on('tunnelChanged', async () => {
        console.log('🔄 Tunnel changed - refreshing port state');
        await this.refreshPortState();
      });
    }
  }

  /**
   * Enhanced waitForForwardedPort with port mapping return
   */
  async waitForForwardedPortWithMapping(
    remotePort: number, 
    timeoutMs: number = 5000
  ): Promise<PortMapping | null> {
    if (!this.tunnelClient) return null;
    
    try {
      console.log(`⏱️  Waiting for forwarded port ${remotePort} (timeout: ${timeoutMs}ms)...`);
      
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Port forwarding timeout')), timeoutMs);
      });
      
      // Try enhanced waitForForwardedPort that might return local port
      const result = await Promise.race([
        this.tunnelClient.waitForForwardedPort(remotePort),
        timeoutPromise
      ]);
      
      // Check if result is a number (local port) or just success boolean
      if (typeof result === 'number') {
        console.log(`✅ WaitForForwardedPort returned local port: ${result}`);
        return {
          localPort: result,
          remotePort,
          protocol: 'unknown',
          isActive: true,
          source: 'waitForForwarded'
        };
      }
      
      // Fallback: query current port state to find the mapping
      console.log('🔍 WaitForForwardedPort succeeded, querying for local port mapping...');
      await this.refreshPortState();
      
      // Find the port in our current state
      const mapping = [...this.state.userPorts, ...this.state.managementPorts]
        .find(p => p.remotePort === remotePort && p.isActive);
      
      if (mapping) {
        console.log(`✅ Found port mapping: ${mapping.localPort} -> ${remotePort}`);
        return mapping;
      }
      
      console.log(`⚠️  Port ${remotePort} forwarded but local mapping not found`);
      return null;
      
    } catch (error: any) {
      console.log(`❌ WaitForForwardedPort failed for port ${remotePort}:`, error.message);
      return null;
    }
  }

  /**
   * Get current port state
   */
  getPortState(): PortForwardingState {
    return { ...this.state };
  }

  /**
   * Get specific port mappings
   */
  getRpcPortMapping(): PortMapping | undefined {
    return this.state.rpcPort;
  }

  getSshPortMapping(): PortMapping | undefined {
    return this.state.sshPort;
  }

  /**
   * Subscribe to port state changes
   */
  onStateChange(callback: (state: PortForwardingState) => void): () => void {
    this.updateCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.updateCallbacks.indexOf(callback);
      if (index > -1) {
        this.updateCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Refresh port state from all sources
   */
  async refreshPortState(): Promise<void> {
    if (!this.isInitialized) return;
    
    try {
      await this.queryInitialPortState();
    } catch (error: any) {
      console.error('Failed to refresh port state:', error.message);
    }
  }

  /**
   * Handle port added event
   */
  private handlePortAdded(localPort: number, remoteInfo: any): void {
    const mapping: PortMapping = {
      localPort,
      remotePort: remoteInfo.remotePort || remoteInfo.port,
      protocol: remoteInfo.protocol || 'unknown',
      isActive: true,
      source: 'listeners'
    };
    
    this.mergePortMappings([mapping]);
    this.notifyStateChange();
  }

  /**
   * Handle port removed event
   */
  private handlePortRemoved(localPort: number): void {
    // Remove from user ports
    this.state.userPorts = this.state.userPorts.filter(p => p.localPort !== localPort);
    
    // Remove from management ports
    this.state.managementPorts = this.state.managementPorts.filter(p => p.localPort !== localPort);
    
    // Clear specific ports if they match
    if (this.state.rpcPort?.localPort === localPort) {
      this.state.rpcPort = undefined;
    }
    if (this.state.sshPort?.localPort === localPort) {
      this.state.sshPort = undefined;
    }
    
    this.state.lastUpdated = new Date();
    this.notifyStateChange();
  }

  /**
   * Merge port mappings into current state
   */
  private mergePortMappings(newMappings: PortMapping[]): void {
    for (const mapping of newMappings) {
      // Determine port category
      const isRpcPort = mapping.remotePort === 16634;
      const isSshPort = mapping.remotePort === 22 || mapping.remotePort === 2222;
      const isManagementPort = mapping.remotePort >= 16634 && mapping.remotePort <= 16640;
      
      // Update specific port mappings
      if (isRpcPort) {
        this.state.rpcPort = mapping;
      }
      if (isSshPort) {
        this.state.sshPort = mapping;
      }
      
      // Add to appropriate category
      if (isManagementPort) {
        // Remove existing mapping for same ports
        this.state.managementPorts = this.state.managementPorts.filter(
          p => p.localPort !== mapping.localPort && p.remotePort !== mapping.remotePort
        );
        this.state.managementPorts.push(mapping);
      } else {
        // Remove existing mapping for same ports
        this.state.userPorts = this.state.userPorts.filter(
          p => p.localPort !== mapping.localPort && p.remotePort !== mapping.remotePort
        );
        this.state.userPorts.push(mapping);
      }
    }
    
    this.state.lastUpdated = new Date();
  }

  /**
   * Notify all callbacks of state changes
   */
  private notifyStateChange(): void {
    for (const callback of this.updateCallbacks) {
      try {
        callback(this.getPortState());
      } catch (error: any) {
        console.error('Error in port state change callback:', error.message);
      }
    }
  }

  /**
   * Extract local port from forwarding URI
   */
  private extractLocalPortFromUri(uri: string): number | null {
    try {
      // URIs like "http://127.0.0.1:12345" or "https://localhost:8080"
      const match = uri.match(/:(\d+)(?:\/|$)/);
      return match ? parseInt(match[1], 10) : null;
    } catch {
      return null;
    }
  }
}

export default PortForwardingManager;