/**
 * Rate limiting utility using D1 database
 */

import { D1Database } from '@cloudflare/workers-types';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class RateLimiter {
  constructor(
    private db: D1Database,
    private config: RateLimitConfig
  ) {}

  async checkLimit(ipAddress: string, turnstileToken?: string): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % this.config.windowSeconds);

    // Check IP-based rate limit
    const ipResult = await this.checkIpLimit(ipAddress, windowStart);
    if (!ipResult.allowed) {
      return ipResult;
    }

    // Check Turnstile token-based rate limit (prevent token reuse)
    if (turnstileToken) {
      const tokenResult = await this.checkTokenLimit(turnstileToken, ipAddress, windowStart);
      if (!tokenResult.allowed) {
        return tokenResult;
      }
    }

    return ipResult;
  }

  private async checkIpLimit(ipAddress: string, windowStart: number): Promise<RateLimitResult> {
    // Get current count for this IP in the current window
    const result = await this.db
      .prepare(
        'SELECT count FROM rate_limits WHERE ip_address = ? AND window_start = ?'
      )
      .bind(ipAddress, windowStart)
      .first<{ count: number }>();

    const currentCount = result?.count || 0;

    if (currentCount >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowStart + this.config.windowSeconds,
      };
    }

    // Increment or insert
    if (result) {
      await this.db
        .prepare(
          'UPDATE rate_limits SET count = count + 1 WHERE ip_address = ? AND window_start = ?'
        )
        .bind(ipAddress, windowStart)
        .run();
    } else {
      await this.db
        .prepare(
          'INSERT INTO rate_limits (ip_address, count, window_start) VALUES (?, 1, ?)'
        )
        .bind(ipAddress, windowStart)
        .run();
    }

    // Cleanup old entries (older than 24 hours)
    const cleanupThreshold = windowStart - 86400;
    await this.db
      .prepare('DELETE FROM rate_limits WHERE window_start < ?')
      .bind(cleanupThreshold)
      .run();

    return {
      allowed: true,
      remaining: this.config.maxRequests - currentCount - 1,
      resetAt: windowStart + this.config.windowSeconds,
    };
  }

  private async checkTokenLimit(
    turnstileToken: string,
    ipAddress: string,
    windowStart: number
  ): Promise<RateLimitResult> {
    // Check if this token has already been used
    const result = await this.db
      .prepare(
        'SELECT count FROM rate_limits WHERE turnstile_token = ? AND window_start = ?'
      )
      .bind(turnstileToken, windowStart)
      .first<{ count: number }>();

    if (result && result.count > 0) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowStart + this.config.windowSeconds,
      };
    }

    // Mark token as used (include ip_address as it's NOT NULL)
    await this.db
      .prepare(
        'INSERT OR REPLACE INTO rate_limits (turnstile_token, ip_address, count, window_start) VALUES (?, ?, 1, ?)'
      )
      .bind(turnstileToken, ipAddress, windowStart)
      .run();

    return {
      allowed: true,
      remaining: this.config.maxRequests - 1,
      resetAt: windowStart + this.config.windowSeconds,
    };
  }
}
