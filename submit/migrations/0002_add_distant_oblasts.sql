-- Migration: Add distantOblasts column to volunteers table
-- Date: 2026-01-28
-- Description: Add optional field to store which oblasts user wants to travel to when travelAbility is "distant"

-- Add distantOblasts column (nullable TEXT field)
ALTER TABLE volunteers ADD COLUMN distantOblasts TEXT;
