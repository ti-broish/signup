/**
 * Google Sheets export handler
 * 
 * Uses Google Sheets API v4 REST API directly.
 * Requires service account authentication via JWT.
 */

import { D1Database } from '@cloudflare/workers-types';
import { Logger } from '../utils/logger';

export interface Env {
  DB: D1Database;
  GOOGLE_SHEETS_API_KEY: string; // Service account JSON as string (use Workers Secrets)
  GOOGLE_SHEETS_SPREADSHEET_ID: string;
  GOOGLE_SHEETS_RANGE: string;
}

/**
 * Get access token for Google Sheets API using service account
 * Note: This is a simplified version. For production, implement proper JWT signing
 * using Web Crypto API or use a Cloudflare-compatible JWT library.
 */
async function getGoogleSheetsAccessToken(serviceAccountJson: string): Promise<string> {
  // Parse service account JSON
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  // For now, return a placeholder
  // TODO: Implement JWT signing with Web Crypto API
  // See: https://developers.cloudflare.com/workers/examples/jwt-signing/
  // or use a library like 'jose' that works in Cloudflare Workers
  
  throw new Error(
    'JWT signing not yet implemented. ' +
    'Use Workers Secrets to store service account JSON and implement JWT signing ' +
    'or use Google OAuth2 flow for authentication.'
  );
}

export async function exportToGoogleSheets(
  env: Env,
  logger: Logger
): Promise<void> {
  try {
    // Query all volunteers from database
    const { results } = await env.DB.prepare(
      'SELECT * FROM volunteers ORDER BY createdAt DESC'
    ).all<{
      id: number;
      firstName: string;
      middleName: string | null;
      lastName: string;
      email: string;
      phone: string;
      egn: string;
      country: string | null;
      region: string | null;
      municipality: string | null;
      settlement: string | null;
      cityRegion: string | null;
      pollingStation: string | null;
      travelAbility: string;
      gdprConsent: number;
      role: string;
      createdAt: string;
    }>();

    if (!results || results.length === 0) {
      logger.info('No data to export', { count: 0 });
      return;
    }

    // Format data for Google Sheets
    const rows = results.map((volunteer) => [
      volunteer.id.toString(),
      volunteer.firstName,
      volunteer.middleName || '',
      volunteer.lastName,
      volunteer.email,
      volunteer.phone,
      volunteer.egn,
      volunteer.country ? JSON.parse(volunteer.country).name : '',
      volunteer.region ? JSON.parse(volunteer.region).name : '',
      volunteer.municipality ? JSON.parse(volunteer.municipality).name : '',
      volunteer.settlement ? JSON.parse(volunteer.settlement).name : '',
      volunteer.cityRegion ? JSON.parse(volunteer.cityRegion).name : '',
      volunteer.pollingStation
        ? typeof volunteer.pollingStation === 'string'
          ? volunteer.pollingStation
          : JSON.parse(volunteer.pollingStation).place
        : '',
      volunteer.travelAbility,
      volunteer.role,
      volunteer.gdprConsent ? 'Yes' : 'No',
      volunteer.createdAt,
    ]);

    // Add header row
    const headerRow = [
      'ID',
      'First Name',
      'Middle Name',
      'Last Name',
      'Email',
      'Phone',
      'EGN',
      'Country',
      'Region',
      'Municipality',
      'Settlement',
      'City Region',
      'Polling Station',
      'Travel Ability',
      'Role',
      'GDPR Consent',
      'Created At',
    ];

    const allRows = [headerRow, ...rows];

    // Get access token
    const accessToken = await getGoogleSheetsAccessToken(env.GOOGLE_SHEETS_API_KEY);

    // Append rows to spreadsheet using REST API
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${env.GOOGLE_SHEETS_RANGE}:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: allRows,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error('Google Sheets API error', new Error(error));
      throw new Error(`Google Sheets API error: ${error}`);
    }

    const result = await response.json<{ updates: { updatedRows: number } }>();

    logger.info('Export successful', {
      rowCount: rows.length,
      updatedRows: result.updates.updatedRows,
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    });
  } catch (error) {
    logger.error('Error exporting data', error);
    throw error; // Re-throw to be handled by caller
  }
}
