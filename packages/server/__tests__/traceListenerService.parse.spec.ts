import { describe, it, expect } from 'vitest';
import TraceListenerService from '../src/tunnel/TraceListenerService';

// Use numeric trace level constant to avoid dev-tunnels dependency
const INFO = 4 as unknown as number;

function callParse(listener: TraceListenerService, msg: string) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const result = (listener as any).parsePortForwardingMessage(new Date('2020-01-01'), INFO, 0, msg);
  return result as { parsedData: Record<string, unknown> };
}

describe('TraceListenerService.parsePortForwardingMessage', () => {
  const listener = new TraceListenerService({ enablePortParsing: true });

  it('parses IPv4 forwarding messages', () => {
    const r = callParse(listener, 'Forwarding from 127.0.0.1:5000 to host port 8080.');
    expect(r.parsedData.localPort).toBe(5000);
    expect(r.parsedData.remotePort).toBe(8080);
    expect(r.parsedData.direction).toBe('forward');
  });

  it('parses IPv6 forwarding messages', () => {
    const r = callParse(listener, 'Forwarding from ::1:6000 to host port 9000');
    expect(r.parsedData.localPort).toBe(6000);
    expect(r.parsedData.remotePort).toBe(9000);
    expect(r.parsedData.protocol).toBe('ipv6');
  });

  it('parses listening (reverse) messages', () => {
    const r = callParse(listener, 'Listening on port 7000');
    expect(r.parsedData.localPort).toBe(7000);
    expect(r.parsedData.direction).toBe('reverse');
  });

  it('assigns protocol based on keyword ssh/http/tcp', () => {
    const ssh = callParse(listener, 'ssh port 22 forwarding established');
    expect(ssh.parsedData.protocol).toBe('ssh');
    const http = callParse(listener, 'Port 1234 forwarding established for http');
    expect(http.parsedData.protocol).toBe('http');
    const tcp = callParse(listener, 'tcp tunnel Port 3333 forwarding established');
    expect(tcp.parsedData.protocol).toBe('tcp');
  });
});
