import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cloudflare:workers before importing the module
vi.mock('cloudflare:workers', () => ({
  WorkerEntrypoint: class {
    env: any;
    ctx: any;
    constructor(ctx: any, env: any) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

vi.mock('./handlers/export', () => ({
  appendRowToSheet: vi.fn().mockResolvedValue(undefined),
}));

import ExportWorker from './index';
import { appendRowToSheet } from './handlers/export';

const mockEnv = {
  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON: '{"client_email":"test"}',
  GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-123',
  GOOGLE_SHEETS_SHEET_NAME: 'TestSheet',
};

const mockVolunteer = {
  id: 1,
  firstName: 'Иван',
  middleName: null,
  lastName: 'Петров',
  email: 'ivan@test.com',
  phone: '+359888123456',
  egn: '9101011234',
  country: 'България',
  region: null,
  municipality: null,
  settlement: null,
  cityRegion: null,
  pollingStation: null,
  travelAbility: 'Не',
  distantOblasts: null,
  riskySections: false,
  gdprConsent: true,
  role: 'Пазител на вота в секция',
  referralCode: 'ABC123',
  referredBy: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('ExportWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createWorker(envOverrides: Record<string, string> = {}) {
    return new (ExportWorker as any)({}, { ...mockEnv, ...envOverrides });
  }

  it('fetch() should return 404', async () => {
    const worker = createWorker();
    const response = await worker.fetch();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('appendRow() should call appendRowToSheet with correct params', async () => {
    const worker = createWorker();
    await worker.appendRow(mockVolunteer);

    expect(appendRowToSheet).toHaveBeenCalledWith(
      '{"client_email":"test"}',
      'sheet-123',
      'TestSheet',
      mockVolunteer,
      expect.anything(),
    );
  });

  it('appendRow() should default sheet name to Sheet1', async () => {
    const worker = createWorker({ GOOGLE_SHEETS_SHEET_NAME: '' });
    await worker.appendRow(mockVolunteer);

    expect(appendRowToSheet).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'Sheet1',
      mockVolunteer,
      expect.anything(),
    );
  });
});
