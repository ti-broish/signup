#!/bin/bash
# Script to create D1 databases for staging and production environments

set -e

ACCOUNT_ID="579692914a155ab268c22b814cbf8a05"

echo "Creating D1 databases for signup project..."

# Create staging database
echo "Creating staging database..."
STAGING_DB_OUTPUT=$(npx wrangler d1 create signup-db-staging --account-id="$ACCOUNT_ID" 2>&1)
STAGING_DB_ID=$(echo "$STAGING_DB_OUTPUT" | grep -oP 'database_id = "\K[^"]+' || echo "")

if [ -z "$STAGING_DB_ID" ]; then
    echo "Failed to extract staging database ID. Output:"
    echo "$STAGING_DB_OUTPUT"
    exit 1
fi

echo "Staging database ID: $STAGING_DB_ID"
echo "Update submit/wrangler.jsonc and export/wrangler.jsonc with this ID for staging environment"

# Create production database
echo "Creating production database..."
PROD_DB_OUTPUT=$(npx wrangler d1 create signup-db-production --account-id="$ACCOUNT_ID" 2>&1)
PROD_DB_ID=$(echo "$PROD_DB_OUTPUT" | grep -oP 'database_id = "\K[^"]+' || echo "")

if [ -z "$PROD_DB_ID" ]; then
    echo "Failed to extract production database ID. Output:"
    echo "$PROD_DB_OUTPUT"
    exit 1
fi

echo "Production database ID: $PROD_DB_ID"
echo "Update submit/wrangler.jsonc and export/wrangler.jsonc with this ID for production environment"

echo ""
echo "Next steps:"
echo "1. Update submit/wrangler.jsonc:"
echo "   - Set database_id in env.staging.d1_databases[0] to: $STAGING_DB_ID"
echo "   - Set database_id in env.production.d1_databases[0] to: $PROD_DB_ID"
echo ""
echo "2. Update export/wrangler.jsonc:"
echo "   - Set database_id in env.staging.d1_databases[0] to: $STAGING_DB_ID"
echo "   - Set database_id in env.production.d1_databases[0] to: $PROD_DB_ID"
echo ""
echo "3. Apply schema to staging database:"
echo "   cd submit && npx wrangler d1 execute signup-db-staging --file=schema.sql --env=staging"
echo ""
echo "4. Apply migrations to staging database:"
echo "   cd submit && npx wrangler d1 migrations apply signup-db-staging --env=staging"
echo ""
echo "5. Apply schema to production database:"
echo "   cd submit && npx wrangler d1 execute signup-db-production --file=schema.sql --env=production"
echo ""
echo "6. Apply migrations to production database:"
echo "   cd submit && npx wrangler d1 migrations apply signup-db-production --env=production"
