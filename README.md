# Signup Monorepo

A pnpm monorepo containing a React frontend and Cloudflare Worker backends for volunteer registration form submissions.

## Structure

```
signup/
├── form/              # React form frontend (deployed as Cloudflare Worker with Worker Assets)
├── submit/            # Form submission worker (Cloudflare Worker with D1 database)
├── export/            # Export worker (Cloudflare Worker with cron trigger for Google Sheets export)
├── pnpm-workspace.yaml
└── package.json
```

## Features

- **Form** (`signup-form`): React/Vite application deployed as Cloudflare Worker with Worker Assets
- **Submit** (`signup-submit`): Cloudflare Worker with D1 database for form submissions
- **Export** (`signup-export`): Cloudflare Worker with cron trigger (every 6 hours) to export submissions to Google Sheets
- **Turnstile**: Cloudflare Turnstile for bot protection (client and server-side validation)
- **Rate Limiting**: D1-based rate limiting to prevent spam/abuse
- **Iframe Embedding**: Configurable CSP headers to allow specific domains to embed the frontend
- **Scheduled Exports**: Automatic Google Sheets export via cron trigger
- **Structured Logging**: JSON logging for monitoring and debugging

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 9.0.0
- Cloudflare account with Workers and D1 enabled
- Wrangler CLI (`pnpm install -g wrangler` or use `pnpm exec wrangler`)

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Create D1 Database

```bash
cd submit
pnpm db:create
```

This will output a `database_id`. Update both `submit/wrangler.jsonc` and `export/wrangler.jsonc` with the same `database_id`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "signup-db",
      "database_id": "your-database-id-here"
    }
  ]
}
```

### 3. Run Database Migrations

```bash
cd submit
pnpm db:migrate
```

Note: Both `submit` and `export` workers use the same D1 database, so migrations only need to be run once.

### 4. Configure Environment Variables

#### Form Worker (`form/wrangler.jsonc`)

```jsonc
{
  "vars": {
    "VITE_API_URL": "https://submit.signup.example.com",
    "VITE_TURNSTILE_SITE_KEY": "your-turnstile-site-key",
    "ALLOWED_IFRAME_DOMAINS": "example.com,another-domain.com"
  }
}
```

#### Submit Worker (`submit/wrangler.jsonc`)

```jsonc
{
  "vars": {
    "TURNSTILE_SECRET_KEY": "your-turnstile-secret-key",
    "ALLOWED_ORIGINS": "https://form.signup.example.com,https://example.com",
    "RATE_LIMIT_REQUESTS": "5",
    "RATE_LIMIT_WINDOW_SECONDS": "3600"
  }
}
```

#### Export Worker (`export/wrangler.jsonc`)

```jsonc
{
  "vars": {
    "GOOGLE_SHEETS_API_KEY": "service-account-json-as-string",
    "GOOGLE_SHEETS_SPREADSHEET_ID": "your-spreadsheet-id",
    "GOOGLE_SHEETS_RANGE": "Sheet1!A:Z"
  },
  "triggers": {
    "crons": ["0 */6 * * *"] // Every 6 hours
  }
}
```

### 5. Get Turnstile Keys

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to Turnstile
3. Create a new site
4. Copy the Site Key (for frontend) and Secret Key (for backend)

### 6. Setup Google Sheets API (Optional, for export feature)

1. Create a Google Cloud Project
2. Enable Google Sheets API
3. Create a Service Account
4. Download the service account JSON key
5. Share your Google Spreadsheet with the service account email
6. Set `GOOGLE_SHEETS_API_KEY` to the path of the JSON file (or upload to Workers Secrets)

## Development

### Run Form Locally

```bash
cd form
pnpm dev
```

Form will be available at `http://localhost:3000`

### Run Submit Worker Locally

```bash
cd submit
pnpm dev
```

Submit worker will be available at `http://localhost:8787`

### Run Export Worker Locally

```bash
cd export
pnpm dev
```

Note: The export worker runs on a cron schedule. In development, you can trigger it manually via HTTP POST request.

### Run Both Together

From the root directory:

```bash
pnpm dev
```

This runs both frontend and backend in parallel.

## Building

### Build Form

```bash
cd form
pnpm build
```

### Build Submit Worker (TypeScript check)

```bash
cd submit
pnpm build
```

### Build Export Worker (TypeScript check)

```bash
cd export
pnpm build
```

### Build Everything

```bash
pnpm build
```

## Deployment

### Deploy Form

```bash
cd form
pnpm deploy
```

Or from root:

