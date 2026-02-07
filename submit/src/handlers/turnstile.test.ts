import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateTurnstileToken } from './turnstile';

describe('validateTurnstileToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it.each([
    { desc: 'token is empty', token: '', secretKey: 'secret' },
    { desc: 'secretKey is empty', token: 'token', secretKey: '' },
  ])('should return failure when $desc', async ({ token, secretKey }) => {
    const result = await validateTurnstileToken(token, secretKey);
    expect(result).toEqual({ success: false, error: 'Missing token or secret key' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should call Turnstile API with correct FormData', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await validateTurnstileToken('test-token', 'test-secret', '1.2.3.4');

    expect(fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );

    const body = (vi.mocked(fetch).mock.calls[0][1]!.body as FormData);
    expect(body.get('secret')).toBe('test-secret');
    expect(body.get('response')).toBe('test-token');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('should omit remoteip when not provided', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await validateTurnstileToken('test-token', 'test-secret');

    const body = (vi.mocked(fetch).mock.calls[0][1]!.body as FormData);
    expect(body.get('remoteip')).toBeNull();
  });

  it('should return API response data on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        challenge_ts: '2026-01-01T00:00:00Z',
        hostname: 'example.com',
      }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await validateTurnstileToken('test-token', 'test-secret');
    expect(result.success).toBe(true);
    expect(result.challenge_ts).toBe('2026-01-01T00:00:00Z');
    expect(result.hostname).toBe('example.com');
  });

  it('should return failure on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await validateTurnstileToken('test-token', 'test-secret');
    expect(result).toEqual({ success: false, error: 'Network error' });
  });
});
