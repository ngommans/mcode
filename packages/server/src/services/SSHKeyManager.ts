import { createHash } from 'crypto';
import { createRequire } from 'module';

// Create require function for ES modules
const require = createRequire(import.meta.url);

// Type declaration for ssh2 keygen module
interface SSHKeyGenResult {
  public: string;
  private: string;
}

// Import ssh2's keygen module using require
const { generateKeyPairSync } = require('ssh2/lib/keygen.js') as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- External library type definition
  generateKeyPairSync: (keyType: string, opts?: any) => SSHKeyGenResult;
};

export interface SSHKeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  createdAt: Date;
  sessionId: string;
}

export interface SSHKeyStatus {
  mode: 'ephemeral';
  keyGenerated: boolean;
  sessionId: string;
  fingerprint?: string;
}

export class SSHKeyManager {
  private sessionKeys = new Map<string, SSHKeyPair>();
  private readonly logger = console; // Use proper logger in production

  /**
   * Generate a new SSH key pair for the given session
   * Keys are stored only in memory and scoped to the session
   */
  generateSessionKeys(sessionId: string): SSHKeyPair {
    this.logger.log(`🔑 Generating SSH key pair for session: ${sessionId}`);
    
    try {
      const keyPair = this.generateKeyPair();
      keyPair.sessionId = sessionId;
      
      // Store in memory only
      this.sessionKeys.set(sessionId, keyPair);
      
      this.logger.log(`✅ SSH key pair generated successfully for session: ${sessionId}`);
      this.logger.log(`📋 Key fingerprint: ${keyPair.fingerprint}`);
      
      return keyPair;
    } catch (error) {
      this.logger.error(`❌ Failed to generate SSH key pair for session: ${sessionId}`, error);
      throw new Error(`SSH key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get SSH key pair for a session (if exists)
   */
  getSessionKeys(sessionId: string): SSHKeyPair | null {
    return this.sessionKeys.get(sessionId) || null;
  }

  /**
   * Destroy SSH keys for a session
   * This removes all cryptographic material from memory
   */
  destroySessionKeys(sessionId: string): void {
    const keyPair = this.sessionKeys.get(sessionId);
    if (keyPair) {
      this.logger.log(`🗑️  Destroying SSH keys for session: ${sessionId}`);
      
      // Clear the key data (though GC will handle this)
      keyPair.privateKey = '';
      keyPair.publicKey = '';
      keyPair.fingerprint = '';
      
      // Remove from memory
      this.sessionKeys.delete(sessionId);
      
      this.logger.log(`✅ SSH keys destroyed for session: ${sessionId}`);
    }
  }

  /**
   * Get status of SSH keys for a session
   */
  getKeyStatus(sessionId: string): SSHKeyStatus {
    const keyPair = this.sessionKeys.get(sessionId);
    return {
      mode: 'ephemeral',
      keyGenerated: !!keyPair,
      sessionId,
      fingerprint: keyPair?.fingerprint
    };
  }

  /**
   * Clean up all sessions (useful for server shutdown)
   */
  destroyAllKeys(): void {
    this.logger.log(`🧹 Destroying all SSH keys (${this.sessionKeys.size} sessions)`);
    
    for (const sessionId of this.sessionKeys.keys()) {
      this.destroySessionKeys(sessionId);
    }
    
    this.sessionKeys.clear();
    this.logger.log('✅ All SSH keys destroyed');
  }

  /**
   * Generate an Ed25519 key pair using ssh2's native key generation
   * Returns both public and private keys in formats fully compatible with ssh2 library
   */
  private generateKeyPair(): SSHKeyPair {
    try {
      // Use ssh2's native key generation for perfect compatibility
      const keys = generateKeyPairSync('ed25519');
      
      // ssh2 returns keys in the correct format already
      const publicKey = keys.public;
      const privateKey = keys.private;
      
      // Generate fingerprint from the public key
      const fingerprint = this.generateFingerprint(publicKey);

      return {
        publicKey,
        privateKey,
        fingerprint,
        createdAt: new Date(),
        sessionId: '' // Will be set by caller
      };
    } catch (error) {
      this.logger.error('Failed to generate SSH key pair using ssh2:', error);
      throw new Error(`SSH key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Generate SSH key fingerprint (SHA256)
   */
  private generateFingerprint(publicKey: string): string {
    const keyPart = publicKey.split(' ')[1]; // Get the base64 part
    const keyData = Buffer.from(keyPart, 'base64');
    const hash = createHash('sha256').update(keyData).digest('base64');
    return `SHA256:${hash}`;
  }

}

// Export singleton instance
export const sshKeyManager = new SSHKeyManager();