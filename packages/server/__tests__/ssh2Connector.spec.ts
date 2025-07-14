import { describe, it, expect } from 'vitest';
import { Ssh2Connector } from '../src/connectors/Ssh2Connector';

/**
 * Unit tests for Ssh2Connector focusing on early validation logic.
 * No real network connection is attempted.
 */

describe('Ssh2Connector.connectViaSSH', () => {
  it('rejects if private key is missing', async () => {
    const connector = new Ssh2Connector(Buffer.alloc(0));
    const res = connector.connectViaSSH(
      () => {},
      () => {},
      2222
    );
    await expect(res).rejects.toBeTruthy();
  });

  // TODO: Add happy-path test using ssh2 mock once available
});
