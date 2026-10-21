-- Migration: Add NIP-05 verification fields
-- Date: 2026-01-29
--
-- Equivalent to `prisma db push` for User.nip05Name / User.nip05Enabled.
-- Prisma maps these fields to camelCase columns (the schema has no @map),
-- so identifiers must be quoted. Safe to run more than once.

-- Add "nip05Name" and "nip05Enabled" columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS "nip05Name" TEXT,
ADD COLUMN IF NOT EXISTS "nip05Enabled" BOOLEAN NOT NULL DEFAULT false;

-- Create unique constraint on "nip05Name"
CREATE UNIQUE INDEX IF NOT EXISTS "users_nip05Name_key" ON users("nip05Name");

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "users_nip05Name_idx" ON users("nip05Name");

-- In case "nip05Enabled" already existed as a nullable column
UPDATE users SET "nip05Enabled" = false WHERE "nip05Enabled" IS NULL;
ALTER TABLE users ALTER COLUMN "nip05Enabled" SET DEFAULT false;
ALTER TABLE users ALTER COLUMN "nip05Enabled" SET NOT NULL;
