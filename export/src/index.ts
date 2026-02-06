/**
 * Cloudflare Worker for exporting volunteer submissions to Google Sheets.
 *
 * Called via RPC service binding from the submit worker — not exposed externally.
 * Each volunteer submission triggers a single row append to the spreadsheet.
 */

import { WorkerEntrypoint } from 'cloudflare:workers';
import { appendRowToSheet, VolunteerExportData } from './handlers/export';
import { Logger } from './utils/logger';

export interface Env {
  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON: string;
  GOOGLE_SHEETS_SPREADSHEET_ID: string;
  GOOGLE_SHEETS_SHEET_NAME: string;
}

export type { VolunteerExportData };

export default class ExportWorker extends WorkerEntrypoint<Env> {
  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 });
  }

  async appendRow(volunteer: VolunteerExportData): Promise<void> {
    const logger = new Logger({ source: 'rpc', volunteerId: volunteer.id });
    logger.info('Received export request');

    await appendRowToSheet(
      this.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON,
      this.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      this.env.GOOGLE_SHEETS_SHEET_NAME || 'Sheet1',
      volunteer,
      logger
    );
  }
}
