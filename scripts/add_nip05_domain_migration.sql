-- Migration: Add per-user NIP-05 domain
-- Date: 2026-10-21
--
-- Equivalent to `prisma db push` for the User.nip05Domain field.
-- Prisma maps the field to the camelCase column "nip05Domain" (the schema has no @map),
-- so the identifier must be quoted. Safe to run more than once.
-- Existing users default to relay.pleb.one, which keeps their current addresses working.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS "nip05Domain" TEXT NOT NULL DEFAULT 'relay.pleb.one';
