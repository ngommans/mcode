import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the tunnel client modules
const mockConnect = vi.fn();
const mockGetTunnel = vi.fn();

// Mock the tunnel management API versions
vi.mock('@microsoft/dev-tunnels-management', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    ManagementApiVersions: {
      version: '2023-09-27'
    },
    TunnelManagementHttpClient: vi.fn().mockImplementation(() => ({
      getTunnel: mockGetTunnel
    }))
  };
});

vi.mock('@microsoft/dev-tunnels-connections', () => ({
  TunnelRelayTunnelClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: vi.fn()
  }))
}));

// Import after mocks are set up
import { connectToTunnel } from '../src/tunnel/TunnelModule';

// Test data
const fakeUserAgent = { name: 'test', version: '0.0.0' } as const;
const fakeTunnelProps = {
  tunnelId: 'id',
  clusterId: 'cluster',
  connectAccessToken: 'token',
  managePortsAccessToken: 'token',
  serviceUri: 'https://example.com',
  domain: 'test.example.com'
} as const;

describe('connectToTunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockConnect.mockRejectedValue(new Error('Connection failed'));
    mockGetTunnel.mockRejectedValue(new Error('Tunnel not found'));
  });

  it('returns failure result when tunnel properties are missing required fields', async () => {
    const result = await connectToTunnel(fakeUserAgent, {} as any);
    expect(result).toMatchObject({ success: false });
  });

  it('returns error result if underlying APIs fail', async () => {
    // Set up mock to throw a specific error
    const mockError = new Error('Connection failed');
    mockGetTunnel.mockRejectedValue(mockError);
    
    // The function returns a result object with success: false on error
    const result = await connectToTunnel(fakeUserAgent, fakeTunnelProps);
    
    // Verify the result indicates failure and contains the error
    expect(result).toMatchObject({
      success: false,
      error: 'Connection failed'
    });
    
    // Verify the mocks were called
    expect(mockGetTunnel).toHaveBeenCalled();
  });
});
