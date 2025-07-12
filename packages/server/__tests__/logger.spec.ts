import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// NOTE: The logger utility is an ESM module that re-exports a singleton instance
import { logger } from '../src/utils/logger';

// Helper to mute all console output during tests
function stubConsoleMethods() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
}

describe('utils/logger', () => {
  let spies: ReturnType<typeof stubConsoleMethods>;

  beforeEach(() => {
    spies = stubConsoleMethods();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset logger level and env for isolation
    logger.setLevel('info');
    delete process.env.NODE_ENV;
  });

  it('does not emit info when level is set to "warn"', () => {
    logger.setLevel('warn');
    logger.info('This should be suppressed');

    expect(spies.log).not.toHaveBeenCalled();
  });

  it('emits debug when level is "debug"', () => {
    logger.setLevel('debug');
    logger.debug('Debug message');

    expect(spies.log).toHaveBeenCalledOnce();
  });

  it('routes error level messages to console.error', () => {
    logger.setLevel('info');
    logger.error('Something went wrong');

    expect(spies.error).toHaveBeenCalledOnce();
  });

  it('outputs JSON string when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    logger.setLevel('info');
    logger.info('Production mode');

    const firstCallArg = spies.log.mock.calls[0]?.[0] as string;
    expect(firstCallArg.startsWith('{')).toBe(true);
    expect(() => JSON.parse(firstCallArg)).not.toThrow();
  });
});
