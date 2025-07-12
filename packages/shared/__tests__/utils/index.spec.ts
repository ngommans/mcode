import { describe, it, expect, vi } from 'vitest';
import {
  isWebSocketMessage,
  createMessage,
  formatTimestamp,
  delay,
  isValidPort,
  isValidUrl,
  sanitizeCodespaceName,
  parsePortFromUrl
} from '../../src/utils';

import type { WebSocketMessage } from '../../../src/types/websocket';

// Minimal valid WebSocketMessage for testing
const sampleWsMsg: WebSocketMessage = { type: 'ping' } as any; // TODO: replace with concrete union variant when exported

//#region isWebSocketMessage
describe('utils/isWebSocketMessage', () => {
  it('returns true for objects with a string "type" field', () => {
    const msg = { type: 'PING' } as unknown;
    expect(isWebSocketMessage(msg)).toBe(true);
  });

  it('returns false for non-objects or missing type', () => {
    expect(isWebSocketMessage(null)).toBe(false);
    expect(isWebSocketMessage(undefined)).toBe(false);
    expect(isWebSocketMessage({})).toBe(false);
  });
});
//#endregion

//#region createMessage
describe('utils/createMessage', () => {
  it('echoes the provided message unchanged', () => {
    const original = { type: 'HELLO', payload: { foo: 'bar' } } as const;
    const result = createMessage(original);
    expect(result).toBe(original);
  });
});
//#endregion

//#region formatTimestamp
describe('utils/formatTimestamp', () => {
  it('returns ISO string for provided date', () => {
    const fixedDate = new Date('2023-01-01T00:00:00Z');
    expect(formatTimestamp(fixedDate)).toBe('2023-01-01T00:00:00.000Z');
  });
});
//#endregion

//#region delay
describe('utils/delay', () => {
  it('resolves after the specified timeout (fake timers)', async () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    
    const delayPromise = delay(100).then(spy);
    vi.advanceTimersByTime(100);
    
    // Wait for the promise to resolve
    await delayPromise;
    expect(spy).toHaveBeenCalled();
    
    vi.useRealTimers();
  });
});
//#endregion

//#region isValidPort
describe('utils/isValidPort', () => {
  it.each([1, 80, 65535])('returns true for valid port %s', (port) => {
    expect(isValidPort(port)).toBe(true);
  });

  it.each([0, -1, 65536, 3.14])('returns false for invalid port %s', (port) => {
    expect(isValidPort(port as number)).toBe(false);
  });
});
//#endregion

//#region isValidUrl
describe('utils/isValidUrl', () => {
  it('returns true for well-formed URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('returns false for malformed URLs', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });
});
//#endregion

//#region sanitizeCodespaceName
describe('utils/sanitizeCodespaceName', () => {
  it('removes invalid characters', () => {
    expect(sanitizeCodespaceName('my/codespace!')).toBe('mycodespace');
  });
});
//#endregion

//#region parsePortFromUrl
describe('utils/parsePortFromUrl', () => {
  it('extracts port number when present', () => {
    expect(parsePortFromUrl('http://localhost:3000')).toBe(3000);
  });

  it('returns null when no port present', () => {
    expect(parsePortFromUrl('http://localhost')).toBeNull();
  });
});
//#endregion
