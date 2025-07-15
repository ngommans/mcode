import { describe, it, expect } from 'vitest';
import { TunnelConnection } from '../src/tunnel/TunnelConnection';

/**
 * Minimal stubs for Microsoft tunnel SDK types – we only provide the bits accessed by TunnelConnection.
 * TODO: Replace these with full @microsoft/dev-tunnels-contracts mocks once exposed utilities land.
 */
const makeStubTunnel = () => ({
  clusterId: 'cluster',
  tunnelId: 'id',
  ports: [
    { portNumber: 2222, protocol: 'ssh', labels: ['UserForwardedPort'] },
    { portNumber: 80, protocol: 'http', labels: ['InternalPort'] }
  ]
}) as any;

const stubMgmtClient = {
  // getTunnel will be wired per-test
  getTunnel: async () => makeStubTunnel()
} as any;

const stubRelayClient = {} as any;

describe('TunnelConnection.getPortInformation', () => {
  it('categorises ports into user and management sets', () => {
    const conn = new TunnelConnection(stubMgmtClient, stubRelayClient, makeStubTunnel());
    const info = conn.getPortInformation();
    expect(info.userPorts.length).toBe(1);
    expect(info.managementPorts.length).toBe(1);
    expect(info.allPorts.length).toBe(2);
  });
});

// TODO: add tests for refreshPortInformation once SDK mock helpers exist
