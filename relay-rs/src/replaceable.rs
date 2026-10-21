//! NIP-01 replaceable (0, 3, 10000-19999) and addressable (30000-39999) events.
//!
//! Only the newest event per (pubkey, kind) — plus the first `d` tag value for
//! addressable kinds — is kept. Ties on `created_at` go to the lowest event id
//! (lexical hex). The decision logic is pure so it can be unit tested; the DB
//! side runs the decision, the delete of superseded rows, and the insert in a
//! single transaction serialised by an advisory lock on the replacement key.

use nostr::prelude::Event;
use sqlx::{Pool, Postgres, Row};

/// How an event kind is stored with respect to replacement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Replacement {
    /// Regular (or ephemeral) kinds: every event is stored as-is.
    None,
    /// Replaceable kinds: keyed on (pubkey, kind).
    Replaceable,
    /// Addressable kinds: keyed on (pubkey, kind, d). Missing `d` tag = "".
    Addressable(String),
}

/// Classify a kind. `tags` are only consulted for addressable kinds.
pub fn classify<S: AsRef<str>>(kind: u16, tags: &[Vec<S>]) -> Replacement {
    match kind {
        0 | 3 | 10000..=19999 => Replacement::Replaceable,
        30000..=39999 => Replacement::Addressable(d_tag_value(tags)),
        _ => Replacement::None,
    }
}

/// Value of the first `d` tag; "" when there is no `d` tag or it has no value.
pub fn d_tag_value<S: AsRef<str>>(tags: &[Vec<S>]) -> String {
    tags.iter()
        .find(|t| t.first().map(|n| n.as_ref() == "d").unwrap_or(false))
        .and_then(|t| t.get(1).map(|v| v.as_ref().to_string()))
        .unwrap_or_default()
}

/// True when event `a` beats event `b`: newer `created_at`, or equal
/// `created_at` and lower id (lexical hex).
pub fn supersedes(a_created_at: i64, a_id: &str, b_created_at: i64, b_id: &str) -> bool {
    a_created_at > b_created_at || (a_created_at == b_created_at && a_id < b_id)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    /// Store the incoming event and delete these superseded event ids.
    Store { delete: Vec<String> },
    /// An event with the same id is already stored.
    Duplicate,
    /// A stored event beats the incoming one; do not store it.
    HaveNewer,
}

/// Decide what to do with an incoming event given the stored events that share
/// its replacement key, as `(created_at seconds, event id)` pairs.
pub fn decide(incoming_created_at: i64, incoming_id: &str, existing: &[(i64, String)]) -> Decision {
    if existing.iter().any(|(_, id)| id == incoming_id) {
        return Decision::Duplicate;
    }
    if existing
        .iter()
        .any(|(c, id)| supersedes(*c, id, incoming_created_at, incoming_id))
    {
        return Decision::HaveNewer;
    }
    Decision::Store {
        delete: existing.iter().map(|(_, id)| id.clone()).collect(),
    }
}

/// SQL expression for the first `d` tag value of a row ("" when absent).
/// Must stay in sync with `d_tag_value` and scripts/*-superseded-replaceable.sql.
pub const SQL_D_TAG: &str = "COALESCE((SELECT t.elem->>1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(tags) = 'array' THEN tags ELSE '[]'::jsonb END) WITH ORDINALITY AS t(elem, ord) WHERE jsonb_typeof(t.elem) = 'array' AND t.elem->>0 = 'd' ORDER BY t.ord LIMIT 1), '')";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreOutcome {
    /// Inserted. `replaced` is the number of superseded rows deleted.
    Stored { replaced: u64 },
    /// Same event id already stored.
    Duplicate,
    /// A newer (or tie-winning) version is stored; the event was not stored.
    HaveNewer,
}

