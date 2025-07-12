// packages/shared/__tests__/types/port.spec.ts
import { describe, it, expect } from 'vitest';
import { PortConverter, type TunnelPort, type ForwardedPort } from '../../src/types/port';

// Helper to craft a TunnelPort quickly
function makePort(overrides: Partial<TunnelPort> = {}): TunnelPort {
  return {
    portNumber: 3000,
    protocol: 'http',
    clusterId: 'c1',
    tunnelId: 't1',
    labels: [],
    ...overrides
  } as TunnelPort;
}

describe('PortConverter', () => {
  describe('tunnelToForwarded', () => {
    it('converts TunnelPort to ForwardedPort with all fields', () => {
      const port = makePort({
        portNumber: 3000,
        protocol: 'https',
        portForwardingUris: ['https://example.com'],
        accessControl: {
          entries: [{
            type: 'user',
            provider: 'github',
            isInherited: false,
            isDeny: false,
            subjects: ['user1'],
            scopes: ['read']
          }]
        }
      });

      const result = PortConverter.tunnelToForwarded(port, true);
      
      expect(result).toEqual({
        portNumber: 3000,
        protocol: 'https',
        urls: ['https://example.com'],
        isUserPort: true,
        accessControl: port.accessControl
      });
    });

    it('handles missing optional fields', () => {
      const port = makePort({
        portNumber: 3000,
        protocol: 'http'
      });

      const result = PortConverter.tunnelToForwarded(port, false);
      
      expect(result).toEqual({
        portNumber: 3000,
        protocol: 'http',
        urls: [],
        isUserPort: false,
        accessControl: undefined
      });
    });
  });

  describe('tunnelArrayToForwarded', () => {
    it('correctly maps and flags user ports', () => {
      const userPort = makePort({ portNumber: 3000, labels: ['UserForwardedPort'] });
      const internalPort = makePort({ portNumber: 22, labels: ['InternalPort'] });
      const userPorts = [userPort];

      const result = PortConverter.tunnelArrayToForwarded([userPort, internalPort], userPorts);
      
      expect(result).toHaveLength(2);
      expect(result[0].isUserPort).toBe(true);
      expect(result[1].isUserPort).toBe(false);
    });

    it('handles empty arrays', () => {
      const result = PortConverter.tunnelArrayToForwarded([], []);
      expect(result).toEqual([]);
    });
  });

  describe('createWebSocketPortInfo', () => {
    it('creates WebSocketPortInformation with all fields', () => {
      const userPort = makePort({ portNumber: 3000, labels: ['UserForwardedPort'] });
      const internalPort = makePort({ portNumber: 22, labels: ['InternalPort'] });
      const allPorts = [userPort, internalPort];
      const timestamp = new Date().toISOString();
      const error = 'test-error';

      const result = PortConverter.createWebSocketPortInfo({
        userPorts: [userPort],
        managementPorts: [internalPort],
        allPorts,
        timestamp,
        error
      });

      expect(result).toEqual({
        userPorts: [expect.objectContaining({ portNumber: 3000, isUserPort: true })],
        managementPorts: [expect.objectContaining({ portNumber: 22, isUserPort: false })],
        allPorts: expect.arrayContaining([
          expect.objectContaining({ portNumber: 3000, isUserPort: true }),
          expect.objectContaining({ portNumber: 22, isUserPort: false })
        ]),
        timestamp,
        error
      });
    });

    it('handles missing optional fields', () => {
      const result = PortConverter.createWebSocketPortInfo({
        userPorts: [],
        managementPorts: [],
        allPorts: []
      });

      expect(result).toEqual({
        userPorts: [],
        managementPorts: [],
        allPorts: [],
        timestamp: undefined,
        error: undefined
      });
    });
  });

  describe('filterUserPorts', () => {
    it('filters user ports correctly', () => {
      const userPort = makePort({ labels: ['UserForwardedPort'] });
      const internalPort = makePort({ labels: ['InternalPort'] });
      const sshPort = makePort({ portNumber: 22 });
      const customPort = makePort({ portNumber: 3000 }); // No labels but not internal
      
      const result = PortConverter.filterUserPorts([userPort, internalPort, sshPort, customPort]);
      
      expect(result).toEqual(expect.arrayContaining([userPort, customPort]));
      expect(result).not.toContain(internalPort);
      expect(result).not.toContain(sshPort);
    });

    it('returns empty array for no matches', () => {
      const internalPort = makePort({ labels: ['InternalPort'] });
      const sshPort = makePort({ portNumber: 22 });
      
      const result = PortConverter.filterUserPorts([internalPort, sshPort]);
      expect(result).toEqual([]);
    });
  });

  describe('filterManagementPorts', () => {
    it('filters management ports correctly', () => {
      const userPort = makePort({ portNumber: 3000, labels: ['UserForwardedPort'] });
      const internalPort = makePort({ portNumber: 1234, labels: ['InternalPort'] });
      const sshPort = makePort({ portNumber: 22 });
      const httpPort = makePort({ portNumber: 80 });
      const httpsPort = makePort({ portNumber: 443 });
      
      const result = PortConverter.filterManagementPorts([
        userPort, 
        internalPort, 
        sshPort, 
        httpPort, 
        httpsPort
      ]);
      
      // Should contain all ports except SSH (22) since the condition is portNumber !== 22
      // and ports with InternalPort label
      expect(result).toHaveLength(4);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ portNumber: internalPort.portNumber }), // Has InternalPort label
          expect.objectContaining({ portNumber: 80 }),  // Not 22
          expect.objectContaining({ portNumber: 443 }), // Not 22
          expect.objectContaining({ portNumber: 3000 }) // Not 22
        ])
      );
      
      // Should not contain SSH port (22) as it's explicitly excluded
      expect(result).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ portNumber: 22 })
        ])
      );
    });

    it('returns empty array for no matches', () => {
      const sshPort = makePort({ portNumber: 22 });
      const result = PortConverter.filterManagementPorts([sshPort]);
      expect(result).toEqual([]);
    });

    it('identifies management ports by port number', () => {
      const sshPort = makePort({ portNumber: 22 });
      const httpPort = makePort({ portNumber: 80 });
      const httpsPort = makePort({ portNumber: 443 });
      const customPort = makePort({ portNumber: 3000 });
      
      const result = PortConverter.filterManagementPorts([sshPort, httpPort, httpsPort, customPort]);
      
      // Should contain all ports except SSH (22)
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ portNumber: 80 }),
          expect.objectContaining({ portNumber: 443 }),
          expect.objectContaining({ portNumber: 3000 })
        ])
      );
      
      // Should not contain SSH port (22)
      expect(result).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ portNumber: 22 })
        ])
      );
    });

    it('identifies management ports by label', () => {
      const internalPort = makePort({ portNumber: 1234, labels: ['InternalPort'] });
      const result = PortConverter.filterManagementPorts([internalPort]);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ portNumber: 1234 });
    });
  });

  describe('filterUserPorts - additional tests', () => {
    it('filters out internal and SSH ports', () => {
      const userPort = makePort({ portNumber: 3000, labels: ['UserForwardedPort'] });
      const internalPort = makePort({ portNumber: 3001, labels: ['InternalPort'] });
      const sshPort = makePort({ portNumber: 22 });
      const anotherUserPort = makePort({ portNumber: 4000, labels: ['UserForwardedPort'] });
      
      const result = PortConverter.filterUserPorts([userPort, internalPort, sshPort, anotherUserPort]);
      
      expect(result).toHaveLength(2);
      expect(result).toContain(userPort);
      expect(result).toContain(anotherUserPort);
      expect(result).not.toContain(internalPort);
      expect(result).not.toContain(sshPort);
    });

    it('returns empty array when input is empty', () => {
      expect(PortConverter.filterUserPorts([])).toEqual([]);
    });

    it('handles ports with no labels', () => {
      const portWithNoLabels = makePort({ portNumber: 3000, labels: [] });
      const result = PortConverter.filterUserPorts([portWithNoLabels]);
      expect(result).toContain(portWithNoLabels);
    });
  });

  describe('filterManagementPorts - additional tests', () => {
    it('identifies management ports by port number', () => {
      const sshPort = makePort({ portNumber: 22 });
      const httpPort = makePort({ portNumber: 80 });
      const httpsPort = makePort({ portNumber: 443 });
      const customPort = makePort({ portNumber: 3000 });
      
      const result = PortConverter.filterManagementPorts([sshPort, httpPort, httpsPort, customPort]);
      
      // Should contain all ports except SSH (22)
      expect(result).toHaveLength(3);
      expect(result).toContainEqual(expect.objectContaining({ portNumber: 80 }));
      expect(result).toContainEqual(expect.objectContaining({ portNumber: 443 }));
      expect(result).toContainEqual(expect.objectContaining({ portNumber: 3000 }));
      expect(result).not.toContainEqual(expect.objectContaining({ portNumber: 22 }));
    });
  });

  describe('error cases', () => {
    it('handles undefined or null inputs', () => {
      expect(PortConverter.filterUserPorts(undefined)).toEqual([]);
      expect(PortConverter.filterUserPorts(null)).toEqual([]);
      expect(PortConverter.filterManagementPorts(undefined)).toEqual([]);
      expect(PortConverter.filterManagementPorts(null)).toEqual([]);
    });

    it('handles mixed valid and invalid inputs', () => {
      const validPort = makePort({ portNumber: 3000, labels: ['UserForwardedPort'] });
      const mixedInput = [validPort, null, undefined, 'invalid' as any];
      const result = PortConverter.filterUserPorts(mixedInput);
      expect(result).toContain(validPort);
      expect(result).toHaveLength(1);
    });
  });
});