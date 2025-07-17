import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock `ws` with a factory that creates fresh mocks for each test
const mockHandlers = {
  on: vi.fn(),
  close: vi.fn()
};

vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: mockHandlers.on,
    close: mockHandlers.close,
    // Expose mocks for assertions
    __mocks: mockHandlers
  }))
}));

// Import after mocks are set up
import { WebSocketServer } from 'ws';
import { CodespaceTerminalServer } from '../src/server/CodespaceTerminalServer.js';

describe('CodespaceTerminalServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initialises WebSocketServer and registers handlers', () => {
    const port = 12345;
    const instance = new CodespaceTerminalServer(port);
    
    // Verify WebSocketServer was created with correct port
    expect(WebSocketServer).toHaveBeenCalledWith({
      port,
      // Add any other expected options here
    });
    
    // Verify event handlers are registered
    expect(mockHandlers.on).toHaveBeenCalledWith('connection', expect.any(Function));
    
    // Test close method
    expect(typeof instance.close).toBe('function');
    instance.close();
    expect(mockHandlers.close).toHaveBeenCalled();
  });
});