```bash
pnpm deploy:form
```

### Deploy Submit Worker

```bash
cd submit
pnpm deploy
```

Or from root:

```bash
pnpm deploy:submit
```

### Deploy Export Worker

```bash
cd export
pnpm deploy
```

Or from root:

```bash
pnpm deploy:export
```

The export worker will automatically run on the configured cron schedule (default: every 6 hours).

### Deploy Both

```bash
pnpm deploy
```

## Iframe Embedding

The frontend can be embedded as an iframe on allowed domains. Configure allowed domains in `frontend/wrangler.jsonc`:

```jsonc
{
  "vars": {
    "ALLOWED_IFRAME_DOMAINS": "example.com,another-domain.com"
  }
}
```

The frontend worker automatically adds CSP `frame-ancestors` headers to control embedding.

### Embedding Example

```html
<iframe src="https://form.signup.example.com/#/widget/signup?privacyUrl=https://example.com/privacy"></iframe>
```

## API Endpoints

### POST `/volunteers`

Submit a volunteer registration form.

**Request Body:**
```json
{
  "firstName": "Иван",
  "middleName": "Петров",
  "lastName": "Иванов",
  "email": "ivan@example.com",
  "phone": "+359888123456",
  "egn": "1234567890",
  "country": { "code": "BG", "name": "България" },
  "region": { "code": "01", "name": "Благоевград" },
  "municipality": { "code": "0101", "name": "Благоевград" },
  "settlement": { "id": 1, "name": "Благоевград" },
  "cityRegion": { "code": "01", "name": "Център" },
  "pollingStation": { "id": "123", "place": "Училище" },
  "travelAbility": "settlement",
  "gdprConsent": true,
  "role": "poll_watcher",
  "turnstileToken": "turnstile-token-from-client"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "id": 123
}
```

### POST `/export` (Export Worker)

Manually trigger export to Google Sheets (for testing).

**Note:** In production, exports run automatically via cron schedule (every 6 hours by default).

**Request:**
```bash
POST https://signup-export.your-subdomain.workers.dev/
```

**Response:**
```json
{
  "success": true,
  "message": "Export completed successfully"
}
```

**Cron Schedule:**
- Default: Every 6 hours (`0 */6 * * *`)
- Configure in `export/wrangler.jsonc` under `triggers.crons`

### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Rate Limiting

Rate limiting is configured via environment variables:

- `RATE_LIMIT_REQUESTS`: Maximum requests per window (default: 5)
- `RATE_LIMIT_WINDOW_SECONDS`: Time window in seconds (default: 3600)

Rate limits are applied per IP address and per Turnstile token to prevent token reuse.

When rate limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header.

## Database Schema

See `submit/schema.sql` for the complete database schema.

Both `submit` and `export` workers share the same D1 database.

### Tables

- **volunteers**: Stores form submissions
- **rate_limits**: Tracks rate limit usage per IP and Turnstile token

## Logging

Structured JSON logging is used throughout the application. Logs are available in:

- Cloudflare Workers Dashboard → Logs
- Wrangler CLI output during development

Log entries include:
- Timestamp
- Log level (info, warn, error, debug)
- Context (path, method, IP address, etc.)
- Error details (for errors)

## Testing

### Frontend Tests

```bash
cd frontend
pnpm test
```

### Backend Tests

(Add test setup as needed)

## Troubleshooting

### Database Migration Issues

If migrations fail, ensure:
1. Database is created (`cd submit && pnpm db:create`)
2. `database_id` is set in both `submit/wrangler.jsonc` and `export/wrangler.jsonc`
3. You're authenticated with Wrangler (`wrangler login`)

### CORS Issues

Ensure `ALLOWED_ORIGINS` in `worker/wrangler.jsonc` includes:
- Frontend domain
- All domains that will embed the frontend as iframe

### Turnstile Validation Fails

Check:
1. Site key matches in frontend
2. Secret key matches in backend
3. Domain is registered in Turnstile dashboard

### Google Sheets Export Fails

Ensure:
1. Service account JSON key is stored as a Workers Secret or in `export/wrangler.jsonc`
2. Spreadsheet is shared with service account email
3. `GOOGLE_SHEETS_RANGE` is correct format (e.g., `Sheet1!A:Z`)
4. Cron trigger is configured in `export/wrangler.jsonc`
5. Export worker is deployed (`pnpm deploy:export`)

**Note:** JWT signing for Google Sheets API is not yet implemented. See TODO in `export/src/handlers/export.ts`.

## License

[Add your license here]
