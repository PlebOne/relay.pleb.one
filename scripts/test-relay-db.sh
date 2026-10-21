#!/usr/bin/env bash
# Run relay-rs tests, including the DB-backed ones, against a throwaway Postgres.
# Applies the Prisma schema (prisma/schema.prisma) to a fresh container, runs
# `cargo test --locked` with TEST_DATABASE_URL set, then removes the container.
#
# Usage (from the repo root, needs docker, node_modules and cargo):
#   scripts/test-relay-db.sh [extra cargo test args]
set -euo pipefail

cd "$(dirname "$0")/.."

NAME="relay-test-pg-$$"
IMAGE="postgres:16.15-alpine3.24"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test \
  -p 127.0.0.1::5432 "$IMAGE" >/dev/null

until docker exec "$NAME" pg_isready -U test -d test >/dev/null 2>&1; do sleep 1; done
# pg_isready can pass during the init-time restart; wait for a real query.
until docker exec "$NAME" psql -U test -d test -c 'SELECT 1' >/dev/null 2>&1; do sleep 1; done

npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U test -d test >/dev/null

PORT="$(docker port "$NAME" 5432/tcp | head -n1 | sed 's/.*://')"
export TEST_DATABASE_URL="postgres://test:test@127.0.0.1:${PORT}/test"

(cd relay-rs && cargo test --locked "$@")
