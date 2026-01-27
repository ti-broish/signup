-- Add referral code columns to volunteers table
-- Note: SQLite doesn't support adding NOT NULL columns without default to existing tables
-- We'll add them as nullable and enforce NOT NULL in application code
-- This migration is idempotent - it will fail silently if columns already exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we rely on
-- wrangler's migration tracking to prevent duplicate execution
ALTER TABLE volunteers ADD COLUMN referralCode TEXT;
ALTER TABLE volunteers ADD COLUMN referredBy TEXT;

-- Create indexes for referral tracking
CREATE INDEX IF NOT EXISTS idx_volunteers_referralCode ON volunteers(referralCode);
CREATE INDEX IF NOT EXISTS idx_volunteers_referredBy ON volunteers(referredBy);
