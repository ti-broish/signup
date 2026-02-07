import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendBrevoTemplateEmail } from './brevo';
import { createMockLogger } from '../test-utils';

describe('sendBrevoTemplateEmail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  const to = { email: 'test@example.com', name: 'Test User' };
  const params = { FIRSTNAME: 'Иван', REFERRAL_CODE: 'ABC123' };

  it.each([
    { desc: 'apiKey is undefined', apiKey: undefined, templateId: '1' },
    { desc: 'templateId is undefined', apiKey: 'api-key', templateId: undefined },
    { desc: 'templateId is not a number', apiKey: 'api-key', templateId: 'abc' },
  ])('should no-op when $desc', async ({ apiKey, templateId }) => {
    await sendBrevoTemplateEmail(apiKey, templateId, to, params);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should call Brevo API with correct headers and body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    await sendBrevoTemplateEmail('api-key', '42', to, params, logger);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'api-key': 'api-key',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }),
    );

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.templateId).toBe(42);
    expect(body.to).toEqual([{ email: 'test@example.com', name: 'Test User' }]);
    expect(body.params).toEqual(params);
  });

  it('should log success on 200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    await sendBrevoTemplateEmail('api-key', '42', to, params, logger);

    expect(logger.info).toHaveBeenCalledWith(
      'Brevo transactional email sent',
      expect.objectContaining({ email: 'test@example.com', templateId: 42 }),
    );
  });

  it.each([
    {
      desc: 'non-200 response',
      setupFetch: () => vi.mocked(fetch).mockResolvedValue(new Response('Bad Request', { status: 400 })),
      expectedMsg: 'Brevo API error',
    },
    {
      desc: 'network error',
      setupFetch: () => vi.mocked(fetch).mockRejectedValue(new Error('Network error')),
      expectedMsg: 'Failed to send Brevo email',
    },
  ])('should log error without throwing on $desc', async ({ setupFetch, expectedMsg }) => {
    setupFetch();
    const logger = createMockLogger();

    await expect(
      sendBrevoTemplateEmail('api-key', '42', to, params, logger),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expectedMsg,
      expect.any(Error),
      expect.objectContaining({ email: 'test@example.com' }),
    );
  });

  it('should work without logger', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(
      sendBrevoTemplateEmail('api-key', '42', to, params),
    ).resolves.toBeUndefined();
  });
});
