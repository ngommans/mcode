import { describe, it, expect, beforeEach } from 'vitest';
import PortForwardingManager from '../src/tunnel/PortForwardingManager';

interface TestInternalClient {
  connectedTunnel?: {
    ports?: Array<{ portNumber: number; portForwardingUris: string[]; protocol?: string }>;
  };
  session?: {
    forwardedPorts?: Map<number, { remotePort: number; protocol?: string }>;
  };
  tunnelSession?: {
    getService: (name: string) => { listeners?: Record<number, { remotePort: number; protocol?: string }> };
  };
}

describe('PortForwardingManager helper queries', () => {
  let manager: PortForwardingManager;
  beforeEach(() => {
    // Reset singleton between tests
    (PortForwardingManager as unknown as { instance: null }).instance = null as never;
    manager = PortForwardingManager.getInstance();
  });

  it('queryPublicTunnelArrays extracts mappings from connectedTunnel.ports', () => {
    const client: TestInternalClient = {
      connectedTunnel: {
        ports: [
          { portNumber: 8080, portForwardingUris: ['http://localhost:3000'] },
          { portNumber: 22, portForwardingUris: ['tcp://127.0.0.1:5522'], protocol: 'ssh' },
        ],
      },
    };
    // @ts-expect-error expose private field for test
    manager.tunnelClient = client as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = (manager as any).queryPublicTunnelArrays() as Array<{ localPort: number; remotePort: number; source: string }>;
    expect(result.length).toBe(2);
    expect(result.map(r => r.remotePort)).toEqual(expect.arrayContaining([8080, 22]));
    expect(result.every(r => r.source === 'tunnelQuery')).toBe(true);
  });

  it('queryPortForwardingServiceListeners reads listeners map', () => {
    const client: TestInternalClient = {
      tunnelSession: {
        getService: () => ({ listeners: { '3000': { remotePort: 8080 }, 5522: { remotePort: 22, protocol: 'ssh' } } }),
      },
    };
    // @ts-expect-error test access
    manager.tunnelClient = client as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = (manager as any).queryPortForwardingServiceListeners() as Array<{ localPort: number; remotePort: number; source: string }>;
    expect(result.length).toBe(2);
    expect(result.map(r => r.remotePort)).toEqual(expect.arrayContaining([8080, 22]));
    expect(result.every(r => r.source === 'listeners')).toBe(true);
  });
});
