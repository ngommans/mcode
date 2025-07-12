import { describe, it, expect, beforeEach } from 'vitest';
import PortForwardingManager from '../src/tunnel/PortForwardingManager';

interface PortMapping {
  localPort: number;
  remotePort: number;
  protocol: string;
  isActive: boolean;
  source: string;
}

describe('PortForwardingManager.mergePortMappings', () => {
  const manager = PortForwardingManager.getInstance();

  function resetState() {
    (manager as any).state = {
      userPorts: [],
      managementPorts: [],
      lastUpdated: new Date(),
    };
  }

  beforeEach(() => {
    resetState();
  });

  it('categorizes RPC, SSH and management ports correctly', () => {
    const mappings: PortMapping[] = [
      { localPort: 3000, remotePort: 16634, protocol: 'http', isActive: true, source: 'mock' }, // RPC
      { localPort: 22, remotePort: 22, protocol: 'ssh', isActive: true, source: 'mock' }, // SSH
      { localPort: 4001, remotePort: 16635, protocol: 'http', isActive: true, source: 'mock' }, // management
      { localPort: 5000, remotePort: 8080, protocol: 'http', isActive: true, source: 'mock' }, // user
    ];

    (manager as any).mergePortMappings(mappings);

    const state = manager.getPortState();

    // RPC
    expect(state.rpcPort?.remotePort).toBe(16634);
    // SSH
    expect(state.sshPort?.remotePort).toBe(22);
    // Management ports array
    expect(state.managementPorts.length).toBe(2);
    expect(state.managementPorts.map(p=>p.remotePort)).toEqual(expect.arrayContaining([16634,16635]));
    // User ports array
    expect(state.userPorts.length).toBe(2);
    expect(state.userPorts.map(p=>p.remotePort)).toEqual(expect.arrayContaining([22,8080]));
  });

  it('deduplicates duplicate mappings', () => {
    const duplicate: PortMapping = { localPort: 3000, remotePort: 16634, protocol: 'http', isActive: true, source: 'mock' };
    (manager as any).mergePortMappings([duplicate, duplicate]);

    const state = manager.getPortState();
    expect(state.managementPorts.length).toBe(1); // duplicate deduped
    expect(state.userPorts.length).toBe(0);
    expect(state.rpcPort).toBeDefined();
  });
});
