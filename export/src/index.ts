/**
 * Cloudflare Worker for exporting volunteer submissions to Google Sheets
 * Runs on a cron schedule (every 6 hours by default)
 */

import { D1Database } from '@cloudflare/workers-types';
import { exportToGoogleSheets } from './handlers/export';
import { Logger } from './utils/logger';

export interface Env {
  DB: D1Database;
  GOOGLE_SHEETS_API_KEY: string; // Service account JSON as string (use Workers Secrets)
  GOOGLE_SHEETS_SPREADSHEET_ID: string;
  GOOGLE_SHEETS_RANGE: string;
}

export default {
  /**
   * Scheduled event handler (cron trigger)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const logger = new Logger({
      event: 'scheduled',
      cron: event.cron,
      scheduledTime: event.scheduledTime.toString(),
    });

    logger.info('Starting scheduled export to Google Sheets');

    try {
      await exportToGoogleSheets(env, logger);
      logger.info('Scheduled export completed successfully');
    } catch (error) {
      logger.error('Scheduled export failed', error);
      // Don't throw - let the execution complete
      // Errors will be logged and visible in Cloudflare dashboard
    }
  },

  /**
   * HTTP handler for manual triggers (optional)
   * Allows manual export via HTTP request for testing
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const logger = new Logger({
      path: new URL(request.url).pathname,
      method: request.method,
    });

    // Only allow POST for manual triggers
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST to trigger export.' }),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      await exportToGoogleSheets(env, logger);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Export completed successfully',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      logger.error('Manual export failed', error);
      return new Response(
        JSON.stringify({
          error: 'Export failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
