# Deployment Guide

This guide covers setting up and deploying the signup monorepo to Cloudflare Workers with staging and production environments.

## Prerequisites

- Cloudflare account with Workers access
- `wrangler` CLI installed globally or via pnpm
- Account ID: `579692914a155ab268c22b814cbf8a05`

## Environment Setup

### Domains

- **Staging**: `signup-staging.tibroish.bg`
- **Production**: `signup.tibroish.bg`

### Workers

- **form**: Frontend React app (staging: `signup-staging.tibroish.bg`, production: `signup.tibroish.bg`)
- **submit**: API worker (staging: `submit.signup-staging.tibroish.bg`, production: `submit.signup.tibroish.bg`)
- **export**: Cron worker (no public routes)

## D1 Database Setup

### Step 1: Create Databases

Run the setup script to create staging and production databases:

```bash
pnpm db:setup
```

This will create:
- `signup-db-staging` (for staging environment)
- `signup-db-production` (for production environment)

The script will output the database IDs. You need to update the `database_id` fields in:
- `submit/wrangler.jsonc` (for both staging and production environments)
- `export/wrangler.jsonc` (for both staging and production environments)

### Step 2: Apply Schema and Migrations

After updating the database IDs in the wrangler.jsonc files:

**Staging:**
```bash
# Apply schema
cd submit
npx wrangler d1 execute signup-db-staging --file=schema.sql --env=staging

# Apply migrations
npx wrangler d1 migrations apply signup-db-staging --env=staging
```

**Production:**
```bash
# Apply schema
cd submit
npx wrangler d1 execute signup-db-production --file=schema.sql --env=production

# Apply migrations
npx wrangler d1 migrations apply signup-db-production --env=production
```

Or use the convenience scripts:
```bash
pnpm db:migrate:staging
pnpm db:migrate:production
```

## Environment Variables

### Form Worker (`form/wrangler.jsonc`)

Set these in Cloudflare dashboard or via `wrangler secret`:

- `VITE_TURNSTILE_SITE_KEY` (staging and production)

### Submit Worker (`submit/wrangler.jsonc`)

Set these secrets:
- `TURNSTILE_SECRET_KEY` (staging and production)

### Export Worker (`export/wrangler.jsonc`)

Set these secrets:
- `GOOGLE_SHEETS_API_KEY` (production only)
- `GOOGLE_SHEETS_SPREADSHEET_ID` (production only)

To set secrets:
```bash
# Staging
cd submit && npx wrangler secret put TURNSTILE_SECRET_KEY --env=staging

# Production
cd submit && npx wrangler secret put TURNSTILE_SECRET_KEY --env=production
```

## DNS and Route Configuration

### Custom Domains

Custom domains must be configured in the Cloudflare dashboard:

1. Go to Workers & Pages → Your Worker → Settings → Triggers
2. Add custom domains for each environment:

**Staging:**
- `signup-staging.tibroish.bg` → `signup-form` worker (staging env)
- `submit.signup-staging.tibroish.bg` → `signup-submit` worker (staging env)

**Production:**
- `signup.tibroish.bg` → `signup-form` worker (production env)
- `submit.signup.tibroish.bg` → `signup-submit` worker (production env)

### DNS Records

Ensure DNS records are configured:
- `signup-staging.tibroish.bg` → CNAME to Cloudflare Workers
- `submit.signup-staging.tibroish.bg` → CNAME to Cloudflare Workers
- `signup.tibroish.bg` → CNAME to Cloudflare Workers
- `submit.signup.tibroish.bg` → CNAME to Cloudflare Workers

Note: Routes in `wrangler.jsonc` are for documentation. Actual routing is configured in the Cloudflare dashboard.

## Automatic Deployment (Worker Builds)

Each worker has a `build` command in its `wrangler.jsonc` that runs tests and builds before deployment. Cloudflare Worker Builds uses these to deploy automatically from Git.

### Setup

For each worker (form, submit, export), create **two Workers** in the Cloudflare dashboard:

| Worker | Staging Name | Production Name |
|--------|-------------|-----------------|
| form | `signup-form-staging` | `signup-form-production` |
| submit | `signup-submit-staging` | `signup-submit-production` |
| export | `signup-export-staging` | `signup-export-production` |

### Connect Git Repository

1. In the Cloudflare dashboard, go to each Worker → Settings → Build
2. Connect the `ti-broish/signup` Git repository
3. Configure each Worker:

**Staging Workers:**
- Branch: `main`
- Root directory: `form/`, `submit/`, or `export/` respectively
- Deploy command: `npx wrangler deploy --env staging`

**Production Workers:**
- Branch: `main`
- Root directory: `form/`, `submit/`, or `export/` respectively
- Deploy command: `npx wrangler versions upload --env production` (manual promotion)
- Or: `npx wrangler deploy --env production` (auto-deploy)

### Build Commands

The build commands in each `wrangler.jsonc` run from the worker directory, `cd ..` to repo root for pnpm workspace:

- **form**: `cd .. && pnpm install --frozen-lockfile && pnpm --filter @signup/form test -- --run && pnpm --filter @signup/form build`
- **submit**: `cd .. && pnpm install --frozen-lockfile && pnpm --filter @signup/submit test -- --run && pnpm --filter @signup/submit build`
- **export**: `cd .. && pnpm install --frozen-lockfile && pnpm --filter @signup/export test -- --run && pnpm --filter @signup/export build`

Tests run before builds — a failing test will prevent deployment.

### Environment Variables for Builds

Set build-time secrets in each Worker's Build settings in the dashboard. These are only available during the build, not at runtime. Runtime secrets are configured separately.

## Manual Deployment

### Build

Build all packages:
```bash
pnpm build
```

### Deploy Staging

Deploy all workers to staging:
```bash
pnpm deploy:staging
```

Or deploy individually:
```bash
pnpm deploy:form:staging
pnpm deploy:submit:staging
pnpm deploy:export:staging
```

### Deploy Production

Deploy all workers to production:
```bash
pnpm deploy:production
```

Or deploy individually:
```bash
pnpm deploy:form:production
pnpm deploy:submit:production
pnpm deploy:export:production
```

## Verification

After deployment, verify:

1. **Staging**:
   - Frontend: https://signup-staging.tibroish.bg
   - API: https://submit.signup-staging.tibroish.bg/health

2. **Production**:
   - Frontend: https://signup.tibroish.bg
   - API: https://submit.signup.tibroish.bg/health

## Local Development

Run locally:
```bash
pnpm dev
```

This starts:
- Form worker on `http://localhost:8787`
- Submit worker on `http://localhost:8788`

## Troubleshooting

### Database Connection Issues

If you see database errors:
1. Verify database IDs are correct in `wrangler.jsonc` files
2. Check that databases exist: `npx wrangler d1 list`
3. Verify migrations are applied: `npx wrangler d1 migrations list signup-db-staging --env=staging`

### Route Issues

If routes aren't working:
1. Verify routes are configured in Cloudflare dashboard
2. Check `wrangler.jsonc` route patterns match your domains
3. Ensure custom domains are verified in Cloudflare

### Environment Variable Issues

If env vars aren't loading:
1. Check secrets are set: `npx wrangler secret list --env=staging`
2. Verify `vars` in `wrangler.jsonc` match expected values
3. Check environment-specific overrides in `env` sections
