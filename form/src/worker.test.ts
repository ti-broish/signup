// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './worker';

type Env = Parameters<typeof worker.fetch>[1];

const BASE_URL = 'https://signup.tibroish.bg';

function createMockAssets(html = '<html><head></head><body></body></html>', status = 200, contentType = 'text/html') {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response(html, { status, headers: { 'Content-Type': contentType } }),
    ),
  };
}

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: createMockAssets(),
    VITE_ALLOWED_IFRAME_DOMAINS: '',
    VITE_DATA_URL: 'https://api.tibroish.bg',
    VITE_SUBMIT_URL: BASE_URL,
    VITE_SUBMIT_ENDPOINT: 'submit',
    VITE_TURNSTILE_SITE_KEY: 'test-site-key',
    VITE_ELECTION_DATE: '2026-04-19',
    VITE_PRIVACY_URL: 'https://tibroish.bg/privacy-notice',
    ...overrides,
  };
}

async function fetchWorker(path: string, envOverrides: Partial<Env> = {}) {
  const env = createMockEnv(envOverrides);
  const request = new Request(`${BASE_URL}${path}`);
  const response = await worker.fetch(request, env);
  return { response, env };
}

async function fetchHtml(path: string, envOverrides: Partial<Env> = {}) {
  const { response, env } = await fetchWorker(path, envOverrides);
  const html = await response.text();
  return { response, html, env };
}

describe('form worker', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('routing', () => {
    it.each([
      { path: '/submit', desc: '/submit' },
      { path: '/health', desc: '/health' },
    ])('should return 404 JSON for $desc paths', async ({ path }) => {
      const { response } = await fetchWorker(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Not found' });
    });

    it.each([
      { path: '/', desc: 'root path /' },
      { path: '/some-page', desc: 'SPA route' },
    ])('should serve index.html for $desc', async ({ path }) => {
      const { response } = await fetchWorker(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
    });

    it('should pass through static asset requests', async () => {
      const mockAssets = createMockAssets('console.log("test")', 200, 'application/javascript');
      const { response } = await fetchWorker('/assets/main.js', { ASSETS: mockAssets });
      expect(response.status).toBe(200);
      expect(mockAssets.fetch).toHaveBeenCalled();
    });

    it.each([
      { path: '/assets/missing.css', expectedType: 'text/css', desc: 'empty CSS for missing .css' },
      { path: '/assets/missing.png', expectedType: null, desc: '404 for missing non-CSS assets' },
    ])('should return $desc', async ({ path, expectedType }) => {
      const mockAssets = createMockAssets('Not found', 404);
      const { response } = await fetchWorker(path, { ASSETS: mockAssets });
      expect(response.status).toBe(404);
      if (expectedType) {
        expect(response.headers.get('Content-Type')).toBe(expectedType);
      }
    });

    it('should return 500 when index.html is not found', async () => {
      const mockAssets = createMockAssets('Not found', 404);
      const { response } = await fetchWorker('/', { ASSETS: mockAssets });
      expect(response.status).toBe(500);
    });
  });

  describe('env var injection', () => {
    it('should inject script tag with process.env into <head>', async () => {
      const { html } = await fetchHtml('/');
      expect(html).toContain('<head>');
      expect(html).toContain('<script>');
      expect(html).toContain('window.process.env');
    });

    it.each([
      'VITE_DATA_URL', 'VITE_SUBMIT_URL', 'VITE_TURNSTILE_SITE_KEY',
      'VITE_ELECTION_DATE', 'VITE_PRIVACY_URL',
    ])('should inject %s into HTML', async (envVar) => {
      const { html } = await fetchHtml('/');
      expect(html).toContain(envVar);
    });

    it('should warn when Turnstile site key is not configured', async () => {
      const origProcessEnv = process.env.VITE_TURNSTILE_SITE_KEY;
      delete process.env.VITE_TURNSTILE_SITE_KEY;

      await fetchWorker('/', { VITE_TURNSTILE_SITE_KEY: undefined });
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Turnstile site key not found'),
      );

      process.env.VITE_TURNSTILE_SITE_KEY = origProcessEnv;
    });

    it('should inject env vars even when HTML has no <head> tag', async () => {
      const mockAssets = createMockAssets('<html><body>Hello</body></html>');
      const { html } = await fetchHtml('/', { ASSETS: mockAssets });
      expect(html).toContain('<script>');
      expect(html).toContain('window.process.env');
    });

    it('should inject env vars into non-root HTML assets', async () => {
      const mockAssets = createMockAssets('<html><head></head><body>Page</body></html>', 200, 'text/html; charset=utf-8');
      const { response, html } = await fetchHtml('/page.html', { ASSETS: mockAssets });
      expect(html).toContain('<script>');
      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should inject Turnstile site key from env', async () => {
      const { html } = await fetchHtml('/', { VITE_TURNSTILE_SITE_KEY: 'my-turnstile-key' });
      expect(html).toContain('my-turnstile-key');
    });

    it('should derive submit URL from request when not configured', async () => {
      const origProcessEnv = process.env.VITE_SUBMIT_URL;
      delete process.env.VITE_SUBMIT_URL;

      const { html } = await fetchHtml('/', { VITE_SUBMIT_URL: undefined });
      expect(html).toContain(BASE_URL);

      process.env.VITE_SUBMIT_URL = origProcessEnv;
    });
  });

  describe('CSP headers', () => {
    async function getCsp(envOverrides: Partial<Env> = {}) {
      const { response } = await fetchWorker('/', envOverrides);
      return response.headers.get('Content-Security-Policy')!;
    }

    it('should include frame-ancestors self when no domains configured', async () => {
      expect(await getCsp()).toContain("frame-ancestors 'self'");
    });

    it.each([
      { domains: 'tibroish.bg,dabulgaria.bg', expected: ['https://tibroish.bg', 'https://dabulgaria.bg'], desc: 'https:// for regular domains' },
      { domains: 'localhost:3000', expected: ['http://localhost:3000'], desc: 'http:// for localhost' },
    ])('should include $desc in frame-ancestors', async ({ domains, expected }) => {
      const csp = await getCsp({ VITE_ALLOWED_IFRAME_DOMAINS: domains });
      for (const url of expected) {
        expect(csp).toContain(url);
      }
    });

    it('should include Turnstile domains in CSP directives', async () => {
      expect(await getCsp()).toContain('https://challenges.cloudflare.com');
    });

    it('should set security headers on all responses', async () => {
      const { response } = await fetchWorker('/');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should add CSP to static asset responses', async () => {
      const mockAssets = createMockAssets('body {}', 200, 'text/css');
      const { response } = await fetchWorker('/assets/style.css', { ASSETS: mockAssets });
      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });
});
