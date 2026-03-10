#!/bin/bash
# Apply schema to local D1 database for development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_FILE="$PROJECT_DIR/schema.sql"
MIGRATIONS_DIR="$PROJECT_DIR/migrations"

# Find all local D1 database files and apply schema to each
DB_FILES=$(find "$PROJECT_DIR/.wrangler/state/v3/d1" -name "*.sqlite" 2>/dev/null)

if [ -z "$DB_FILES" ]; then
    echo "Error: Local D1 database not found. Please run 'wrangler dev' first to create it."
    exit 1
fi

# Apply schema to all database files (in case there are multiple)
for DB_FILE in $DB_FILES; do
    echo "Applying schema to: $DB_FILE"
    sqlite3 "$DB_FILE" < "$SCHEMA_FILE" 2>&1 | grep -v "already exists" || true
    
    # Apply migrations if they exist
    if [ -d "$MIGRATIONS_DIR" ]; then
        for migration in "$MIGRATIONS_DIR"/*.sql; do
            if [ -f "$migration" ]; then
                sqlite3 "$DB_FILE" < "$migration" 2>&1 | grep -v "duplicate column\|no such table\|already exists" || true
            fi
        done
    fi
done

echo "Schema applied to all local databases successfully!"
exit 0

if [ ! -f "$SCHEMA_FILE" ]; then
    echo "Error: Schema file not found at $SCHEMA_FILE"
    exit 1
fi

