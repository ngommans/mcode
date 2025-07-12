import { describe, it, expect } from 'vitest';
import TraceListenerService from '../src/tunnel/TraceListenerService';

// Numeric value 4 corresponds to TraceLevel.Info in @microsoft/dev-tunnels-ssh
const INFO_LEVEL = 4 as unknown as any;

describe('TraceListenerService.extractPortMappingsFromTraces', () => {
  it('parses local->remote port forwarding messages', () => {
    const listener = new TraceListenerService({ enablePortParsing: true });

    // Use type cast to access the private method for unit-test purposes only
    const processTrace = (listener as any).processTraceMessage.bind(listener) as (lvl: any, id: number, msg: string, err?: Error) => void;

    processTrace(INFO_LEVEL, 0, 'Forwarding from 127.0.0.1:12345 to host port 16634.');
    processTrace(INFO_LEVEL, 0, 'Forwarding from ::1:54321 to host port 2222.');

    const mappings = listener.extractPortMappingsFromTraces();

    expect(mappings).toEqual([
      { localPort: 12345, remotePort: 16634, protocol: undefined },
      { localPort: 54321, remotePort: 2222, protocol: 'ipv6' },
    ]);
  });
});
