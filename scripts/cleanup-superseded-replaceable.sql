-- One-time cleanup: delete superseded versions of NIP-01 replaceable
-- (0, 3, 10000-19999) and addressable (30000-39999) events stored before
-- relay-rs enforced replacement. No other kinds are touched.
--
-- Winner per (pubkey, kind[, first d tag value, missing = '']): newest createdAt
-- (whole seconds), ties go to the lowest eventId. Same rules as relay-rs
-- (relay-rs/src/replaceable.rs). Run scripts/count-superseded-replaceable.sql
-- first to see what will go.
--
-- Runs in one transaction; any error rolls everything back.
\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE superseded_events ON COMMIT DROP AS
WITH candidates AS (
    SELECT
        "eventId",
        pubkey,
        kind,
        CASE WHEN kind BETWEEN 30000 AND 39999 THEN
            COALESCE((SELECT t.elem->>1
                      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(tags) = 'array' THEN tags ELSE '[]'::jsonb END)
                           WITH ORDINALITY AS t(elem, ord)
                      WHERE jsonb_typeof(t.elem) = 'array' AND t.elem->>0 = 'd'
                      ORDER BY t.ord LIMIT 1), '')
        ELSE '' END AS d,
        floor(EXTRACT(EPOCH FROM "createdAt"))::bigint AS created_secs
    FROM events
    WHERE kind IN (0, 3) OR kind BETWEEN 10000 AND 19999 OR kind BETWEEN 30000 AND 39999
),
ranked AS (
    SELECT "eventId", kind,
           row_number() OVER (PARTITION BY pubkey, kind, d
                              ORDER BY created_secs DESC, "eventId" COLLATE "C" ASC) AS rn
    FROM candidates
)
SELECT "eventId", kind FROM ranked WHERE rn > 1;

-- What is about to be deleted, by kind.
SELECT kind, count(*) AS deleting FROM superseded_events GROUP BY kind ORDER BY kind;

DELETE FROM events e
USING superseded_events s
WHERE e."eventId" = s."eventId"
  AND (e.kind IN (0, 3) OR e.kind BETWEEN 10000 AND 19999 OR e.kind BETWEEN 30000 AND 39999);

COMMIT;
