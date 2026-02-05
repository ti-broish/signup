/**
 * Main Cloudflare Worker entry point
 */

import { handleVolunteerSubmission } from './handlers/volunteers';
import { Logger } from './utils/logger';

export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET_KEY: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_REQUESTS: string;
  RATE_LIMIT_WINDOW_SECONDS: string;
  BREVO_API_KEY?: string;
  BREVO_TEMPLATE_ID?: string;
}

function getCorsHeaders(origin: string | null, allowedOrigins: string): HeadersInit {
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  const isAllowed = origin && origins.includes(origin);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (origins.length > 0) {
    headers['Access-Control-Allow-Origin'] = origins[0];
  }

  return headers;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const logger = new Logger({
      path: url.pathname,
      method: request.method,
      origin: origin || 'unknown',
    });

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin, env.ALLOWED_ORIGINS),
      });
    }

    // Route handlers
    try {
      if (url.pathname === '/submit' && request.method === 'POST') {
        const response = await handleVolunteerSubmission(request, env, logger, ctx);
        const headers = new Headers(response.headers);
        Object.entries(getCorsHeaders(origin, env.ALLOWED_ORIGINS)).forEach(
          ([key, value]) => {
            headers.set(key, value);
          }
        );
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }

      // Health check endpoint
      if (url.pathname === '/health' && request.method === 'GET') {
        return new Response(
          JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
          {
            status: 200,
            headers: getCorsHeaders(origin, env.ALLOWED_ORIGINS),
          }
        );
      }

      // 404 for unknown routes
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        {
          status: 404,
          headers: getCorsHeaders(origin, env.ALLOWED_ORIGINS),
        }
      );
    } catch (error) {
      logger.error('Unhandled error', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        {
          status: 500,
          headers: getCorsHeaders(origin, env.ALLOWED_ORIGINS),
        }
      );
    }
  },
};
