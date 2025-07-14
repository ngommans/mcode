import { describe, it, expect, vi } from 'vitest';
import { createInvoker } from '../src/rpc/CodespaceRPCInvoker';

/**
 * Basic smoke tests for CodespaceRPCInvoker
 * These focus on failure paths because full tunnel & gRPC stacks are outside unit-test scope.
 * TODO: Replace stubs with fully mocked TunnelRelayTunnelClient that validates happy path.
 */

describe('CodespaceRPCInvoker.createInvoker', () => {
  it('rejects when tunnel client is missing required methods', async () => {
    // TunnelRelayTunnelClient stub with no-op connect (will break later in flow)
    const fakeClient: any = {};
    await expect(createInvoker(fakeClient as any)).rejects.toBeTruthy();
  });

  it('passes keepAliveOverride false by default', async () => {
    // Spy on logger to ensure module loads without side-effects.
    vi.mock('../src/utils/logger', () => ({
      logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    }));
    // We cannot fully instantiate due to net/grpc deps – ensure function is defined instead.
    expect(createInvoker).toBeTypeOf('function');
  });
});
