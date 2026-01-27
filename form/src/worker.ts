/**
 * Cloudflare Worker entry point for serving frontend static assets
 * Handles CSP headers for iframe embedding and SPA routing
 */

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  ALLOWED_IFRAME_DOMAINS?: string;
  VITE_DATA_URL?: string;
  VITE_SUBMIT_URL?: string;
  VITE_SUBMIT_ENDPOINT?: string;
  VITE_TURNSTILE_SITE_KEY?: string; // Can be from vars or secrets
  VITE_ELECTION_DATE?: string;
  VITE_PRIVACY_URL?: string;
}

/**
 * Inject environment variables into HTML as a script tag
 * Uses nodejs_compat_populate_process_env to automatically populate process.env from vars
 */
function injectEnvVars(html: string, env: Env, requestUrl: string): string {
  // Access vars from env (works for both vars and secrets)
  // process.env is automatically populated from wrangler.jsonc vars via nodejs_compat_populate_process_env
  // But secrets are only available via env, not process.env
  // Check env first (for vars and secrets), then process.env (for vars only)
  const turnstileSiteKey = env.VITE_TURNSTILE_SITE_KEY || process.env?.VITE_TURNSTILE_SITE_KEY || '';
  
  // Debug logging (remove in production)
  console.log('Worker injecting Turnstile site key:', {
    fromEnv: !!env.VITE_TURNSTILE_SITE_KEY,
    fromProcessEnv: !!process.env?.VITE_TURNSTILE_SITE_KEY,
    value: turnstileSiteKey ? `${turnstileSiteKey.substring(0, 10)}...` : 'EMPTY',
    fullValue: turnstileSiteKey
  });
  
  if (!turnstileSiteKey) {
    console.warn('Turnstile site key not found in env.VITE_TURNSTILE_SITE_KEY or process.env.VITE_TURNSTILE_SITE_KEY');
  }
  
  // Get submit URL from env, or derive from current request URL
  const submitUrl = env.VITE_SUBMIT_URL || process.env?.VITE_SUBMIT_URL;
  let finalSubmitUrl = submitUrl;
  if (!finalSubmitUrl) {
    // Derive from current request URL (same domain)
    const url = new URL(requestUrl);
    finalSubmitUrl = `${url.protocol}//${url.host}`;
  }
  
  const envScript = `
    <script>
      // Inject process.env for client-side code
      // This script MUST execute before React loads
      (function() {
        if (typeof process === 'undefined') {
          window.process = { env: {} };
        }
        window.process.env = window.process.env || {};
        window.process.env.VITE_DATA_URL = ${JSON.stringify(env.VITE_DATA_URL || process.env.VITE_DATA_URL || 'https://api.tibroish.bg')};
        window.process.env.VITE_SUBMIT_URL = ${JSON.stringify(finalSubmitUrl)};
        window.process.env.VITE_SUBMIT_ENDPOINT = ${JSON.stringify(env.VITE_SUBMIT_ENDPOINT || process.env.VITE_SUBMIT_ENDPOINT || 'submit')};
        window.process.env.VITE_TURNSTILE_SITE_KEY = ${JSON.stringify(turnstileSiteKey)};
        window.process.env.VITE_ELECTION_DATE = ${JSON.stringify(env.VITE_ELECTION_DATE || process.env.VITE_ELECTION_DATE || '2026-04-19')};
        window.process.env.VITE_PRIVACY_URL = ${JSON.stringify(env.VITE_PRIVACY_URL || process.env.VITE_PRIVACY_URL || 'https://tibroish.bg/privacy-notice')};
        console.log('Env vars injected. Turnstile site key:', window.process.env.VITE_TURNSTILE_SITE_KEY ? window.process.env.VITE_TURNSTILE_SITE_KEY.substring(0, 10) + '...' : 'EMPTY');
      })();
    </script>
  `;
  
  // Inject as the FIRST script in <head> to ensure it executes before any other scripts
  // This is critical for React to have access to window.process.env
  if (html.includes('<head>')) {
    // Inject right after <head> tag
    return html.replace('<head>', `<head>${envScript}`);
  }
  // If no head tag, inject at the very beginning
  return `${envScript}${html}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Skip API routes - these should be handled by the submit worker
    // Return 404 immediately so submit worker can handle them
    if (url.pathname.startsWith('/submit') || url.pathname.startsWith('/health')) {
      return new Response(JSON.stringify({ error: 'Not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle CSP headers for iframe embedding
    const allowedDomains = env.ALLOWED_IFRAME_DOMAINS?.split(',').map(d => d.trim()).filter(Boolean) || [];
    const cspFrameAncestors = `frame-ancestors 'self' ${allowedDomains.map(d => `https://${d}`).join(' ')}`;
    
    // CSP directives for Turnstile and general content
    const cspDirectives = [
      cspFrameAncestors,
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://esm.sh",
      "connect-src 'self' https://challenges.cloudflare.com https://api.tibroish.bg https://*.cloudflare.com",
      "frame-src 'self' https://challenges.cloudflare.com https://*.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "font-src 'self' https://cdnjs.cloudflare.com data:",
      "img-src 'self' data: https:",
      "worker-src 'self' blob:"
    ].join('; ');

    // Handle root path and SPA routing - serve index.html
    if (url.pathname === '/' || (!url.pathname.includes('.') && !url.pathname.startsWith('/submit') && !url.pathname.startsWith('/health'))) {
      const indexRequest = new Request(new URL('/index.html', request.url), request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      
      if (indexResponse.status === 404) {
        return new Response('index.html not found', { status: 500 });
      }
      
      const indexHtml = await indexResponse.text();
      const injectedHtml = injectEnvVars(indexHtml, env, request.url);
      return new Response(injectedHtml, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': cspDirectives,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
        }
      });
    }

    // Serve static assets
    const response = await env.ASSETS.fetch(request);

    // Clone response to modify headers
    const newResponse = new Response(response.body, response);

    // Add CSP headers
    newResponse.headers.set('Content-Security-Policy', cspDirectives);
    
    // Add security headers
    newResponse.headers.set('X-Content-Type-Options', 'nosniff');
    newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN'); // CSP frame-ancestors takes precedence

    // Handle 404s for assets
    if (response.status === 404) {
      // For CSS files that don't exist, return empty with proper Content-Type
      if (url.pathname.endsWith('.css')) {
        return new Response('', {
          status: 404,
          headers: {
            'Content-Type': 'text/css',
            'Content-Security-Policy': cspDirectives,
          }
        });
      }
      // Return 404 for other missing assets
      return new Response('Not found', { status: 404 });
    }

    // Inject env vars into HTML files
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const injectedHtml = injectEnvVars(html, env, request.url);
      return new Response(injectedHtml, {
        ...response,
        headers: newResponse.headers,
      });
    }

    return newResponse;
  },
};
