import { describe, it, expect } from 'vitest';
import TraceListenerService from '../src/tunnel/TraceListenerService';

// Create a very small interface to satisfy TS compiler without depending on the full package
interface MockTunnelClient {
  trace: (level: any, eventId: number, msg: string, err?: Error) => void;
}

describe('TraceListenerService attachment flow', () => {
  it('attaches to client, intercepts traces, and detaches restoring original trace', () => {
    // Arrange: build a mock tunnel client whose trace just records calls
    const originalCalls: Array<[any, number, string, Error | undefined]> = [];
    const mockClient: MockTunnelClient = {
      trace: (lvl, id, msg, err) => {
        originalCalls.push([lvl, id, msg, err]);
      },
    };

    const listener = new TraceListenerService({ enablePortParsing: false });

    // Act: attach listener (should wrap trace)
    listener.attachToClient(mockClient as any);

    // After attach the trace function should not be the same as before
    const wrappedTrace = mockClient.trace;
    expect(wrappedTrace).not.toBeUndefined();

    // Call trace -> both originalCalls and listener traces should increment
    (mockClient as any).trace(4, 0, 'Connected to tunnel 1234');

    // Original trace executed
    expect(originalCalls.length).toBe(1);

    // Listener categorized message
    const connectionTraces = listener.getTracesByCategory('connection');
    expect(connectionTraces.length).toBe(1);
    expect(connectionTraces[0].parsedData?.state).toBe('connected');

    // Detach and verify trace restored
    listener.detachFromClient(mockClient as any);
    expect(mockClient.trace).not.toBe(wrappedTrace); // restored to original

    // Further trace should not be intercepted
    (mockClient as any).trace(4, 1, 'Connecting to tunnel');
    const totalConnectionTraces = listener.getTracesByCategory('connection');
    expect(totalConnectionTraces.length).toBe(1); // unchanged
  });

  it('maintains maxTraceHistory size', () => {
    const listener = new TraceListenerService({ maxTraceHistory: 5, enablePortParsing: false });

    // Feed 10 generic messages
    for (let i = 0; i < 10; i++) {
      (listener as any).processTraceMessage(4, i, `Message #${i}`);
    }

    expect((listener as any).traces.length).toBeLessThanOrEqual(5);
  });
});
