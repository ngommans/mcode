import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SSHKeyManager } from '../src/services/SSHKeyManager';

// Fake deterministic key pair
const fakePair = {
  publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKEPUB',
  privateKey: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
  fingerprint: 'SHA256:FAKE',
  createdAt: new Date('2020-01-01'),
  sessionId: '',
};

describe('SSHKeyManager', () => {
  let mgr: SSHKeyManager;

  beforeEach(() => {
    mgr = new SSHKeyManager();
    // Stub the private generateKeyPair method to avoid crypto heavy ops
    vi.spyOn<any, any>(mgr as any, 'generateKeyPair').mockReturnValue({ ...fakePair });
  });

  it('generates and retrieves session keys', () => {
    const pair = mgr.generateSessionKeys('sess1');
    expect(pair.sessionId).toBe('sess1');
    const fetched = mgr.getSessionKeys('sess1');
    expect(fetched?.publicKey).toBe(fakePair.publicKey);
    const status = mgr.getKeyStatus('sess1');
    expect(status.keyGenerated).toBe(true);
    expect(status.fingerprint).toBe(fakePair.fingerprint);
  });

  it('destroys keys and reports status', () => {
    mgr.generateSessionKeys('sess2');
    mgr.destroySessionKeys('sess2');
    expect(mgr.getSessionKeys('sess2')).toBeNull();
    const status = mgr.getKeyStatus('sess2');
    expect(status.keyGenerated).toBe(false);
  });
});
