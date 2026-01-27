/**
 * Volunteers form submission handler
 */

import { D1Database } from '@cloudflare/workers-types';
import { validateTurnstileToken } from './turnstile';
import { RateLimiter } from '../utils/rateLimit';
import { Logger } from '../utils/logger';

export interface VolunteerFormData {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  egn: string;
  country?: { code: string; name: string } | null;
  region?: { code: string; name: string } | null;
  municipality?: { code: string; name: string } | null;
  settlement?: { id: number; name: string } | null;
  cityRegion?: { code: string; name: string } | null;
  pollingStation?: { id: string; place: string } | string | null;
  travelAbility: 'no' | 'settlement' | 'municipality' | 'region' | 'risky_distant';
  gdprConsent: boolean;
  role: 'poll_watcher' | 'video_surveillance';
  turnstileToken?: string;
  referralCode: string;
  referredBy?: string | null;
}

export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET_KEY: string;
  RATE_LIMIT_REQUESTS: string;
  RATE_LIMIT_WINDOW_SECONDS: string;
}

export async function handleVolunteerSubmission(
  request: Request,
  env: Env,
  logger: Logger
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
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || !formData.egn) {
      logger.warn('Missing required fields', { 
        ipAddress,
        missing: {
          firstName: !formData.firstName,
          lastName: !formData.lastName,
          email: !formData.email,
          phone: !formData.phone,
          egn: !formData.egn,
        }
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields', details: {
          firstName: !formData.firstName,
          lastName: !formData.lastName,
          email: !formData.email,
          phone: !formData.phone,
          egn: !formData.egn,
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
    const result = await env.DB.prepare(
      `INSERT INTO volunteers (
        firstName, middleName, lastName, email, phone, egn,
        country, region, municipality, settlement, cityRegion, pollingStation,
        travelAbility, gdprConsent, role, referralCode, referredBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        formData.firstName,
        formData.middleName || null,
        formData.lastName,
        formData.email,
        formData.phone,
        formData.egn,
        formData.country ? JSON.stringify(formData.country) : null,
        formData.region ? JSON.stringify(formData.region) : null,
        formData.municipality ? JSON.stringify(formData.municipality) : null,
        formData.settlement ? JSON.stringify(formData.settlement) : null,
        formData.cityRegion ? JSON.stringify(formData.cityRegion) : null,
        formData.pollingStation
          ? typeof formData.pollingStation === 'string'
            ? formData.pollingStation
            : JSON.stringify(formData.pollingStation)
          : null,
        formData.travelAbility,
        formData.gdprConsent ? 1 : 0,
        formData.role,
        formData.referralCode,
        formData.referredBy || null
      )
      .run();

    logger.info('Volunteer submission successful', {
      ipAddress,
      email: formData.email,
      volunteerId: result.meta.last_row_id,
    });

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
    logger.error('Error processing volunteer submission', error, {
      ipAddress,
      userAgent,
    });

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
