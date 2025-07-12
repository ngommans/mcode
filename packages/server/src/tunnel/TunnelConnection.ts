import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { Tunnel, TunnelPort as MicrosoftTunnelPort } from '@microsoft/dev-tunnels-contracts';
import { PortInformation, TunnelPort, TunnelConnection as ITunnelConnection } from 'tcode-shared';

/**
 * Encapsulates all tunnel-related state and operations for a specific connection.
 * This eliminates the need to pass tunnel objects through method signatures
 * and provides type-safe access to tunnel functionality.
 */
export class TunnelConnection implements ITunnelConnection {
  private tunnelManagementClient: TunnelManagementHttpClient;
  private tunnelClient: TunnelRelayTunnelClient;
  private tunnel: Tunnel;

  constructor(
    tunnelManagementClient: TunnelManagementHttpClient,
    tunnelClient: TunnelRelayTunnelClient,
    tunnel: Tunnel
  ) {
    this.tunnelManagementClient = tunnelManagementClient;
    this.tunnelClient = tunnelClient;
    this.tunnel = tunnel;
  }

  /**
   * Get current port information from the connected tunnel
   */
  getPortInformation(): PortInformation {
    try {
      // Access the connected tunnel through the client
      // We need to cast to access the private connectedTunnel property
      if (!this.tunnel) {
        throw new Error('Tunnel client is not connected');
      }

      const connectedTunnel = this.tunnel;
      const ports = connectedTunnel.ports || [];

      // Convert Microsoft TunnelPort to our TunnelPort format
      const tunnelPorts = ports.map((port: MicrosoftTunnelPort): TunnelPort => ({
        portNumber: port.portNumber || 0,
        protocol: port.protocol || '',
        clusterId: connectedTunnel.clusterId || '',
        tunnelId: connectedTunnel.tunnelId || '',
        labels: port.labels,
        accessControl: port.accessControl ? {
          entries: port.accessControl.entries?.map(entry => ({
            type: entry.type || '',
            provider: entry.provider || '',
            isInherited: entry.isInherited || false,
            isDeny: entry.isDeny || false,
            subjects: entry.subjects || [],
            scopes: entry.scopes || []
          })) || []
        } : undefined,
        options: port.options ? {
          isGloballyAvailable: port.options.isGloballyAvailable || false
        } : undefined
      }));

      // Categorize ports
      const userPorts = tunnelPorts.filter(port => 
        port.labels?.includes('UserForwardedPort') ?? false
      );
      const managementPorts = tunnelPorts.filter(port => 
        port.labels?.includes('InternalPort') ?? false
      );

      return {
        userPorts,
        managementPorts,
        allPorts: tunnelPorts
      };
    } catch (error) {
      throw new Error(`Failed to get port information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Refresh port information by fetching latest tunnel state
   */
  async refreshPortInformation(): Promise<PortInformation> {
    try {
      // Get the latest tunnel state from management client
      const latestTunnel = await this.tunnelManagementClient.getTunnel(
        this.tunnel,
        {
          includePorts: true
        }
      );

      if (!latestTunnel) {
        throw new Error('Failed to fetch latest tunnel state');
      }

      // Update our tunnel reference
      this.tunnel = latestTunnel;

      const ports = latestTunnel.ports || [];
      
      // Convert Microsoft TunnelPort to our TunnelPort format
      const tunnelPorts = ports.map((port: MicrosoftTunnelPort): TunnelPort => ({
        portNumber: port.portNumber || 0,
        protocol: port.protocol || '',
        clusterId: latestTunnel.clusterId || '',
        tunnelId: latestTunnel.tunnelId || '',
        labels: port.labels,
        accessControl: port.accessControl ? {
          entries: port.accessControl.entries?.map(entry => ({
            type: entry.type || '',
            provider: entry.provider || '',
            isInherited: entry.isInherited || false,
            isDeny: entry.isDeny || false,
            subjects: entry.subjects || [],
            scopes: entry.scopes || []
          })) || []
        } : undefined,
        options: port.options ? {
          isGloballyAvailable: port.options.isGloballyAvailable || false
        } : undefined
      }));

      // Categorize ports
      const userPorts = tunnelPorts.filter(port => 
        port.labels?.includes('UserForwardedPort') ?? false
      );
      const managementPorts = tunnelPorts.filter(port => 
        port.labels?.includes('InternalPort') ?? false
      );

      return {
        userPorts,
        managementPorts,
        allPorts: tunnelPorts
      };
    } catch (error) {
      throw new Error(`Failed to refresh port information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Close the tunnel connection and cleanup resources
   */
  async close(): Promise<void> {
    try {
      await this.tunnelClient.dispose();
    } catch (error) {
      // Log but don't throw - cleanup should be best effort
      console.warn('Error closing tunnel client:', error);
    }
  }

  /**
   * Get tunnel management client for advanced operations
   */
  getManagementClient(): TunnelManagementHttpClient {
    return this.tunnelManagementClient;
  }

  /**
   * Get tunnel properties for read-only access
   */
  getTunnelProperties(): Readonly<Tunnel> {
    return Object.freeze({ ...this.tunnel });
  }

  /**
   * Check if tunnel connection is active
   */
  isConnected(): boolean {
    return !!(this.tunnel);
  }
}