/**
 * Brevo (formerly Sendinblue) transactional email helper
 */

import { Logger } from '../utils/logger';

export async function sendBrevoTemplateEmail(
  apiKey: string | undefined,
  templateId: string | undefined,
  to: { email: string; name: string },
  params?: Record<string, string>,
  logger?: Logger
): Promise<void> {
  if (!apiKey || !templateId) {
    return;
  }

  const parsedTemplateId = parseInt(templateId, 10);
  if (isNaN(parsedTemplateId)) {
    return;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        templateId: parsedTemplateId,
        to: [{ email: to.email, name: to.name }],
        params,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger?.error('Brevo API error', new Error(body), {
        status: response.status,
        email: to.email,
      });
      return;
    }

    logger?.info('Brevo transactional email sent', { email: to.email, templateId: parsedTemplateId });
  } catch (error) {
    logger?.error('Failed to send Brevo email', error, { email: to.email, templateId: parsedTemplateId });
  }
}
