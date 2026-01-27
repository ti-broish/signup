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
  VITE_TURNSTILE_SITE_KEY?: string;
  VITE_ELECTION_DATE?: string;
}

/**
 * Inject environment variables into HTML as a script tag
 * Uses nodejs_compat_populate_process_env to automatically populate process.env from vars
 */
function injectEnvVars(html: string): string {
  // process.env is automatically populated from wrangler.jsonc vars via nodejs_compat_populate_process_env
  const envScript = `
    <script>
      // Inject process.env for client-side code
      if (typeof process === 'undefined') {
        window.process = { env: {} };
      }
      window.process.env = window.process.env || {};
      window.process.env.VITE_DATA_URL = ${JSON.stringify(process.env.VITE_DATA_URL || 'https://api.tibroish.bg')};
      window.process.env.VITE_SUBMIT_URL = ${JSON.stringify(process.env.VITE_SUBMIT_URL || 'https://submit.signup.example.com')};
      window.process.env.VITE_SUBMIT_ENDPOINT = ${JSON.stringify(process.env.VITE_SUBMIT_ENDPOINT || 'submit')};
      window.process.env.VITE_TURNSTILE_SITE_KEY = ${JSON.stringify(process.env.VITE_TURNSTILE_SITE_KEY || '')};
      window.process.env.VITE_ELECTION_DATE = ${JSON.stringify(process.env.VITE_ELECTION_DATE || '2026-04-19')};
    </script>
  `;
  
  // Inject before closing </head> tag, or at the beginning if no head tag
  if (html.includes('</head>')) {
    return html.replace('</head>', `${envScript}</head>`);
  }
  // If no head tag, inject at the beginning
  return `${envScript}${html}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CSP headers for iframe embedding
    const allowedDomains = env.ALLOWED_IFRAME_DOMAINS?.split(',').map(d => d.trim()).filter(Boolean) || [];
    const cspFrameAncestors = `frame-ancestors 'self' ${allowedDomains.map(d => `https://${d}`).join(' ')}`;

    // Serve static assets
    const response = await env.ASSETS.fetch(request);

    // Clone response to modify headers
    const newResponse = new Response(response.body, response);

    // Add CSP headers for iframe embedding
    newResponse.headers.set('Content-Security-Policy', cspFrameAncestors);
    
    // Add security headers
    newResponse.headers.set('X-Content-Type-Options', 'nosniff');
    newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN'); // CSP frame-ancestors takes precedence

    // Handle SPA routing - if it's a 404 and not an asset, serve index.html
    if (response.status === 404 && !url.pathname.includes('.')) {
      const indexRequest = new Request(new URL('/index.html', request.url), request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      const indexHtml = await indexResponse.text();
      const injectedHtml = injectEnvVars(indexHtml);
      const newIndexResponse = new Response(injectedHtml, {
        ...indexResponse,
        headers: {
          ...indexResponse.headers,
          'Content-Security-Policy': cspFrameAncestors,
          'X-Content-Type-Options': 'nosniff',
        }
      });
      return newIndexResponse;
    }

    // Inject env vars into HTML files
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const injectedHtml = injectEnvVars(html);
      return new Response(injectedHtml, {
        ...response,
        headers: newResponse.headers,
      });
    }

    return newResponse;
  },
};
