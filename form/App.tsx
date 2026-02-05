import React, { useEffect, useState } from 'react';
import SignUpWidget from './components/widgets/SignUpWidget';

/**
 * Check if the current page is embedded in an iframe from an allowed domain
 */
const checkIframeOrigin = (): { allowed: boolean; reason?: string } => {
  // If not in an iframe, allow (direct access)
  if (typeof window === 'undefined' || window.self === window.top) {
    return { allowed: true };
  }

  // Get allowed domains from env
  // The worker injects values into window.process.env, not process.env (which doesn't exist in browser)
  const getDefaultFallback = () => {
    if (typeof window === 'undefined') return '';

    const hostname = window.location.hostname;

    // Fallback for localhost: if we're on localhost and no config, allow localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'localhost,127.0.0.1';
    }

    // Fallback for staging: if we're on signup-staging and no config, allow d1t.tibroish.bg
    if (hostname === 'signup-staging.tibroish.bg') {
      return 'd1t.tibroish.bg';
    }

    // Fallback for production: if we're on signup.tibroish.bg and no config, allow tibroish.bg and dabulgaria.bg
    if (hostname === 'signup.tibroish.bg') {
      return 'tibroish.bg,dabulgaria.bg';
    }

    return '';
  };

  // Try multiple sources: runtime injection (worker), build-time (Vite), then fallback
  const allowedDomainsRaw =
    (typeof window !== 'undefined' && (window as any).process?.env?.VITE_ALLOWED_IFRAME_DOMAINS) ||
    (typeof process !== 'undefined' && process.env?.VITE_ALLOWED_IFRAME_DOMAINS) ||
    getDefaultFallback();

  // Debug logging
  console.log('Iframe protection check:', {
    hasProcess: typeof process !== 'undefined',
    hasProcessEnv: typeof process !== 'undefined' && typeof process.env !== 'undefined',
    hasWindowProcess: typeof window !== 'undefined' && typeof (window as any).process !== 'undefined',
    hasWindowProcessEnv: typeof window !== 'undefined' && typeof (window as any).process?.env !== 'undefined',
    windowProcessEnvValue: typeof window !== 'undefined' ? ((window as any).process?.env?.VITE_ALLOWED_IFRAME_DOMAINS || 'not found') : 'window undefined',
    allowedDomainsRaw: allowedDomainsRaw,
    allowedDomainsRawType: typeof allowedDomainsRaw,
    allowedDomainsRawLength: allowedDomainsRaw?.length
  });

  const allowedDomains = allowedDomainsRaw
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);

  console.log('Parsed allowed domains:', allowedDomains);

  // If no domains configured, block iframe embedding (security: explicit allowlist)
  if (allowedDomains.length === 0) {
    return {
      allowed: false,
      reason: 'Iframe embedding is not allowed. No allowed domains configured.'
    };
  }

  try {
    // Try to access parent window origin
    // This will throw if cross-origin (which is expected)
    const parentOrigin = window.location.ancestorOrigins?.[0] ||
      (window.parent !== window.top ?
        (() => {
          try {
            return new URL(document.referrer).origin;
          } catch {
            return null;
          }
        })() : null);

    if (!parentOrigin) {
      // Cross-origin iframe - check referrer
      const referrer = document.referrer;
      if (!referrer) {
        return {
          allowed: false,
          reason: 'Cannot verify iframe origin. Referrer not available.'
        };
      }

      try {
        const referrerUrl = new URL(referrer);
        const referrerHost = referrerUrl.hostname;

        // Check if referrer host matches any allowed domain
        const isAllowed = allowedDomains.some(domain => {
          // Exact match
          if (referrerHost === domain) return true;
          // Subdomain match (e.g., www.tibroish.bg matches tibroish.bg)
          if (referrerHost.endsWith('.' + domain)) return true;
          // Handle localhost variations
          if (domain.includes('localhost') && referrerHost.includes('localhost')) return true;
          if (domain.includes('127.0.0.1') && referrerHost.includes('127.0.0.1')) return true;
          return false;
        });

        if (!isAllowed) {
          return {
            allowed: false,
            reason: `This form can only be embedded from: ${allowedDomains.join(', ')}`
          };
        }

        return { allowed: true };
      } catch (e) {
        return {
          allowed: false,
          reason: 'Invalid referrer URL. Cannot verify iframe origin.'
        };
      }
    }

    // Same-origin or accessible parent origin
    const parentHost = new URL(parentOrigin).hostname;
    const isAllowed = allowedDomains.some(domain => {
      if (parentHost === domain) return true;
      if (parentHost.endsWith('.' + domain)) return true;
      if (domain.includes('localhost') && parentHost.includes('localhost')) return true;
      if (domain.includes('127.0.0.1') && parentHost.includes('127.0.0.1')) return true;
      return false;
    });

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `This form can only be embedded from: ${allowedDomains.join(', ')}`
      };
    }

    return { allowed: true };
  } catch (e) {
    // Cross-origin restriction - use referrer check
    return checkIframeOrigin();
  }
};

/**
 * App component - renders the SignUpWidget directly
 * Includes iframe origin protection
 */
const App: React.FC = () => {
  const [iframeCheck, setIframeCheck] = useState<{ allowed: boolean; reason?: string } | null>(null);

  useEffect(() => {
    // Wait a bit for the injected script to execute and set window.process.env
    // The script is injected in <head> but React might load before it executes
    const checkWithRetry = (attempts = 0) => {
      // Check if window.process.env is available
      const hasEnv = typeof window !== 'undefined' &&
                     (window as any).process?.env?.VITE_ALLOWED_IFRAME_DOMAINS !== undefined;

      if (hasEnv || attempts >= 10) {
        // Either we have the env var or we've tried enough times
        const check = checkIframeOrigin();
        setIframeCheck(check);
      } else {
        // Retry after a short delay
        setTimeout(() => checkWithRetry(attempts + 1), 50);
      }
    };

    checkWithRetry();
  }, []);

  // Show error if iframe check fails
  if (iframeCheck && !iframeCheck.allowed) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-red-600 text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Embedding Not Allowed</h1>
          <p className="text-gray-600 mb-4">{iframeCheck.reason}</p>
          <p className="text-sm text-gray-500">
            Please contact the form administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <SignUpWidget />
    </div>
  );
};

export default App;
