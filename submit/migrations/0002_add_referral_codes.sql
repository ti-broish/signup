-- Add referral code columns to volunteers table
-- Note: SQLite doesn't support adding NOT NULL columns without default to existing tables
-- We'll add them as nullable and enforce NOT NULL in application code
ALTER TABLE volunteers ADD COLUMN referralCode TEXT;
ALTER TABLE volunteers ADD COLUMN referredBy TEXT;

-- Create indexes for referral tracking
CREATE INDEX IF NOT EXISTS idx_volunteers_referralCode ON volunteers(referralCode);
CREATE INDEX IF NOT EXISTS idx_volunteers_referredBy ON volunteers(referredBy);
