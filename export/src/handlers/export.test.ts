import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appendRowToSheet, VolunteerExportData } from './export';
import { Logger } from '../utils/logger';

const TEST_SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'test@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\ndGVzdGtleQ==\n-----END PRIVATE KEY-----\n',
});

describe('appendRowToSheet', () => {
  let logger: Logger;
  let mockVolunteer: VolunteerExportData;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      withContext: vi.fn(),
    } as unknown as Logger;

    mockVolunteer = {
      id: 42,
      firstName: 'Иван',
      middleName: 'Петров',
      lastName: 'Георгиев',
      email: 'ivan@example.com',
      phone: '+359888123456',
      egn: '9101011234',
      country: 'България',
      region: 'София-град',
      municipality: 'Столична',
      settlement: 'гр. София',
      cityRegion: null,
      pollingStation: null,
      travelAbility: 'Не',
      distantOblasts: null,
      riskySections: false,
      gdprConsent: true,
      role: 'Пазител на вота в секция',
      referralCode: 'ABC123',
      referredBy: null,
      createdAt: '2026-01-01 00:00:00',
    };
  });

  /** Mock crypto.subtle + fetch for the full OAuth→Sheets flow */
  function mockSheetsFlow(
    oauthStatus = 200,
    sheetsStatus = 200,
    sheetsBody = '{}',
  ) {
    vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
    vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1]).buffer);

    const responses: Response[] = [
      new Response(
        oauthStatus === 200 ? JSON.stringify({ access_token: 'mock-token' }) : 'Invalid grant',
        { status: oauthStatus },
      ),
    ];
    if (oauthStatus === 200) {
      responses.push(new Response(sheetsBody, { status: sheetsStatus }));
    }
    const mockFetch = vi.mocked(fetch);
    for (const r of responses) mockFetch.mockResolvedValueOnce(r);
  }

  function callAppendRow(
    overrides: { serviceAccount?: string; spreadsheetId?: string; sheetName?: string; volunteer?: VolunteerExportData } = {},
  ) {
    return appendRowToSheet(
      overrides.serviceAccount ?? TEST_SERVICE_ACCOUNT,
      overrides.spreadsheetId ?? 'spreadsheet-123',
      overrides.sheetName ?? 'Sheet1',
      overrides.volunteer ?? mockVolunteer,
      logger,
    );
  }

  function getAppendedRow(): string[] {
    const sheetsCall = vi.mocked(fetch).mock.calls[1];
    return JSON.parse(sheetsCall[1]!.body as string).values[0];
  }

  it.each([
    { desc: 'serviceAccountJson is empty', serviceAccount: '', spreadsheetId: 'sheet-id' },
    { desc: 'spreadsheetId is empty', serviceAccount: '{"client_email":"test"}', spreadsheetId: '' },
  ])('should skip export when $desc', async ({ serviceAccount, spreadsheetId }) => {
    await appendRowToSheet(serviceAccount, spreadsheetId, 'Sheet1', mockVolunteer, logger);

    expect(fetch).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Google Sheets not configured, skipping export',
      expect.objectContaining({ volunteerId: 42 }),
    );
  });

  it('should construct correct 21-column row in expected order', async () => {
    mockSheetsFlow();
    await callAppendRow();

    const row = getAppendedRow();
    expect(row).toEqual([
      '42',                           // id
      'Иван',                         // firstName
      'Петров',                        // middleName
      'Георгиев',                      // lastName
      'ivan@example.com',             // email
      '+359888123456',                // phone
      '9101011234',                   // egn
      'България',                      // country
      'София-град',                    // region
      'Столична',                      // municipality
      'гр. София',                    // settlement
      '',                             // cityRegion (null)
      '',                             // pollingStation (null)
      'Не',                           // travelAbility
      true,                            // gdprConsent
      'Пазител на вота в секция',     // role
      'ABC123',                       // referralCode
      '',                             // referredBy (null)
      '01.01.2026 00:00:00',          // createdAt
      false,                           // riskySections
      '',                             // distantOblasts (null)
    ]);
  });

  it.each([
    { gdprConsent: true,  riskySections: false, expectedGdpr: true, expectedRisky: false },
    { gdprConsent: false, riskySections: true,  expectedGdpr: false, expectedRisky: true },
  ])('should convert booleans: gdprConsent=$gdprConsent→$expectedGdpr, riskySections=$riskySections→$expectedRisky', async ({ gdprConsent, riskySections, expectedGdpr, expectedRisky }) => {
    mockSheetsFlow();
    await callAppendRow({ volunteer: { ...mockVolunteer, gdprConsent, riskySections } });

    const row = getAppendedRow();
    expect(row[14]).toBe(expectedGdpr);
    expect(row[19]).toBe(expectedRisky);
  });

  it('should convert null/empty fields to empty strings', async () => {
    mockSheetsFlow();
    await callAppendRow({
      volunteer: {
        ...mockVolunteer,
        middleName: null, egn: '', country: '',
        region: null, municipality: null, settlement: null,
      },
    });

    const row = getAppendedRow();
    // Indices for nullable fields: middleName=2, egn=6, country=7, region=8, municipality=9, settlement=10
    for (const idx of [2, 6, 7, 8, 9, 10]) {
      expect(row[idx]).toBe('');
    }
  });

  it('should throw when OAuth token exchange fails', async () => {
    mockSheetsFlow(400);
    await expect(callAppendRow()).rejects.toThrow('Google token exchange failed');
  });

  it('should throw on non-200 Sheets API response', async () => {
    mockSheetsFlow(200, 403, 'Permission denied');
    await expect(callAppendRow()).rejects.toThrow('Google Sheets API error');
  });

  it('should log success after appending', async () => {
    mockSheetsFlow();
    await callAppendRow({ spreadsheetId: 'sheet-id' });

    expect(logger.info).toHaveBeenCalledWith(
      'Row appended to Google Sheets',
      expect.objectContaining({ volunteerId: 42, spreadsheetId: 'sheet-id' }),
    );
  });

  it('should encode sheet name in Sheets API URL', async () => {
    mockSheetsFlow();
    await callAppendRow({ sheetName: 'Sheet With Spaces' });

    const url = vi.mocked(fetch).mock.calls[1][0] as string;
    expect(url).toContain(encodeURIComponent('Sheet With Spaces!A:U'));
  });
});
