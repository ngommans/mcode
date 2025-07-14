import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest';

// Hoisted mock for CodespaceTerminalServer
const mockClose = vi.fn();
vi.mock('../src/server/CodespaceTerminalServer.js', () => ({
  CodespaceTerminalServer: vi.fn().mockImplementation(() => ({
    close: mockClose
  }))
}));

// Import after mocks are set up
import { startServer } from '../src/index.js';
import { CodespaceTerminalServer } from '../src/server/CodespaceTerminalServer.js';

describe('server/src/index main export', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('provides startServer function', () => {
    expect(startServer).toBeTypeOf('function');
  });

  it('invokes CodespaceTerminalServer when executed', () => {
    startServer();
    expect(CodespaceTerminalServer).toHaveBeenCalled();
  });
});
