-- Add riskySections column to volunteers table
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we use a workaround
-- Check if column exists by trying to add it (will fail silently if it exists in some SQLite versions)
-- For idempotency, we'll rely on wrangler's migration tracking
ALTER TABLE volunteers ADD COLUMN riskySections INTEGER NOT NULL DEFAULT 0;
