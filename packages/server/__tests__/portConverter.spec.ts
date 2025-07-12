import { describe, it, expect } from 'vitest';
import { PortConverter, TunnelPort } from '../../shared/src/types/port';

// Helper to build a TunnelPort quickly
function makeTunnelPort(portNumber: number, protocol: 'http' | 'https' | 'ssh', isUserPort: boolean): TunnelPort {
  return {
    portNumber,
    protocol,
    portForwardingUris: [`http://localhost:${portNumber}`],
    accessControl: undefined,
    // Add special property to let tests distinguish
    tags: isUserPort ? ['user'] : ['system'],
  } as unknown as TunnelPort;
}

describe('PortConverter utility helpers', () => {
  const userPort = makeTunnelPort(8080, 'http', true);
  const sshPort = makeTunnelPort(22, 'ssh', false);
  const managementPort = makeTunnelPort(16634, 'https', false);
  const allPorts: TunnelPort[] = [userPort, sshPort, managementPort];

  it('tunnelToForwarded maps fields & preserves protocol', () => {
    const forwarded = PortConverter.tunnelToForwarded(userPort, true);
    expect(forwarded.portNumber).toBe(8080);
    expect(forwarded.protocol).toBe('http');
    expect(forwarded.urls[0]).toMatch('8080');
    expect(forwarded.isUserPort).toBe(true);
  });

  it('tunnelArrayToForwarded converts entire array with user flag', () => {
    const forwardedArr = PortConverter.tunnelArrayToForwarded(allPorts, [userPort]);
    expect(forwardedArr.length).toBe(3);
    const sshFwd = forwardedArr.find(p => p.portNumber === 22)!;
    expect(sshFwd.isUserPort).toBe(false);
  });

  it('filterUserPorts returns only user ports', () => {
    const res = PortConverter.filterUserPorts(allPorts);
    expect(res.length).toBe(2);
    expect(res.map(p=>p.portNumber)).toEqual(expect.arrayContaining([8080,16634]));
  });

  it('filterManagementPorts returns non-user management/system ports', () => {
    const res = PortConverter.filterManagementPorts(allPorts);
    expect(res.length).toBe(2);
    expect(res.map(p => p.portNumber)).toEqual(expect.arrayContaining([8080, 16634]));
  });

  it('createWebSocketPortInfo builds ws payload correctly', () => {
    const info = PortConverter.createWebSocketPortInfo({
      userPorts: [userPort],
      managementPorts: [sshPort, managementPort],
      allPorts,
    });
    expect(info.userPorts.length).toBe(1);
    expect(info.managementPorts.length).toBe(2);
    expect(info.allPorts.length).toBe(3);
  });
});