/// Store an event, applying NIP-01 replacement rules for replaceable and
/// addressable kinds. Regular kinds are inserted unchanged.
pub async fn store_event(
    db: &Pool<Postgres>,
    event: &Event,
    expires_at: Option<chrono::NaiveDateTime>,
    row_id: String,
) -> Result<StoreOutcome, sqlx::Error> {
    let kind = event.kind.as_u16();
    let tags: Vec<Vec<String>> = event.tags.iter().map(|t| t.as_slice().to_vec()).collect();
    let replacement = classify(kind, &tags);
    let event_id = event.id.to_hex();
    let pubkey = event.pubkey.to_hex();
    let created_secs = event.created_at.as_secs() as i64;

    let mut tx = db.begin().await?;

    let mut replaced = 0;
    if replacement != Replacement::None {
        let d = match &replacement {
            Replacement::Addressable(d) => Some(d.as_str()),
            _ => None,
        };

        // Serialise writers for this replacement key, including the case where
        // no row exists yet (FOR UPDATE alone would lock nothing).
        let lock_key = format!("{}:{}:{}", pubkey, kind, d.unwrap_or(""));
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(&lock_key)
            .execute(&mut *tx)
            .await?;

        let mut sql = String::from(
            "SELECT \"eventId\", floor(EXTRACT(EPOCH FROM \"createdAt\"))::bigint AS created_at \
             FROM events WHERE pubkey = $1 AND kind = $2",
        );
        if d.is_some() {
            sql.push_str(&format!(" AND {} = $3", SQL_D_TAG));
        }
        sql.push_str(" FOR UPDATE");
        let mut query = sqlx::query(&sql).bind(&pubkey).bind(kind as i32);
        if let Some(d) = d {
            query = query.bind(d);
        }
        let existing: Vec<(i64, String)> = query
            .fetch_all(&mut *tx)
            .await?
            .iter()
            .map(|r| (r.get::<i64, _>("created_at"), r.get::<String, _>("eventId")))
            .collect();

        match decide(created_secs, &event_id, &existing) {
            Decision::Duplicate => {
                tx.rollback().await?;
                return Ok(StoreOutcome::Duplicate);
            }
            Decision::HaveNewer => {
                tx.rollback().await?;
                return Ok(StoreOutcome::HaveNewer);
            }
            Decision::Store { delete } => {
                if !delete.is_empty() {
                    replaced = sqlx::query("DELETE FROM events WHERE \"eventId\" = ANY($1)")
                        .bind(&delete)
                        .execute(&mut *tx)
                        .await?
                        .rows_affected();
                }
            }
        }
    }

    let tags_json = serde_json::to_value(&event.tags).unwrap_or(serde_json::Value::Null);
    let created_at = chrono::DateTime::from_timestamp(created_secs, 0)
        .unwrap_or_default()
        .naive_utc()
        .and_utc();

    sqlx::query(
        "INSERT INTO events (id, \"eventId\", pubkey, kind, content, tags, sig, \"createdAt\", \"receivedAt\", \"expiresAt\")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
         ON CONFLICT (\"eventId\") DO NOTHING",
    )
    .bind(row_id)
    .bind(&event_id)
    .bind(&pubkey)
    .bind(kind as i32)
    .bind(&event.content)
    .bind(tags_json)
    .bind(event.sig.to_string())
    .bind(created_at)
    .bind(expires_at)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(StoreOutcome::Stored { replaced })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tags(v: &[&[&str]]) -> Vec<Vec<String>> {
        v.iter().map(|t| t.iter().map(|s| s.to_string()).collect()).collect()
    }

    const A: &str = "aaaa000000000000000000000000000000000000000000000000000000000000";
    const B: &str = "bbbb000000000000000000000000000000000000000000000000000000000000";
    const C: &str = "cccc000000000000000000000000000000000000000000000000000000000000";

    #[test]
    fn classifies_kinds() {
        let none: Vec<Vec<String>> = vec![];
        assert_eq!(classify(0, &none), Replacement::Replaceable);
        assert_eq!(classify(3, &none), Replacement::Replaceable);
        assert_eq!(classify(10000, &none), Replacement::Replaceable);
        assert_eq!(classify(19999, &none), Replacement::Replaceable);
        assert_eq!(classify(1, &none), Replacement::None);
        assert_eq!(classify(5, &none), Replacement::None);
        assert_eq!(classify(9999, &none), Replacement::None);
        assert_eq!(classify(20000, &none), Replacement::None); // ephemeral
        assert_eq!(classify(29999, &none), Replacement::None);
        assert_eq!(classify(40000, &none), Replacement::None);
        assert_eq!(classify(30000, &none), Replacement::Addressable(String::new()));
        assert_eq!(
            classify(39999, &tags(&[&["d", "x"]])),
            Replacement::Addressable("x".into())
        );
    }

    #[test]
    fn d_tag_is_first_d_value_or_empty() {
        assert_eq!(d_tag_value(&tags(&[])), "");
        assert_eq!(d_tag_value(&tags(&[&["p", "x"]])), "");
        assert_eq!(d_tag_value(&tags(&[&["d"]])), "");
        assert_eq!(d_tag_value(&tags(&[&["d", ""]])), "");
        assert_eq!(d_tag_value(&tags(&[&["p", "x"], &["d", "one"], &["d", "two"]])), "one");
    }

    #[test]
    fn newer_supersedes_older() {
        assert_eq!(
            decide(200, B, &[(100, A.to_string())]),
            Decision::Store { delete: vec![A.to_string()] }
        );
    }

    #[test]
    fn first_event_is_stored() {
        assert_eq!(decide(100, A, &[]), Decision::Store { delete: vec![] });
    }

    #[test]
    fn older_arriving_late_is_rejected() {
        assert_eq!(decide(100, A, &[(200, B.to_string())]), Decision::HaveNewer);
    }

    #[test]
    fn kind0_a_day_older_than_stored_is_rejected() {
        let stored = 1_760_000_000;
        assert_eq!(classify::<String>(0, &[]), Replacement::Replaceable);
        assert_eq!(decide(stored - 86_400, A, &[(stored, B.to_string())]), Decision::HaveNewer);
    }

    #[test]
    fn same_id_is_duplicate() {
        assert_eq!(decide(100, A, &[(100, A.to_string())]), Decision::Duplicate);
    }

    #[test]
    fn tie_goes_to_lowest_id() {
        // Lower id arrives second: replaces the higher one.
        assert_eq!(
            decide(100, A, &[(100, B.to_string())]),
            Decision::Store { delete: vec![B.to_string()] }
        );
        // Higher id arrives second: rejected.
        assert_eq!(decide(100, B, &[(100, A.to_string())]), Decision::HaveNewer);
    }

    #[test]
    fn newer_deletes_all_stale_versions() {
        let existing = vec![(100, A.to_string()), (150, B.to_string())];
        assert_eq!(
            decide(200, C, &existing),
            Decision::Store { delete: vec![A.to_string(), B.to_string()] }
        );
        assert_eq!(decide(120, C, &existing), Decision::HaveNewer);
    }

    #[test]
    fn supersedes_rules() {
        assert!(supersedes(2, B, 1, A));
        assert!(!supersedes(1, A, 2, B));
        assert!(supersedes(1, A, 1, B));
        assert!(!supersedes(1, B, 1, A));
        assert!(!supersedes(1, A, 1, A));
    }
}

/// DB-backed tests. Skipped unless TEST_DATABASE_URL points at a throwaway
/// Postgres with the Prisma schema applied (see scripts/test-relay-db.sh).
#[cfg(test)]
mod db_tests {
    use super::*;
    use nostr::prelude::{EventBuilder, FinalizeEvent, Keys, Kind, Tag, Timestamp};
    use sqlx::postgres::PgPoolOptions;

    async fn pool() -> Option<Pool<Postgres>> {
        let url = std::env::var("TEST_DATABASE_URL").ok()?;
        Some(
            PgPoolOptions::new()
                .max_connections(10)
                .connect(&url)
                .await
                .expect("connect TEST_DATABASE_URL"),
        )
    }

    /// Fresh keys with a whitelisted user row (events.pubkey has an FK to users).
    async fn user(db: &Pool<Postgres>) -> Keys {
        let keys = Keys::generate();
        let pk = keys.public_key().to_hex();
        sqlx::query(
            "INSERT INTO users (id, npub, pubkey, \"updatedAt\", \"whitelistStatus\") VALUES ($1, $2, $2, NOW(), 'ACTIVE')",
        )
        .bind(nanoid::nanoid!())
        .bind(&pk)
        .execute(db)
        .await
        .unwrap();
        keys
    }

    fn ev(keys: &Keys, kind: u16, created_at: u64, content: &str, tags: Vec<Tag>) -> Event {
        EventBuilder::new(Kind::from(kind), content)
            .tags(tags)
            .custom_created_at(Timestamp::from(created_at))
            .finalize(keys)
            .unwrap()
    }

    async fn store(db: &Pool<Postgres>, e: &Event) -> StoreOutcome {
        store_event(db, e, None, nanoid::nanoid!()).await.unwrap()
    }

    async fn stored_ids(db: &Pool<Postgres>, keys: &Keys, kind: u16) -> Vec<String> {
        sqlx::query("SELECT \"eventId\" FROM events WHERE pubkey = $1 AND kind = $2 ORDER BY \"eventId\"")
            .bind(keys.public_key().to_hex())
            .bind(kind as i32)
            .fetch_all(db)
            .await
            .unwrap()
            .iter()
            .map(|r| r.get("eventId"))
            .collect()
    }

    #[tokio::test]
    async fn db_replaceable_newer_supersedes_older() {
        let Some(db) = pool().await else { return };
        let k = user(&db).await;
        let mut last = None;
        for (i, ts) in [1000u64, 1001, 1002, 1003].iter().enumerate() {
            let e = ev(&k, 0, *ts, &format!("v{}", i), vec![]);
            let out = store(&db, &e).await;
            assert_eq!(out, StoreOutcome::Stored { replaced: if i == 0 { 0 } else { 1 } });
            last = Some(e);
        }
        assert_eq!(stored_ids(&db, &k, 0).await, vec![last.unwrap().id.to_hex()]);
    }

    #[tokio::test]
    async fn db_older_arriving_late_is_rejected() {
        let Some(db) = pool().await else { return };
        let k = user(&db).await;
        let newer = ev(&k, 10002, 2000, "new", vec![]);
        let older = ev(&k, 10002, 1000, "old", vec![]);
        assert_eq!(store(&db, &newer).await, StoreOutcome::Stored { replaced: 0 });
        assert_eq!(store(&db, &older).await, StoreOutcome::HaveNewer);
        assert_eq!(store(&db, &newer).await, StoreOutcome::Duplicate);
        assert_eq!(stored_ids(&db, &k, 10002).await, vec![newer.id.to_hex()]);
    }

    #[tokio::test]
    async fn db_kind0_a_day_older_than_stored_is_rejected() {
        let Some(db) = pool().await else { return };
        let k = user(&db).await;
        let now = Timestamp::now().as_secs();
        let newest = ev(&k, 0, now, "{\"name\":\"new\"}", vec![]);
        let day_older = ev(&k, 0, now - 86_400, "{\"name\":\"old\"}", vec![]);
        assert_eq!(store(&db, &newest).await, StoreOutcome::Stored { replaced: 0 });
        assert_eq!(store(&db, &day_older).await, StoreOutcome::HaveNewer);
        assert_eq!(stored_ids(&db, &k, 0).await, vec![newest.id.to_hex()]);
    }

    #[tokio::test]
    async fn db_addressable_d_tags() {
        let Some(db) = pool().await else { return };
        let k = user(&db).await;
        let a1 = ev(&k, 30023, 1000, "a1", vec![Tag::identifier("a")]);
        let b1 = ev(&k, 30023, 1000, "b1", vec![Tag::identifier("b")]);
        let none1 = ev(&k, 30023, 1000, "none1", vec![]);
        let empty2 = ev(&k, 30023, 1001, "empty2", vec![Tag::identifier("")]);
        let a2 = ev(&k, 30023, 1001, "a2", vec![Tag::identifier("a")]);
        let other_kind = ev(&k, 30024, 999, "other kind", vec![Tag::identifier("a")]);

        for e in [&a1, &b1, &none1, &other_kind] {
            assert_eq!(store(&db, e).await, StoreOutcome::Stored { replaced: 0 });
        }
        // Different d tags coexist.
        assert_eq!(stored_ids(&db, &k, 30023).await.len(), 3);
        // Same d replaces; missing d and empty d are the same address.
        assert_eq!(store(&db, &a2).await, StoreOutcome::Stored { replaced: 1 });
        assert_eq!(store(&db, &empty2).await, StoreOutcome::Stored { replaced: 1 });
        assert_eq!(store(&db, &a1).await, StoreOutcome::HaveNewer);

        let mut want = vec![a2.id.to_hex(), b1.id.to_hex(), empty2.id.to_hex()];
        want.sort();
        assert_eq!(stored_ids(&db, &k, 30023).await, want);
        assert_eq!(stored_ids(&db, &k, 30024).await, vec![other_kind.id.to_hex()]);
    }

    #[tokio::test]
    async fn db_tie_break_lowest_id_wins() {
        let Some(db) = pool().await else { return };
        // Both arrival orders.
        for low_first in [true, false] {
            let k = user(&db).await;
            let x = ev(&k, 3, 5000, "x", vec![]);
            let y = ev(&k, 3, 5000, "y", vec![]);
            let (low, high) = if x.id.to_hex() < y.id.to_hex() { (x, y) } else { (y, x) };
            if low_first {
                store(&db, &low).await;
                assert_eq!(store(&db, &high).await, StoreOutcome::HaveNewer);
            } else {
                store(&db, &high).await;
                assert_eq!(store(&db, &low).await, StoreOutcome::Stored { replaced: 1 });
            }
            assert_eq!(stored_ids(&db, &k, 3).await, vec![low.id.to_hex()]);
        }
    }

    #[tokio::test]
    async fn db_regular_events_unchanged() {
        let Some(db) = pool().await else { return };
        let k = user(&db).await;
        for (kind, ts) in [(1u16, 1000u64), (1, 1001), (20001, 1000), (20001, 1001)] {
            let e = ev(&k, kind, ts, "x", vec![]);
            assert_eq!(store(&db, &e).await, StoreOutcome::Stored { replaced: 0 });
        }
        assert_eq!(stored_ids(&db, &k, 1).await.len(), 2);
        assert_eq!(stored_ids(&db, &k, 20001).await.len(), 2);
    }

    #[tokio::test]
    async fn db_concurrent_writers_keep_one_winner() {
        let Some(db) = pool().await else { return };
        let k = user(&db).await;
        let events: Vec<Event> = (0..20u64)
            .map(|i| ev(&k, 0, 7000 + (i % 5), &format!("c{}", i), vec![]))
            .collect();
        let winner = events
            .iter()
            .max_by(|a, b| {
                let (ac, bc) = (a.created_at.as_secs(), b.created_at.as_secs());
                ac.cmp(&bc).then_with(|| b.id.to_hex().cmp(&a.id.to_hex()))
            })
            .unwrap()
            .id
            .to_hex();
        let handles: Vec<_> = events
            .into_iter()
            .map(|e| {
                let db = db.clone();
                tokio::spawn(async move { store_event(&db, &e, None, nanoid::nanoid!()).await.unwrap() })
            })
            .collect();
        for h in handles {
            h.await.unwrap();
        }
        assert_eq!(stored_ids(&db, &k, 0).await, vec![winner]);
    }
}
