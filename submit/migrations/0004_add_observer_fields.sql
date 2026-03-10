-- Add observer fields for the observer signup flow
ALTER TABLE volunteers ADD COLUMN isObserver INTEGER NOT NULL DEFAULT 0;
ALTER TABLE volunteers ADD COLUMN idCardNumber TEXT;
ALTER TABLE volunteers ADD COLUMN permanentAddress TEXT;
CREATE INDEX IF NOT EXISTS idx_volunteers_isObserver ON volunteers(isObserver);
