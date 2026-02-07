import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from './rateLimit';
import { createMockD1 } from '../test-utils';

describe('RateLimiter', () => {
  let db: ReturnType<typeof createMockD1>;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    db = createMockD1();
    rateLimiter = new RateLimiter(db as unknown as D1Database, {
      maxRequests: 5,
      windowSeconds: 3600,
    });
  });

  function sqlContaining(fragment: string) {
    return db._mocks.prepare.mock.calls.find(
      (call: string[]) => (call[0] as string).includes(fragment),
    );
  }

  describe('IP-based rate limiting', () => {
    it.each([
      { existing: null,       expectedAllowed: true,  expectedRemaining: 4, desc: 'allows first request' },
      { existing: { count: 3 }, expectedAllowed: true,  expectedRemaining: 1, desc: 'allows below limit' },
      { existing: { count: 5 }, expectedAllowed: false, expectedRemaining: 0, desc: 'rejects at limit' },
    ])('$desc (count=$existing)', async ({ existing, expectedAllowed, expectedRemaining }) => {
      db._mocks.first.mockResolvedValue(existing);

      const result = await rateLimiter.checkLimit('1.2.3.4');

      expect(result.allowed).toBe(expectedAllowed);
      expect(result.remaining).toBe(expectedRemaining);
    });

    it('should INSERT for first request', async () => {
      db._mocks.first.mockResolvedValue(null);
      await rateLimiter.checkLimit('1.2.3.4');
      expect(sqlContaining('INSERT INTO rate_limits')).toBeDefined();
    });

    it('should UPDATE for subsequent requests', async () => {
      db._mocks.first.mockResolvedValue({ count: 2 });
      await rateLimiter.checkLimit('1.2.3.4');
      expect(sqlContaining('UPDATE rate_limits SET count')).toBeDefined();
    });

    it('should clean up entries older than 24 hours', async () => {
      db._mocks.first.mockResolvedValue(null);
      await rateLimiter.checkLimit('1.2.3.4');
      expect(sqlContaining('DELETE FROM rate_limits WHERE window_start')).toBeDefined();
    });

    it('should calculate correct resetAt', async () => {
      db._mocks.first.mockResolvedValue(null);

      const result = await rateLimiter.checkLimit('1.2.3.4');

      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - (now % 3600);
      expect(result.resetAt).toBe(windowStart + 3600);
    });
  });

  describe('token-based rate limiting', () => {
    it('should reject when token has been used', async () => {
      db._mocks.first
        .mockResolvedValueOnce({ count: 1 }) // IP check
        .mockResolvedValueOnce({ count: 1 }); // Token check — already used

      const result = await rateLimiter.checkLimit('1.2.3.4', 'used-token');
      expect(result.allowed).toBe(false);
    });

    it('should allow with new token', async () => {
      db._mocks.first
        .mockResolvedValueOnce({ count: 1 }) // IP check
        .mockResolvedValueOnce(null);         // Token check — not used

      const result = await rateLimiter.checkLimit('1.2.3.4', 'new-token');
      expect(result.allowed).toBe(true);
    });

    it('should skip token check when no token provided', async () => {
      db._mocks.first.mockResolvedValue(null);
      await rateLimiter.checkLimit('1.2.3.4');

      const tokenSelectCalls = db._mocks.prepare.mock.calls.filter(
        (call: string[]) =>
          (call[0] as string).includes('turnstile_token = ?') &&
          (call[0] as string).startsWith('SELECT'),
      );
      expect(tokenSelectCalls).toHaveLength(0);
    });
  });
});
