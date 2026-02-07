import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';
import { createMockEnv, createMockExecutionContext } from './test-utils';

vi.mock('./handlers/volunteers', () => ({
  handleVolunteerSubmission: vi.fn(),
}));

import { handleVolunteerSubmission } from './handlers/volunteers';

const BASE_URL = 'http://localhost:8787';

describe('submit worker', () => {
  let env: ReturnType<typeof createMockEnv>;
  let ctx: ReturnType<typeof createMockExecutionContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    ctx = createMockExecutionContext();
  });

  function request(path: string, options: RequestInit & { origin?: string } = {}) {
    const { origin, ...init } = options;
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (origin) headers.Origin = origin;
    return new Request(`${BASE_URL}${path}`, { ...init, headers });
  }

  async function fetchWorker(path: string, options: RequestInit & { origin?: string } = {}) {
    const response = await worker.fetch(request(path, options), env, ctx);
    return response;
  }

  describe('CORS preflight', () => {
    it('should return 204 with CORS headers for OPTIONS', async () => {
      const response = await fetchWorker('/submit', { method: 'OPTIONS', origin: 'http://localhost:3000' });
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-API-Key');
    });
  });

  describe('CORS origin validation', () => {
    it.each([
      { origin: 'http://localhost:3000', expected: 'http://localhost:3000', desc: 'reflects allowed origin' },
      { origin: 'http://evil.com', expected: 'http://localhost:3000', desc: 'falls back for disallowed origin' },
      { origin: undefined, expected: 'http://localhost:3000', desc: 'falls back when no Origin header' },
    ])('should return $desc', async ({ origin, expected }) => {
      const opts = origin ? { origin } : {};
      const response = await fetchWorker('/health', opts);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(expected);
    });
  });

  describe('POST /submit', () => {
    it('should delegate to handleVolunteerSubmission with CORS', async () => {
      vi.mocked(handleVolunteerSubmission).mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const response = await fetchWorker('/submit', {
        method: 'POST',
        origin: 'http://localhost:3000',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      expect(handleVolunteerSubmission).toHaveBeenCalledWith(
        expect.any(Request),
        env,
        expect.objectContaining({ info: expect.any(Function), error: expect.any(Function) }),
        ctx,
      );
    });
  });

  describe('GET /health', () => {
    it('should return ok status with valid timestamp', async () => {
      const response = await fetchWorker('/health');
      expect(response.status).toBe(200);
      const body = await response.json() as { status: string; timestamp: string };
      expect(body.status).toBe('ok');
      expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    });
  });

  describe('unknown routes', () => {
    it.each([
      { path: '/unknown', method: 'GET' as const },
      { path: '/submit', method: 'GET' as const },
    ])('should return 404 for $method $path', async ({ path, method }) => {
      const response = await fetchWorker(path, { method });
      expect(response.status).toBe(404);
    });
  });

  describe('error handling', () => {
    it('should return 500 on unhandled error', async () => {
      vi.mocked(handleVolunteerSubmission).mockRejectedValue(new Error('unexpected'));

      const response = await fetchWorker('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual(expect.objectContaining({ error: 'Internal server error' }));
    });
  });
});
