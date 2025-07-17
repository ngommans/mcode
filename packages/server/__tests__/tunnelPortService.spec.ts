import { describe, it, expect } from 'vitest';
import TunnelPortService from '../src/tunnel/TunnelPortService';

/**
 * Unit tests for TunnelPortService focusing on early-return guard clauses.
 * These are cheap to execute yet bring many uncovered lines under test.
 */

describe('TunnelPortService.detectRpcPort', () => {
  it('returns failure when service not initialized', async () => {
    const svc = new TunnelPortService({});
    const res = await svc.detectRpcPort();
    expect(res.success).toBe(false);
    expect(res.error).toBe('Service not initialized');
    expect(res.source).toBe('none');
  });

  // TODO: Add happy-path tests with fully mocked TunnelRelayTunnelClient + port mappings
});
