import { vi } from 'vitest';
import type { Env } from './index';
import type { Logger } from './utils/logger';

export function createMockD1() {
  const mockRun = vi.fn().mockResolvedValue({ meta: { last_row_id: 1 }, success: true });
  const mockFirst = vi.fn<() => Promise<unknown>>().mockResolvedValue(null);
  const mockBind = vi.fn().mockReturnValue({ first: mockFirst, run: mockRun });
  const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });

  return {
    prepare: mockPrepare,
    _mocks: { prepare: mockPrepare, bind: mockBind, first: mockFirst, run: mockRun },
  } as unknown as D1Database & { _mocks: typeof mockRun extends any ? {
    prepare: typeof mockPrepare;
    bind: typeof mockBind;
    first: typeof mockFirst;
    run: typeof mockRun;
  } : never };
}

export function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createMockD1() as unknown as D1Database,
    TURNSTILE_SECRET_KEY: 'test-secret',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_REQUESTS: '5',
    RATE_LIMIT_WINDOW_SECONDS: '3600',
    ...overrides,
  };
}

export function createMockRequest(
  body: unknown = {},
  options: { method?: string; url?: string; headers?: Record<string, string> } = {}
): Request {
  const { method = 'POST', url = 'http://localhost:8787/submit', headers = {} } = options;
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(method !== 'GET' && method !== 'HEAD' ? { body: JSON.stringify(body) } : {}),
  });
}

export function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

export function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    withContext: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

export function createValidFormData(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Иван',
    middleName: 'Петров',
    lastName: 'Георгиев',
    email: 'ivan@example.com',
    phone: '+359888123456',
    egn: '9101011234',
    country: 'България',
    region: 'София-град',
    municipality: 'Столична',
    settlement: 'гр. София',
    cityRegion: null,
    pollingStation: null,
    travelAbility: 'Не',
    distantOblasts: null,
    riskySections: false,
    gdprConsent: true,
    role: 'Пазител на вота в секция',
    turnstileToken: 'local-dev-token',
    referralCode: 'ABC123',
    referredBy: null,
    ...overrides,
  };
}
