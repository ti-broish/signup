/**
 * Google Sheets export handler
 *
 * Appends a single volunteer row to Google Sheets.
 * Uses Google Sheets API v4 with service account JWT authentication
 * via Web Crypto API (no external dependencies).
 */

import { Logger } from '../utils/logger';

export interface VolunteerExportData {
  id: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  phone: string;
  egn: string;
  country: string;
  region: string | null;
  municipality: string | null;
  settlement: string | null;
  cityRegion: string | null;
  pollingStation: string | null;
  travelAbility: string;
  distantOblasts: string | null;
  riskySections: boolean;
  gdprConsent: boolean;
  role: string;
  referralCode: string;
  referredBy: string | null;
  createdAt: string;
}

function base64url(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key from PEM
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyBuffer = Uint8Array.from(atob(pemBody), (c: string) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${unsignedToken}.${signatureB64}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${await response.text()}`);
  }

  const result = (await response.json()) as { access_token: string };
  return result.access_token;
}

export async function appendRowToSheet(
  serviceAccountJson: string,
  spreadsheetId: string,
  sheetName: string,
  volunteer: VolunteerExportData,
  logger: Logger
): Promise<void> {
  if (!serviceAccountJson || !spreadsheetId) {
    logger.info('Google Sheets not configured, skipping export', {
      volunteerId: volunteer.id,
      hasServiceAccount: !!serviceAccountJson,
      hasSpreadsheetId: !!spreadsheetId,
    });
    return;
  }

  const accessToken = await getGoogleAccessToken(serviceAccountJson);

  const row = [
    String(volunteer.id),
    volunteer.firstName,
    volunteer.middleName || '',
    volunteer.lastName,
    volunteer.email,
    volunteer.phone,
    volunteer.egn || '',
    volunteer.country || '',
    volunteer.region || '',
    volunteer.municipality || '',
    volunteer.settlement || '',
    volunteer.cityRegion || '',
    volunteer.pollingStation || '',
    volunteer.travelAbility,
    volunteer.gdprConsent,
    volunteer.role,
    volunteer.referralCode,
    volunteer.referredBy || '',
    volunteer.createdAt,
    volunteer.riskySections,
    volunteer.distantOblasts || '',
  ];

  const range = `${sheetName}!A:U`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Sheets API error: ${error}`);
  }

  logger.info('Row appended to Google Sheets', {
    volunteerId: volunteer.id,
    spreadsheetId,
  });
}
