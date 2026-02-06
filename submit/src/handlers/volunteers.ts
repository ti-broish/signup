/**
 * Volunteers form submission handler
 */

import { validateTurnstileToken } from './turnstile';
import { RateLimiter } from '../utils/rateLimit';
import { Logger } from '../utils/logger';
import { sendBrevoTemplateEmail } from './brevo';
import { Env } from '../index';

export interface VolunteerFormData {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  egn: string;
  country: string; // String name, defaults to "България"
  region?: string | null; // String name
  municipality?: string | null; // String name
  settlement?: string | null; // String name
  cityRegion?: string | null; // String name
  pollingStation?: string | null; // String address
  travelAbility: string; // Bulgarian string like "Не", "В рамките на населеното място", etc.
  distantOblasts?: string | null; // Optional field for specifying which oblasts when travelAbility is "distant"
  riskySections: boolean;
  gdprConsent: boolean;
  role: string; // Bulgarian string like "Пазител на вота в секция"
  turnstileToken?: string;
  referralCode: string;
  referredBy?: string | null;
}

export async function handleVolunteerSubmission(
  request: Request,
  env: Env,
  logger: Logger,
  ctx: ExecutionContext
): Promise<Response> {
  const ipAddress = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = request.headers.get('User-Agent') || 'unknown';

  try {
    // Parse request body
    let formData: VolunteerFormData;
    try {
      formData = await request.json();
    } catch (parseError) {
      logger.error('Failed to parse request body', parseError, { ipAddress });
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    logger.debug('Received submission', {
      ipAddress,
      hasFirstName: !!formData.firstName,
      hasLastName: !!formData.lastName,
      hasEmail: !!formData.email,
      hasPhone: !!formData.phone,
      hasEgn: !!formData.egn,
      hasTurnstileToken: !!formData.turnstileToken,
    });

    // Validate required fields
    // EGN is only required for poll watchers ("Пазител на вота в секция")
    const isEgnRequired = formData.role === 'Пазител на вота в секция';
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || (isEgnRequired && !formData.egn)) {
      logger.warn('Missing required fields', {
        ipAddress,
        missing: {
          firstName: !formData.firstName,
          lastName: !formData.lastName,
          email: !formData.email,
          phone: !formData.phone,
          egn: isEgnRequired && !formData.egn,
        }
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields', details: {
          firstName: !formData.firstName,
          lastName: !formData.lastName,
          email: !formData.email,
          phone: !formData.phone,
          egn: isEgnRequired && !formData.egn,
        }}),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate Turnstile token (skip if local dev token or secret key not set)
    const isLocalDev = formData.turnstileToken === 'local-dev-token' || !env.TURNSTILE_SECRET_KEY;

    if (!isLocalDev) {
      if (!formData.turnstileToken) {
        logger.warn('Missing Turnstile token', { ipAddress });
        return new Response(
          JSON.stringify({ error: 'Missing Turnstile token' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const turnstileResult = await validateTurnstileToken(
        formData.turnstileToken,
        env.TURNSTILE_SECRET_KEY,
        ipAddress
      );

      if (!turnstileResult.success) {
        logger.warn('Turnstile validation failed', { ipAddress, error: turnstileResult.error });
        return new Response(
          JSON.stringify({ error: 'Turnstile validation failed' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check rate limit
    const rateLimiter = new RateLimiter(env.DB, {
      maxRequests: parseInt(env.RATE_LIMIT_REQUESTS || '5'),
      windowSeconds: parseInt(env.RATE_LIMIT_WINDOW_SECONDS || '3600'),
    });

    // Skip rate limiting for local dev token
    const rateLimitResult = isLocalDev
      ? { allowed: true, remaining: 999, resetAt: Date.now() }
      : await rateLimiter.checkLimit(ipAddress, formData.turnstileToken);

    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { ipAddress, remaining: rateLimitResult.remaining });
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          resetAt: rateLimitResult.resetAt,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': rateLimitResult.resetAt.toString(),
          },
        }
      );
    }

    // Validate referral code
    if (!formData.referralCode || formData.referralCode.length < 4) {
      logger.warn('Invalid referral code', { ipAddress, referralCode: formData.referralCode });
      return new Response(
        JSON.stringify({ error: 'Invalid referral code' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Insert into database
    let result;
    try {
      result = await env.DB.prepare(
        `INSERT INTO volunteers (
          firstName, middleName, lastName, email, phone, egn,
          country, region, municipality, settlement, cityRegion, pollingStation,
          travelAbility, distantOblasts, riskySections, gdprConsent, role, referralCode, referredBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          formData.firstName,
          formData.middleName || null,
          formData.lastName,
          formData.email,
          formData.phone,
          formData.egn,
          formData.country || 'България', // Default to България if not provided
          formData.region || null,
          formData.municipality || null,
          formData.settlement || null,
          formData.cityRegion || null,
          formData.pollingStation || null,
          formData.travelAbility,
          formData.distantOblasts || null,
          formData.riskySections ? 1 : 0,
          formData.gdprConsent ? 1 : 0,
          formData.role,
          formData.referralCode,
          formData.referredBy || null
        )
        .run();
    } catch (dbError) {
      const dbErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      logger.error('Database insert failed', dbError, {
        ipAddress,
        email: formData.email,
        dbError: dbErrorMessage,
      });
      console.error('Database error:', dbErrorMessage, dbError);
      throw dbError; // Re-throw to be caught by outer catch
    }

    logger.info('Volunteer submission successful', {
      ipAddress,
      email: formData.email,
      volunteerId: result.meta.last_row_id,
    });

    // Send Brevo transactional email (fire-and-forget)
    ctx.waitUntil(
      sendBrevoTemplateEmail(
        env.BREVO_API_KEY,
        env.BREVO_TEMPLATE_ID,
        { email: formData.email, name: `${formData.firstName} ${formData.lastName}` },
        { FIRSTNAME: formData.firstName, REFERRAL_CODE: formData.referralCode },
        logger
      )
    );

    // Export to Google Sheets via service binding (fire-and-forget)
    if (env.EXPORT) {
      ctx.waitUntil(
        env.EXPORT.appendRow({
          id: result.meta.last_row_id,
          firstName: formData.firstName,
          middleName: formData.middleName || null,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          egn: formData.egn,
          country: formData.country || 'България',
          region: formData.region || null,
          municipality: formData.municipality || null,
          settlement: formData.settlement || null,
          cityRegion: formData.cityRegion || null,
          pollingStation: formData.pollingStation || null,
          travelAbility: formData.travelAbility,
          distantOblasts: formData.distantOblasts || null,
          riskySections: formData.riskySections,
          gdprConsent: formData.gdprConsent,
          role: formData.role,
          referralCode: formData.referralCode,
          referredBy: formData.referredBy || null,
          createdAt: new Date().toISOString(),
        }).catch((error) => {
          logger.error('Export to Google Sheets failed', error);
        })
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Registration successful',
        id: result.meta.last_row_id,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('Error processing volunteer submission', error, {
      ipAddress,
      userAgent,
      errorMessage,
      errorStack,
    });

    // Log to console for immediate visibility (Cloudflare Workers logs)
    console.error('Volunteer submission error:', {
      message: errorMessage,
      stack: errorStack,
      ipAddress,
      userAgent,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        // Include error message in staging for debugging
        ...(env.TURNSTILE_SECRET_KEY && { details: errorMessage })
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
