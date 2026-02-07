import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  function getLastLog(): Record<string, unknown> {
    const calls = vi.mocked(console.log).mock.calls;
    return JSON.parse(calls[calls.length - 1][0] as string);
  }

  it('should create with default empty context', () => {
    const logger = new Logger();
    logger.info('test');
    const log = getLastLog();
    expect(log.level).toBe('info');
    expect(log.message).toBe('test');
    expect(log.timestamp).toBeDefined();
  });

  it('should create with initial context', () => {
    const logger = new Logger({ source: 'rpc', volunteerId: 42 });
    logger.info('test');
    const log = getLastLog();
    expect(log.source).toBe('rpc');
    expect(log.volunteerId).toBe(42);
  });

  it('should produce valid ISO 8601 timestamp', () => {
    const logger = new Logger();
    logger.info('test');
    const log = getLastLog();
    expect(() => new Date(log.timestamp as string).toISOString()).not.toThrow();
  });

  it.each([
    ['info', 'info message'],
    ['warn', 'warn message'],
    ['debug', 'debug message'],
  ] as const)('should log %s with correct level', (level, message) => {
    const logger = new Logger();
    logger[level](message);
    const log = getLastLog();
    expect(log.level).toBe(level);
    expect(log.message).toBe(message);
  });

  it('should log error with Error instance details', () => {
    const logger = new Logger();
    logger.error('operation failed', new Error('something broke'));
    const log = getLastLog();
    expect(log.level).toBe('error');
    expect(log.error).toEqual(
      expect.objectContaining({ message: 'something broke', name: 'Error' }),
    );
    expect((log.error as any).stack).toBeDefined();
  });

  it('should log error with non-Error value', () => {
    const logger = new Logger();
    logger.error('operation failed', 'string error');
    expect(getLastLog().error).toBe('string error');
  });

  it('should log error without error parameter', () => {
    const logger = new Logger();
    logger.error('operation failed');
    const log = getLastLog();
    expect(log.level).toBe('error');
    expect(log.error).toBeUndefined();
  });

  it('withContext should return new Logger with merged context', () => {
    const logger = new Logger({ source: 'rpc' });
    const child = logger.withContext({ volunteerId: 42 });
    child.info('test');
    const log = getLastLog();
    expect(log.source).toBe('rpc');
    expect(log.volunteerId).toBe(42);
  });

  it('withContext should not mutate original logger', () => {
    const logger = new Logger({ source: 'rpc' });
    logger.withContext({ volunteerId: 42 });
    logger.info('test');
    expect(getLastLog().volunteerId).toBeUndefined();
  });
});
