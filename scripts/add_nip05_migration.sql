-- Migration: Add NIP-05 verification fields
-- Date: 2026-01-29

-- Add nip05_name and nip05_enabled columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS nip05_name TEXT,
ADD COLUMN IF NOT EXISTS nip05_enabled BOOLEAN DEFAULT false;

-- Create unique constraint on nip05_name
CREATE UNIQUE INDEX IF NOT EXISTS users_nip05_name_key ON users(nip05_name);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS users_nip05_name_idx ON users(nip05_name);

-- Update existing users to have nip05_enabled = false if NULL
UPDATE users SET nip05_enabled = false WHERE nip05_enabled IS NULL;
