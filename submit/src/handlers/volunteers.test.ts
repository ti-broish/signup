import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleVolunteerSubmission } from './volunteers';
import {
  createMockEnv,
  createMockRequest,
  createMockExecutionContext,
  createMockLogger,
  createValidFormData,
  createMockD1,
} from '../test-utils';

// Mock dependencies
vi.mock('./turnstile', () => ({
  validateTurnstileToken: vi.fn(),
}));
vi.mock('./brevo', () => ({
  sendBrevoTemplateEmail: vi.fn().mockResolvedValue(undefined),
}));
const mockCheckLimit = vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 3600 });
vi.mock('../utils/rateLimit', () => ({
  RateLimiter: class {
    checkLimit = mockCheckLimit;
  },
}));

import { validateTurnstileToken } from './turnstile';
import { sendBrevoTemplateEmail } from './brevo';

describe('handleVolunteerSubmission', () => {
  let env: ReturnType<typeof createMockEnv>;
  let ctx: ReturnType<typeof createMockExecutionContext>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = createMockD1();
    env = createMockEnv({ DB: mockDb as unknown as D1Database });
    ctx = createMockExecutionContext();
    logger = createMockLogger();
  });

  async function submitForm(overrides: Record<string, unknown> = {}) {
    const request = createMockRequest(createValidFormData(overrides));
    return handleVolunteerSubmission(request, env, logger, ctx);
  }

  async function submitAndExpectJson(overrides: Record<string, unknown> = {}) {
    const response = await submitForm(overrides);
    const body = await response.json() as Record<string, any>;
    return { response, body };
  }

  it('should return 400 for invalid JSON body', async () => {
    const request = new Request('http://localhost:8787/submit', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await handleVolunteerSubmission(request, env, logger, ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: 'Invalid JSON in request body' }),
    );
  });

  it.each([
    'firstName', 'lastName', 'email', 'phone',
  ] as const)('should return 400 when %s is missing', async (field) => {
    const { response, body } = await submitAndExpectJson({ [field]: '' });
    expect(response.status).toBe(400);
    expect(body.error).toBe('Missing required fields');
    expect(body.details[field]).toBe(true);
  });

  it('should require EGN for poll watcher role', async () => {
    const { response, body } = await submitAndExpectJson({
      role: 'Пазител на вота в секция',
      egn: '',
    });
    expect(response.status).toBe(400);
    expect(body.details.egn).toBe(true);
  });

  it('should NOT require EGN for video surveillance role', async () => {
    const response = await submitForm({ role: 'Видеонаблюдение', egn: '' });
    expect(response.status).toBe(201);
  });

  describe('Turnstile validation', () => {
    it.each([
      { desc: 'local-dev-token', token: 'local-dev-token', secret: 'test-secret' },
      { desc: 'missing secret key', token: 'some-token', secret: '' },
    ])('should skip Turnstile for $desc', async ({ token, secret }) => {
      env.TURNSTILE_SECRET_KEY = secret;
      await submitForm({ turnstileToken: token });
      expect(validateTurnstileToken).not.toHaveBeenCalled();
    });

    it('should return 400 when Turnstile token is missing', async () => {
      env.TURNSTILE_SECRET_KEY = 'real-secret';
      const { response, body } = await submitAndExpectJson({ turnstileToken: undefined });
      expect(response.status).toBe(400);
      expect(body.error).toBe('Missing Turnstile token');
    });

    it('should return 400 when Turnstile validation fails', async () => {
      env.TURNSTILE_SECRET_KEY = 'real-secret';
      vi.mocked(validateTurnstileToken).mockResolvedValue({ success: false, error: 'invalid token' });

      const { response, body } = await submitAndExpectJson({ turnstileToken: 'bad-token' });
      expect(response.status).toBe(400);
      expect(body.error).toBe('Turnstile validation failed');
    });
  });

  it('should return 429 when rate limit is exceeded', async () => {
    mockCheckLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 999999 });
    env.TURNSTILE_SECRET_KEY = 'real-secret';
    vi.mocked(validateTurnstileToken).mockResolvedValue({ success: true });

    const { response, body } = await submitAndExpectJson({ turnstileToken: 'valid-token' });
    expect(response.status).toBe(429);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it.each([
    { desc: 'too short', code: 'AB' },
    { desc: 'empty', code: '' },
  ])('should return 400 for $desc referral code', async ({ code }) => {
    const { response, body } = await submitAndExpectJson({ referralCode: code });
    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid referral code');
  });

  it('should return 201 with volunteer ID on success', async () => {
    const { response, body } = await submitAndExpectJson();
    expect(response.status).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({ success: true, message: 'Registration successful', id: 1 }),
    );
  });

  it('should send Brevo email via ctx.waitUntil on success', async () => {
    env.BREVO_API_KEY = 'test-brevo-key';
    env.BREVO_TEMPLATE_ID = '42';
    await submitForm();

    expect(ctx.waitUntil).toHaveBeenCalled();
    expect(sendBrevoTemplateEmail).toHaveBeenCalledWith(
      'test-brevo-key',
      '42',
      expect.objectContaining({ email: 'ivan@example.com' }),
      expect.objectContaining({ FIRSTNAME: 'Иван' }),
      expect.anything(),
    );
  });

  it('should call EXPORT.appendRow when EXPORT binding exists', async () => {
    const mockAppendRow = vi.fn().mockResolvedValue(undefined);
    env.EXPORT = { appendRow: mockAppendRow };
    await submitForm();

    expect(ctx.waitUntil).toHaveBeenCalled();
    // Resolve the waitUntil promises to verify appendRow is called
    const waitUntilCalls = vi.mocked(ctx.waitUntil).mock.calls;
    await Promise.all(waitUntilCalls.map(([promise]) => promise));
    expect(mockAppendRow).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Иван', email: 'ivan@example.com' }),
    );
  });

  it('should handle undefined EXPORT binding gracefully', async () => {
    env.EXPORT = undefined;
    const response = await submitForm();
    expect(response.status).toBe(201);
  });

  it('should return 500 on database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockDb = createMockD1();
    mockDb._mocks.run.mockRejectedValue(new Error('DB connection failed'));
    env.DB = mockDb as unknown as D1Database;

    const response = await submitForm();
    expect(response.status).toBe(500);
  });
});
