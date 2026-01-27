#!/bin/bash
# Apply schema to local D1 database for development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_FILE="$PROJECT_DIR/schema.sql"

# Find the local D1 database file
DB_FILE=$(find "$PROJECT_DIR/.wrangler/state/v3/d1" -name "*.sqlite" 2>/dev/null | head -1)

if [ -z "$DB_FILE" ]; then
    echo "Error: Local D1 database not found. Please run 'wrangler dev' first to create it."
    exit 1
fi

if [ ! -f "$SCHEMA_FILE" ]; then
    echo "Error: Schema file not found at $SCHEMA_FILE"
    exit 1
fi

echo "Applying schema to local database: $DB_FILE"
sqlite3 "$DB_FILE" < "$SCHEMA_FILE"

# Apply migrations if they exist
MIGRATIONS_DIR="$PROJECT_DIR/migrations"
if [ -d "$MIGRATIONS_DIR" ]; then
    echo "Applying migrations..."
    for migration in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration" ]; then
            echo "Applying $(basename "$migration")..."
            sqlite3 "$DB_FILE" < "$migration" 2>/dev/null || echo "Note: Migration may have already been applied or contains errors"
        fi
    done
fi

echo "Schema and migrations applied successfully!"
