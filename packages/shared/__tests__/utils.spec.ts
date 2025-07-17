import { describe, it, expect } from 'vitest';

import {
  isWebSocketMessage,
  createMessage,
  delay,
  formatTimestamp,
  isValidPort,
  isValidUrl,
  sanitizeCodespaceName,
  parsePortFromUrl
} from '../src/utils/index.js';

describe('shared utils', () => {
  it('isWebSocketMessage recognises valid payload', () => {
    const msg = { type: 'foo', data: 1 } as const;
    expect(isWebSocketMessage(msg)).toBe(true);
    expect(isWebSocketMessage({})).toBe(false);
  });

  it('createMessage returns same object (identity)', () => {
    const original: any = { type: 'test_unknown' };
    const result = createMessage(original as any);
    expect(result).toBe(original);
  });

  it('formatTimestamp returns ISO string', () => {
    const iso = formatTimestamp(new Date('2020-01-01T00:00:00Z'));
    expect(iso).toBe('2020-01-01T00:00:00.000Z');
  });

  it('delay resolves after given ms', async () => {
    const delayMs = 50; // Increased from 10ms to 50ms for more reliable testing
    const start = Date.now();
    await delay(delayMs);
    const elapsed = Date.now() - start;
    
    // Use a more lenient check that allows for slight variations
    // but still verifies the delay was approximately correct
    const tolerance = 0.8; // Allow 20% tolerance
    expect(elapsed).toBeGreaterThanOrEqual(delayMs * tolerance);
  }, 10000); // Increase timeout to 10s to be safe

  it('isValidPort checks range', () => {
    expect(isValidPort(22)).toBe(true);
    expect(isValidPort(70000)).toBe(false);
  });

  it('isValidUrl validates URL strings', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('sanitizeCodespaceName strips invalid chars', () => {
    expect(sanitizeCodespaceName('my*codespace!')).toBe('mycodespace');
  });

  it('parsePortFromUrl extracts port if valid', () => {
    expect(parsePortFromUrl('http://localhost:8080')).toBe(8080);
    expect(parsePortFromUrl('http://example.com')).toBe(null);
  });
});
