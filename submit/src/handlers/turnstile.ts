/**
 * Turnstile validation handler
 */

export interface TurnstileValidationResult {
  success: boolean;
  error?: string;
  challenge_ts?: string;
  hostname?: string;
}

export async function validateTurnstileToken(
  token: string,
  secretKey: string,
  remoteip?: string
): Promise<TurnstileValidationResult> {
  if (!token || !secretKey) {
    return {
      success: false,
      error: 'Missing token or secret key',
    };
  }

  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (remoteip) {
    formData.append('remoteip', remoteip);
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json<TurnstileValidationResult>();

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
