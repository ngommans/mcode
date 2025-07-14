import { describe, it, expect, vi } from 'vitest';
import { GitHubCodespaceConnector } from '../src/connectors/GitHubCodespaceConnector';

// Create minimal mock handler that records messages
function makeMockHandler() {
  return {
    sendMessage: vi.fn(),
    sendError: vi.fn()
  } as any;
}

/**
 * These tests focus on connector helper methods that do not hit the network.
 * Network-heavy flows are mocked or skipped with TODO markers.
 */

describe('GitHubCodespaceConnector.sendCodespaceState', () => {
  it('delegates to handler.sendMessage when websocket is open', () => {
    const fakeWs: any = { readyState: 1 /* WebSocket.OPEN */ };
    const handler = makeMockHandler();
    const connector = new GitHubCodespaceConnector('token', fakeWs, handler);

    connector['sendCodespaceState'](fakeWs, 'myspace', 'Connected', 'repo/foo');

    expect(handler.sendMessage).toHaveBeenCalledWith(fakeWs, {
      type: 'codespace_state',
      codespace_name: 'myspace',
      state: 'Connected',
      repository_full_name: 'repo/foo'
    });
  });

  // TODO: Add integration tests for listCodespaces() mocking https.request
});
