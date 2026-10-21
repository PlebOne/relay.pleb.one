-- Read-only: count superseded versions of NIP-01 replaceable (0, 3, 10000-19999)
-- and addressable (30000-39999) events that cleanup-superseded-replaceable.sql
-- would delete, grouped by kind. Changes nothing.
--
-- Winner per (pubkey, kind[, first d tag value, missing = '']): newest createdAt
-- (whole seconds), ties go to the lowest eventId. Same rules as relay-rs
-- (relay-rs/src/replaceable.rs).
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
    SELECT kind,
           row_number() OVER (PARTITION BY pubkey, kind, d
                              ORDER BY created_secs DESC, "eventId" COLLATE "C" ASC) AS rn
    FROM candidates
)
SELECT kind, count(*) AS superseded
FROM ranked
WHERE rn > 1
GROUP BY kind
ORDER BY kind;
