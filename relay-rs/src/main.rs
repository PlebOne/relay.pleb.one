use axum::{
    extract::{
        ws::{rejection::WebSocketUpgradeRejection, Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::HeaderMap,
    response::{IntoResponse, Response, Json},
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use nostr::prelude::{ClientMessage, Event, EventBuilder, Filter, FinalizeEvent, Keys, Kind, MatchEventOptions, RelayMessage, SubscriptionId, Tag, Timestamp};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres, Row};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::sync::broadcast;
use tracing::{error, info, warn, debug};
use negentropy::{Id, Negentropy, NegentropyStorageVector};
use deadpool_redis::{Pool as RedisPool, Config as RedisConfig, ConnectionInfo as RedisConnectionInfo, Runtime};
use redis::AsyncCommands;
use tower_http::compression::CompressionLayer;

mod config;
mod replaceable;
use config::RelayConfig;
use replaceable::StoreOutcome;

// Cache TTL constants
const CACHE_TTL_WHITELIST: u64 = 300; // 5 minutes for whitelist lookups
const CACHE_TTL_RECENT_EVENTS: u64 = 60; // 1 minute for recent events
const RECENT_EVENTS_KEY: &str = "relay:recent_events";
const MAX_CACHED_EVENTS: i64 = 1000;

#[derive(Clone)]
struct AppState {
    db: Pool<Postgres>,
    tx: broadcast::Sender<Event>,
    redis: Option<RedisPool>,
    connections: Arc<AtomicUsize>,
    started_at: Instant,
    config: RelayConfig,
}

/// Decrements the open-connection counter when a socket handler exits.
struct ConnectionGuard(Arc<AtomicUsize>);

impl ConnectionGuard {
    fn new(counter: Arc<AtomicUsize>) -> Self {
        counter.fetch_add(1, Ordering::Relaxed);
        Self(counter)
    }
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(50)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    // Initialize Redis connection pool
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://redis:6379".to_string());
    // REDIS_PASSWORD (optional) overrides any password in REDIS_URL.
    let redis_config = match redis::IntoConnectionInfo::into_connection_info(redis_url.as_str()) {
        Ok(info) => {
            let mut info = RedisConnectionInfo::from(info);
            if let Ok(password) = std::env::var("REDIS_PASSWORD") {
                if !password.is_empty() {
                    info.redis.password = Some(password);
                }
            }
            RedisConfig::from_connection_info(info)
        }
        Err(_) => RedisConfig::from_url(&redis_url),
    };
    let redis_pool = match redis_config.create_pool(Some(Runtime::Tokio1)) {
        Ok(pool) => {
            info!("Redis connection pool initialized");
            Some(pool)
        }
        Err(e) => {
            warn!("Failed to create Redis pool, caching disabled: {}", e);
            None
        }
    };

    let (tx, _rx) = broadcast::channel(1000); // Increased buffer size

    let state = Arc::new(AppState {
        db: pool,
        tx,
        redis: redis_pool,
        connections: Arc::new(AtomicUsize::new(0)),
        started_at: Instant::now(),
        config: RelayConfig::from_env(),
    });
    info!("Relay config: {:?}", state.config);

    // NIP-66: Relay Monitor Task
    let monitor_state = state.clone();
    tokio::spawn(async move {
        let keys = Keys::generate(); // Ephemeral relay keys for now
        let pubkey = keys.public_key();
        info!("Relay Pubkey for NIP-66: {}", pubkey);

        loop {
            // Build Kind 30166 Event
            let tags = vec![
                Tag::identifier("nrelay"),
                Tag::parse(vec!["url", "wss://relay.pleb.one"]).unwrap(),
                Tag::parse(vec!["software", "relay-rs"]).unwrap(),
                Tag::parse(vec!["version", "0.1.0"]).unwrap(),
                Tag::parse(vec!["supported_nips", "1", "9", "11", "15", "17", "20", "23", "33", "40", "42", "51", "56", "62", "65", "66", "77", "86"]).unwrap(),
            ];

            let event_builder = EventBuilder::new(Kind::from(30166), "").tags(tags);
            
            if let Ok(event) = event_builder.finalize(&keys) {
                // Save to DB; 30166 is addressable, so this replaces the previous one.
                let _ = replaceable::store_event(&monitor_state.db, &event, None, nanoid::nanoid!()).await;

                // Broadcast
                let _ = monitor_state.tx.send(event);
            }

            tokio::time::sleep(Duration::from_secs(3600)).await; // Publish every hour
        }
    });

    // Internal stats listener (connection count, uptime) for the dashboard's
    // Resources view. Separate port so it is never routed by Caddy and is not
    // published by docker compose.
    let stats_port = std::env::var("STATS_PORT").unwrap_or_else(|_| "3002".to_string());
    let stats_app = Router::new()
        .route("/stats", get(stats_handler))
        .with_state(state.clone());
    tokio::spawn(async move {
        let addr: SocketAddr = match format!("0.0.0.0:{}", stats_port).parse() {
            Ok(addr) => addr,
            Err(_) => {
                warn!("Invalid STATS_PORT, stats listener disabled");
                return;
            }
        };
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                info!("Stats listening on {}", addr);
                if let Err(e) = axum::serve(listener, stats_app).await {
                    warn!("Stats listener stopped: {}", e);
                }
            }
            Err(e) => warn!("Failed to bind stats listener: {}", e),
        }
    });

    let app = relay_router(state);

    let port = std::env::var("RELAY_PORT").unwrap_or_else(|_| "3001".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();

    info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn relay_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(handler))
        .layer(CompressionLayer::new()) // Enable gzip/br/deflate compression for HTTP responses
        .with_state(state)
}

async fn handler(
    ws: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
) -> Response {
    if let Ok(ws) = ws {
        // Cap incoming messages/frames just above the event size cap.
        let max = state.config.max_message_length;
        return ws
            .max_message_size(max)
            .max_frame_size(max)
            .on_upgrade(|socket| handle_socket(socket, state))
            .into_response();
    }

    if let Some(accept) = headers.get("accept") {
        if accept.to_str().unwrap_or("").contains("application/nostr+json") {
            return Json(config::relay_info(&state.config)).into_response();
        }
    }

    "Welcome to Relay Pleb One (Rust Edition)".into_response()
}

async fn stats_handler(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "connections": state.connections.load(Ordering::Relaxed),
        "uptime_seconds": state.started_at.elapsed().as_secs(),
    }))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let _connection = ConnectionGuard::new(state.connections.clone());
    let (mut sender, mut receiver) = socket.split();
    let mut subscriptions: HashMap<String, Vec<Filter>> = HashMap::new();
    let mut broadcast_rx = state.tx.subscribe();

    // Spawn a task to handle broadcast messages (events from other clients)
    let (tx_internal, mut rx_internal) = tokio::sync::mpsc::channel::<Message>(100);
    
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx_internal.recv().await {
            if let Err(e) = sender.send(msg).await {
                warn!("Failed to send message: {}", e);
                break;
            }
        }
    });

    // Heartbeat task
    let tx_ping = tx_internal.clone();
    let mut heartbeat_task = tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            if tx_ping.send(Message::Ping(Default::default())).await.is_err() {
                break;
            }
        }
    });

    // NIP-42: Send AUTH challenge
    let challenge = nanoid::nanoid!();
    let _ = tx_internal.send(Message::Text(RelayMessage::auth(challenge.clone()).as_json().into())).await;

    let mut auth_pubkey: Option<String> = None;
    let mut negentropy_sessions: HashMap<String, NegSession> = HashMap::new();

    // Loop to handle incoming messages from client
    loop {
        tokio::select! {
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        // Try parsing as JSON-RPC (NIP-86) or Array (Nostr/NIP-77)
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                            if val.is_object() {
                                // NIP-86 JSON-RPC
                                handle_nip86(val, &state, &tx_internal, &auth_pubkey).await;
                            } else if val.is_array() {
                                let arr = val.as_array().unwrap();
                                if !arr.is_empty() {
                                    let msg_type = arr[0].as_str().unwrap_or("");
                                    match msg_type {
                                        "NEG-OPEN" => {
                                            handle_nip77_open(arr, &state, &tx_internal, &mut negentropy_sessions).await;
                                        }
                                        "NEG-MSG" => {
                                            handle_nip77_msg(arr, &state, &tx_internal, &mut negentropy_sessions).await;
                                        }
                                        "NEG-CLOSE" => {
                                            handle_nip77_close(arr, &mut negentropy_sessions);
                                        }
                                        _ => {
                                            // Standard Nostr
                                            match ClientMessage::from_json(text.as_str()) {
                                                Ok(msg) => {
                                                    handle_client_message(msg, &state, &mut subscriptions, &tx_internal, &challenge, &mut auth_pubkey).await;
                                                }
                                                Err(e) => {
                                                    // Attempt to fix malformed REQ from some clients (nostr-tools v2?)
                                                    // Check if it's ["REQ", sub_id, [filters]]
                                                    let mut handled = false;
                                                    if msg_type == "REQ" && arr.len() == 3 {
                                                        if let Some(filters_arr) = arr[2].as_array() {
                                                            // Reconstruct the message
                                                            let mut new_arr = Vec::new();
                                                            new_arr.push(arr[0].clone());
                                                            new_arr.push(arr[1].clone());
                                                            for f in filters_arr {
                                                                new_arr.push(f.clone());
                                                            }
                                                            let new_text = serde_json::to_string(&new_arr).unwrap_or_default();
                                                            if let Ok(msg) = ClientMessage::from_json(&new_text) {
                                                                handle_client_message(msg, &state, &mut subscriptions, &tx_internal, &challenge, &mut auth_pubkey).await;
                                                                handled = true;
                                                            }
                                                        }
                                                    }

                                                    if !handled {
                                                        // Check if this is a prefix search (common pattern from Amethyst)
                                                        if msg_type == "REQ" && arr.len() >= 3 {
                                                            let filter_objs: Vec<serde_json::Map<String, serde_json::Value>> = arr[2..]
                                                                .iter()
                                                                .filter_map(|f| f.as_object().cloned())
                                                                .collect();
                                                            if let (Some(sub_id), false) = (arr[1].as_str(), filter_objs.is_empty()) {
                                                                // Handle prefix search manually
                                                                handle_prefix_search_req(
                                                                    SubscriptionId::new(sub_id),
                                                                    filter_objs,
                                                                    &state,
                                                                    &mut subscriptions,
                                                                    &tx_internal
                                                                ).await;
                                                                handled = true;
                                                            }
                                                        }
                                                        
                                                        if !handled {
                                                            warn!("Invalid message: {} - {}", e, text);
                                                            let _ = tx_internal.send(Message::Text(RelayMessage::notice(format!("Invalid message: {}", e)).as_json().into())).await;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    send_notice(&tx_internal, "invalid: empty message").await;
                                }
                            } else {
                                send_notice(&tx_internal, "invalid: message must be a JSON array").await;
                            }
                        } else {
                            send_notice(&tx_internal, "invalid: could not parse message as JSON").await;
                        }
                    }
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(e)) => {
                        warn!("WebSocket error: {}", e);
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
            Ok(event) = broadcast_rx.recv() => {
                debug!("Broadcast received event {} (kind: {}), checking {} active subscriptions", event.id, event.kind, subscriptions.len());
                // Check if event matches any subscription
                let mut sent_to = Vec::new();
                for (sub_id, filters) in &subscriptions {
                    for filter in filters {
                        if filter.match_event(&event, MatchEventOptions::new()) {
                            debug!("Event {} matches subscription {}", event.id, sub_id);
                            let _ = tx_internal.send(Message::Text(RelayMessage::event(SubscriptionId::new(sub_id), event.clone()).as_json().into())).await;
                            sent_to.push(sub_id.clone());
                            break; // Send only once per subscription
                        }
                    }
                }
                if !sent_to.is_empty() {
                    info!("Broadcast event {} to {} subscriptions: {:?}", event.id, sent_to.len(), sent_to);
                }
            }
        }
    }
    
    send_task.abort();
    heartbeat_task.abort();
}

async fn handle_client_message(
    msg: ClientMessage<'_>,
    state: &Arc<AppState>,
    subscriptions: &mut HashMap<String, Vec<Filter>>, 
    sender: &tokio::sync::mpsc::Sender<Message>,
    challenge: &str,
    auth_pubkey: &mut Option<String>,
) {
    match msg {
        ClientMessage::Event(event) => {
            handle_event(event.into_owned(), state, sender).await;
        }
        ClientMessage::Req { subscription_id, filters } => {
            let filters = filters.into_iter().map(|f| f.into_owned()).collect();
            handle_req(subscription_id.into_owned(), filters, state, subscriptions, sender).await;
        }
        ClientMessage::Close(subscription_id) => {
            subscriptions.remove(&subscription_id.to_string());
            let _ = sender.send(Message::Text(RelayMessage::closed(subscription_id.into_owned(), "Subscription closed").as_json().into())).await;
        }
        ClientMessage::Auth(event) => {
            // NIP-42: Verify Auth
            if event.kind.as_u16() != 22242 {
                let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "error: invalid kind for auth".to_string()).as_json().into())).await;
                return;
            }
            
            // Verify challenge tag
            let mut challenge_valid = false;
            for tag in event.tags.iter() {
                let t = tag.as_slice();
                if t.len() >= 2 && t[0] == "challenge" && t[1] == challenge {
                    challenge_valid = true;
                    break;
                }
            }

            if !challenge_valid {
                let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "error: invalid challenge".to_string()).as_json().into())).await;
                return;
            }

            // Verify signature
            if let Err(e) = event.verify() {
                let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, format!("error: invalid signature: {}", e)).as_json().into())).await;
                return;
            }

            *auth_pubkey = Some(event.pubkey.to_string());
            let _ = sender.send(Message::Text(RelayMessage::ok(event.id, true, "auth-success".to_string()).as_json().into())).await;
        }
        _ => {
            send_notice(sender, "unsupported: message type not supported").await;
        }
    }
}

// NIP-86: Relay Management API
async fn handle_nip86(
    val: serde_json::Value,
    state: &Arc<AppState>,
    sender: &tokio::sync::mpsc::Sender<Message>,
    auth_pubkey: &Option<String>,
) {
    let id = val.get("id");
    let method = val.get("method").and_then(|v| v.as_str());
    let params = val.get("params").and_then(|v| v.as_array());

    if id.is_none() || method.is_none() {
        send_notice(sender, "invalid: unknown message").await;
        return;
    }
    let id = id.unwrap();
    let method = method.unwrap();

    // Check Auth (Must be Admin)
    let is_admin = if let Some(pubkey) = auth_pubkey {
        let row = sqlx::query("SELECT \"isAdmin\" FROM users WHERE pubkey = $1")
            .bind(pubkey)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);
        row.map(|r| r.try_get::<bool, _>("isAdmin").unwrap_or(false)).unwrap_or(false)
    } else {
        false
    };

    if !is_admin {
        let err = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32000, "message": "Unauthorized: Admin access required" }
        });
        let _ = sender.send(Message::Text(err.to_string().into())).await;
        return;
    }

    let result = match method {
        "list_allowed_users" => {
            let rows = sqlx::query("SELECT pubkey, \"whitelistStatus\" FROM users WHERE \"whitelistStatus\" = 'ACTIVE'")
                .fetch_all(&state.db)
                .await;
            match rows {
                Ok(rows) => {
                    let users: Vec<String> = rows.iter().map(|r| r.get("pubkey")).collect();
                    Ok(serde_json::json!(users))
                }
                Err(e) => Err(format!("DB Error: {}", e))
            }
        }
        "allow_user" => {
            if let Some(p) = params.and_then(|p| p.get(0)).and_then(|v| v.as_str()) {
                let _ = sqlx::query("INSERT INTO users (id, npub, pubkey, \"whitelistStatus\") VALUES ($1, $2, $3, 'ACTIVE') ON CONFLICT (pubkey) DO UPDATE SET \"whitelistStatus\" = 'ACTIVE'")
                    .bind(nanoid::nanoid!())
                    .bind(p) // Assuming pubkey passed, not npub for simplicity in this raw API
                    .bind(p)
                    .execute(&state.db)
                    .await;
                Ok(serde_json::json!(true))
            } else {
                Err("Missing pubkey param".to_string())
            }
        }
        "ban_user" => {
            if let Some(p) = params.and_then(|p| p.get(0)).and_then(|v| v.as_str()) {
                let _ = sqlx::query("UPDATE users SET \"whitelistStatus\" = 'REVOKED' WHERE pubkey = $1")
                    .bind(p)
                    .execute(&state.db)
                    .await;
                Ok(serde_json::json!(true))
            } else {
                Err("Missing pubkey param".to_string())
            }
        }
        _ => Err("Method not found".to_string())
    };

    let response = match result {
        Ok(res) => serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": res
        }),
        Err(e) => serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": e }
        })
    };

    let _ = sender.send(Message::Text(response.to_string().into())).await;
}

// NIP-77: Negentropy
type NegSession = Negentropy<'static, NegentropyStorageVector>;

async fn handle_nip77_open(
    arr: &Vec<serde_json::Value>,
    state: &Arc<AppState>,
    sender: &tokio::sync::mpsc::Sender<Message>,
    sessions: &mut HashMap<String, NegSession>,
) {
    // Current NIP-77: ["NEG-OPEN", sub_id, filter, initial_msg].
    // Older drafts put an id size before the message: ["NEG-OPEN", sub_id, filter, id_size, initial_msg].
    let initial_msg_hex = match arr.len() {
        4 => arr[3].as_str().unwrap_or(""),
        n if n >= 5 => arr[4].as_str().unwrap_or(""),
        _ => return,
    };
    let sub_id = arr[1].as_str().unwrap_or("");
    let filter_val = &arr[2];

    if let Ok(_filter) = serde_json::from_value::<Filter>(filter_val.clone()) {
        // 1. Fetch ALL event IDs matching filter (Heavy operation!)
        // In a real impl, this needs optimized DB queries or a separate index
        let rows = sqlx::query("SELECT \"eventId\", EXTRACT(EPOCH FROM \"createdAt\")::bigint AS created_at FROM events") // Simplified: Fetch all and filter in memory for now due to complex filter mapping
            .fetch_all(&state.db)
            .await;

        if let Ok(rows) = rows {
            // Items are ordered by (created_at, id), so real timestamps are
            // needed for the ranges to line up with the client's.
            let mut storage = NegentropyStorageVector::with_capacity(rows.len());
            for row in rows {
                let eid: String = row.get("eventId");
                let created_at: i64 = row.try_get("created_at").unwrap_or(0);
                // TODO: Map Filter to SQL; for now every stored event is offered.
                if let Ok(bytes) = hex::decode(&eid) {
                    if let Ok(id) = <[u8; 32]>::try_from(bytes.as_slice()) {
                        let _ = storage.insert(created_at.max(0) as u64, Id::from_byte_array(id));
                    }
                }
            }
            if storage.seal().is_err() {
                return;
            }

            // Create Negentropy session (100 KB frame limit)
            if let Ok(mut neg) = Negentropy::owned(storage, 100_000) {
                // Process initial message
                if let Ok(query) = hex::decode(initial_msg_hex) {
                    if let Ok(response) = neg.reconcile(&query) {
                        sessions.insert(sub_id.to_string(), neg);
                        let _ = sender.send(Message::Text(serde_json::json!(["NEG-MSG", sub_id, hex::encode(response)]).to_string().into())).await;
                    }
                }
            }
        }
    }
}

async fn handle_nip77_msg(
    arr: &Vec<serde_json::Value>,
    _state: &Arc<AppState>,
    sender: &tokio::sync::mpsc::Sender<Message>,
    sessions: &mut HashMap<String, NegSession>,
) {
    if arr.len() < 3 { return; }
    let sub_id = arr[1].as_str().unwrap_or("");
    let msg_hex = arr[2].as_str().unwrap_or("");

    if let Some(neg) = sessions.get_mut(sub_id) {
        if let Ok(query) = hex::decode(msg_hex) {
            if let Ok(response) = neg.reconcile(&query) {
                let _ = sender.send(Message::Text(serde_json::json!(["NEG-MSG", sub_id, hex::encode(response)]).to_string().into())).await;
            }
        }
    }
}
fn handle_nip77_close(
    arr: &Vec<serde_json::Value>,
    sessions: &mut HashMap<String, NegSession>,
) {
    if arr.len() < 2 { return; }
    let sub_id = arr[1].as_str().unwrap_or("");
    sessions.remove(sub_id);
}

async fn send_notice(sender: &tokio::sync::mpsc::Sender<Message>, message: &str) {
    let _ = sender.send(Message::Text(RelayMessage::notice(message).as_json().into())).await;
}

// ============ Redis Cache Helpers ============

/// Check if a user is whitelisted (with Redis caching)
async fn check_whitelist_cached(state: &Arc<AppState>, pubkey: &str) -> (bool, bool) {
    let cache_key = format!("whitelist:{}", pubkey);
    
    // Try Redis cache first
    if let Some(ref redis_pool) = state.redis {
        if let Ok(mut conn) = redis_pool.get().await {
            if let Ok(cached) = conn.get::<_, Option<String>>(&cache_key).await {
                if let Some(val) = cached {
                    let parts: Vec<&str> = val.split(':').collect();
                    if parts.len() == 2 {
                        let is_admin = parts[0] == "1";
                        let is_active = parts[1] == "1";
                        debug!("Whitelist cache HIT for {}: admin={}, active={}", pubkey, is_admin, is_active);
                        return (is_admin, is_active);
                    }
                }
            }
        }
    }
    
    // Cache miss - query DB
    let row = sqlx::query(
        "SELECT \"isAdmin\", \"whitelistStatus\"::text as status FROM users WHERE pubkey = $1"
    )
    .bind(pubkey)
    .fetch_optional(&state.db)
    .await;

    let (is_admin, is_active) = match row {
        Ok(Some(row)) => {
            let admin: bool = row.try_get("isAdmin").unwrap_or(false);
            let status: Option<String> = row.try_get("status").unwrap_or(None);
            (admin, status == Some("ACTIVE".to_string()))
        }
        _ => (false, false),
    };

    // Store in Redis cache
    if let Some(ref redis_pool) = state.redis {
        if let Ok(mut conn) = redis_pool.get().await {
            let cache_val = format!("{}:{}", if is_admin { "1" } else { "0" }, if is_active { "1" } else { "0" });
            let _: Result<(), _> = conn.set_ex(&cache_key, &cache_val, CACHE_TTL_WHITELIST).await;
            debug!("Whitelist cache SET for {}: {}", pubkey, cache_val);
        }
    }

    (is_admin, is_active)
}

/// Cache an event in Redis sorted set (by timestamp)
async fn cache_event(state: &Arc<AppState>, event: &Event) {
    if let Some(ref redis_pool) = state.redis {
        if let Ok(mut conn) = redis_pool.get().await {
            let event_json = event.as_json();
            let score = event.created_at.as_secs() as f64;
            
            // Add to sorted set
            let _: Result<(), _> = conn.zadd(RECENT_EVENTS_KEY, &event_json, score).await;
            
            // Trim to keep only the most recent events (keep last MAX_CACHED_EVENTS)
            let trim_index: isize = -(MAX_CACHED_EVENTS as isize + 1);
            let _: Result<(), _> = conn.zremrangebyrank(RECENT_EVENTS_KEY, 0, trim_index).await;
            
            // Also cache by event ID for quick lookups
            let event_key = format!("event:{}", event.id);
            let _: Result<(), _> = conn.set_ex(&event_key, &event_json, CACHE_TTL_RECENT_EVENTS * 10).await;
        }
    }
}

/// Get recent events from cache matching a filter
async fn get_cached_events(state: &Arc<AppState>, filter: &Filter, limit: usize) -> Vec<Event> {
    let mut events = Vec::new();
    
    if let Some(ref redis_pool) = state.redis {
        if let Ok(mut conn) = redis_pool.get().await {
            // Get events from sorted set (most recent first) using zrevrange
            let result: Result<Vec<String>, _> = redis::cmd("ZREVRANGE")
                .arg(RECENT_EVENTS_KEY)
                .arg(0)
                .arg(limit as isize - 1)
                .query_async(&mut conn)
                .await;
            
            if let Ok(cached_events) = result {
                for event_json in cached_events {
                    if let Ok(event) = Event::from_json(&event_json) {
                        if filter.match_event(&event, MatchEventOptions::new()) {
                            events.push(event);
                        }
                    }
                }
            }
        }
    }
    
    events
}

/// Invalidate whitelist cache for a user
async fn invalidate_whitelist_cache(state: &Arc<AppState>, pubkey: &str) {
    if let Some(ref redis_pool) = state.redis {
        if let Ok(mut conn) = redis_pool.get().await {
            let cache_key = format!("whitelist:{}", pubkey);
            let _: Result<(), _> = conn.del(&cache_key).await;
        }
    }
}

// ============ End Cache Helpers ============

async fn handle_event(event: Event, state: &Arc<AppState>, sender: &tokio::sync::mpsc::Sender<Message>) {
    info!("Received EVENT from pubkey: {}, kind: {}", event.pubkey, event.kind);

    // Size and timestamp limits (advertised in NIP-11 `limitation`)
    let limits = config::check_event_size(event.as_json().len(), state.config.max_event_size).and_then(|_| {
        config::check_created_at(event.created_at.as_secs(), Timestamp::now().as_secs(), state.config.created_at_upper_limit)
    });
    if let Err(reason) = limits {
        let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, reason.to_string()).as_json().into())).await;
        return;
    }

    // 1. Verify signature
    if let Err(e) = event.verify() {
        let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, format!("Invalid signature: {}", e)).as_json().into())).await;
        return;
    }

    // NIP-40: Check Expiration
    let mut expires_at: Option<chrono::NaiveDateTime> = None;
    for tag in event.tags.iter() {
        let t = tag.as_slice();
        if t.len() >= 2 && t[0] == "expiration" {
            if let Ok(timestamp) = t[1].parse::<i64>() {
                let exp = chrono::DateTime::from_timestamp(timestamp, 0).unwrap_or_default();
                if exp < chrono::Utc::now() {
                    let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "error: event expired".to_string()).as_json().into())).await;
                    return;
                }
                expires_at = Some(exp.naive_utc());
            }
        }
    }

    // 2. Check whitelist (with Redis caching)
    let pubkey_hex = event.pubkey.to_string();
    let (is_admin, is_active) = check_whitelist_cached(state, &pubkey_hex).await;
    
    if !is_admin && !is_active {
        let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "blocked: user not whitelisted".to_string()).as_json().into())).await;
        return;
    }

    // Ephemeral kinds (20000-29999): forward to live subscribers, never store.
    if config::is_ephemeral(event.kind.as_u16()) {
        let _ = sender.send(Message::Text(RelayMessage::ok(event.id, true, "".to_string()).as_json().into())).await;
        let _ = state.tx.send(event);
        return;
    }

    // 3. Save to DB. Replaceable (0, 3, 10000-19999) and addressable
    // (30000-39999) kinds keep only the newest version (NIP-01).
    let insert_result = replaceable::store_event(&state.db, &event, expires_at, nanoid::nanoid!()).await;

    match insert_result {
        Ok(StoreOutcome::HaveNewer) => {
            debug!("Not storing superseded event {} (kind: {})", event.id, event.kind);
            let _ = sender.send(Message::Text(RelayMessage::ok(event.id, true, "duplicate: have a newer event".to_string()).as_json().into())).await;
        }
        Ok(StoreOutcome::Duplicate) => {
            let _ = sender.send(Message::Text(RelayMessage::ok(event.id, true, "duplicate: already have this event".to_string()).as_json().into())).await;
        }
        Ok(StoreOutcome::Stored { replaced }) => {
            if replaced > 0 {
                info!("Event {} (kind: {}) replaced {} older version(s)", event.id, event.kind, replaced);
            }
            let _ = sender.send(Message::Text(RelayMessage::ok(event.id, true, "".to_string()).as_json().into())).await;
            
            // Handle NIP-09: Event Deletion
            if event.kind.as_u16() == 5 {
                let pubkey = event.pubkey.to_string();
                for tag in event.tags.iter() {
                    let t = tag.as_slice();
                    if t.len() >= 2 && t[0] == "e" {
                        let target_id = &t[1];
                        // Delete the event if it belongs to the same pubkey
                        let _ = sqlx::query("DELETE FROM events WHERE \"eventId\" = $1 AND pubkey = $2")
                            .bind(target_id)
                            .bind(&pubkey)
                            .execute(&state.db)
                            .await;
                    }
                }
            }

            // Handle NIP-62: Request to Vanish
            if event.kind.as_u16() == 62 {
                let pubkey = event.pubkey.to_string();
                
                // 1. Delete all events from this pubkey
                let _ = sqlx::query("DELETE FROM events WHERE pubkey = $1")
                    .bind(&pubkey)
                    .execute(&state.db)
                    .await;
                
                // 2. Update user status to VANISHED
                let _ = sqlx::query("UPDATE users SET \"whitelistStatus\" = 'VANISHED' WHERE pubkey = $1")
                    .bind(&pubkey)
                    .execute(&state.db)
                    .await;
                
                // Invalidate whitelist cache for vanished user
                invalidate_whitelist_cache(state, &pubkey).await;
            }

            // Cache the event in Redis
            cache_event(state, &event).await;

            // Broadcast
            let _ = state.tx.send(event);
        }
        Err(e) => {
            error!("Failed to save event: {}", e);
            let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "error: internal error".to_string()).as_json().into())).await;
        }
    }
}

async fn handle_req(
    sub_id: SubscriptionId,
    filters: Vec<Filter>,
    state: &Arc<AppState>,
    subscriptions: &mut HashMap<String, Vec<Filter>>,
    sender: &tokio::sync::mpsc::Sender<Message>,
) {
    info!("Received REQ sub_id: {}, filters: {:?}", sub_id, filters);
    if !subscriptions.contains_key(&sub_id.to_string()) && subscriptions.len() >= state.config.max_subscriptions {
        let _ = sender.send(Message::Text(RelayMessage::closed(sub_id, "error: too many subscriptions").as_json().into())).await;
        return;
    }
    subscriptions.insert(sub_id.to_string(), filters.clone());

    // Push every filter (ids, authors, kinds, since/until, #tags, limit) into SQL
    let filter_maps: Vec<serde_json::Map<String, serde_json::Value>> = filters
        .iter()
        .filter_map(|f| match serde_json::to_value(f) {
            Ok(serde_json::Value::Object(m)) => Some(m),
            _ => None,
        })
        .collect();
    let mut query = build_events_query(&filter_maps, &state.config);

    debug!("Executing query: {}", query.sql());

    let rows = query.build()
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            info!("handle_req: Found {} events in DB for sub_id: {}", rows.len(), sub_id);
            let mut sent_count = 0;
            for row in rows {
                let event_id: String = row.get("eventId");
                let pubkey: String = row.get("pubkey");
                let kind: i32 = row.get("kind");
                let content: String = row.get("content");
                let tags_val: serde_json::Value = row.get("tags");
                let sig: String = row.get("sig");
                let created_at: chrono::NaiveDateTime = row.get("createdAt");
                let created_at_utc = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(created_at, chrono::Utc);

                let tags: Vec<Tag> = serde_json::from_value(tags_val).unwrap_or_default();
                
                let event_json = serde_json::json!({
                    "id": event_id,
                    "pubkey": pubkey,
                    "created_at": created_at_utc.timestamp(),
                    "kind": kind,
                    "tags": tags,
                    "content": content,
                    "sig": sig
                });
                
                if let Ok(event) = Event::from_json(&event_json.to_string()) {
                    // Check if it matches filters
                    let mut matched = false;
                    for filter in &filters {
                        if filter.match_event(&event, MatchEventOptions::new()) {
                            matched = true;
                            break;
                        }
                    }
                    
                    if matched {
                        sent_count += 1;
                        info!("handle_req: Sending event {} (kind: {}) to sub_id: {}", event_id, kind, sub_id);
                        let _ = sender.send(Message::Text(RelayMessage::event(sub_id.clone(), event).as_json().into())).await;
                    }
                }
            }
            info!("handle_req: Sent {} matching events for sub_id: {}, sending EOSE", sent_count, sub_id);
            let _ = sender.send(Message::Text(RelayMessage::eose(sub_id).as_json().into())).await;
        }
        Err(e) => {
            error!("Failed to query events: {}", e);
            let _ = sender.send(Message::Text(RelayMessage::notice(format!("Failed to query events: {}", e)).as_json().into())).await;
        }
    }
}

const EVENT_COLUMNS: &str = "\"eventId\", pubkey, kind, content, tags, sig, \"createdAt\"";

/// String values of a non-empty JSON array (non-strings dropped); None if absent or empty.
fn json_strings(val: Option<&serde_json::Value>) -> Option<Vec<String>> {
    let arr = val?.as_array()?;
    if arr.is_empty() {
        return None;
    }
    Some(arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
}

/// Build one query for all filters of a REQ. Each filter becomes its own subquery
/// (with its own ORDER BY/LIMIT) and the subqueries are UNIONed, so the result is
/// filter1 OR filter2 OR ... All values are bound parameters.
fn build_events_query(filters: &[serde_json::Map<String, serde_json::Value>], config: &RelayConfig) -> sqlx::QueryBuilder<'static, Postgres> {
    let empty = serde_json::Map::new();
    let filters: Vec<&serde_json::Map<String, serde_json::Value>> = if filters.is_empty() {
        vec![&empty]
    } else {
        filters.iter().collect()
    };

    let mut qb = sqlx::QueryBuilder::new(format!("SELECT {} FROM (", EVENT_COLUMNS));
    for (i, filter) in filters.iter().enumerate() {
        if i > 0 {
            qb.push(" UNION ");
        }
        qb.push(format!("(SELECT {} FROM events WHERE (\"expiresAt\" IS NULL OR \"expiresAt\" > NOW())", EVENT_COLUMNS));

        // ids: exact match only, so a short or invalid id matches nothing
        if let Some(ids) = json_strings(filter.get("ids")) {
            qb.push(" AND \"eventId\" = ANY(").push_bind(ids).push(")");
        }

        // authors: lowercase hex only. Full pubkeys match exactly, shorter ones as
        // prefixes (hex only, so no LIKE wildcards). If none are valid, nothing matches.
        if let Some(authors) = json_strings(filter.get("authors")) {
            let (exact, prefixes): (Vec<String>, Vec<String>) = authors
                .into_iter()
                .filter(|a| !a.is_empty() && a.len() <= 64 && a.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
                .partition(|a| a.len() == 64);
            let patterns: Vec<String> = prefixes.into_iter().map(|a| format!("{}%", a)).collect();
            qb.push(" AND (pubkey = ANY(").push_bind(exact).push(") OR pubkey LIKE ANY(").push_bind(patterns).push("))");
        }

        if let Some(kinds) = filter.get("kinds").and_then(|v| v.as_array()) {
            if !kinds.is_empty() {
                let kinds: Vec<i32> = kinds.iter().filter_map(|k| k.as_i64()).filter_map(|k| i32::try_from(k).ok()).collect();
                qb.push(" AND kind = ANY(").push_bind(kinds).push(")");
            }
        }

        // Compare "createdAt" directly (stored as UTC) so its index can be used
        if let Some(since) = filter.get("since").and_then(|v| v.as_f64()) {
            qb.push(" AND \"createdAt\" >= (to_timestamp(").push_bind(since).push(") AT TIME ZONE 'UTC')");
        }
        if let Some(until) = filter.get("until").and_then(|v| v.as_f64()) {
            qb.push(" AND \"createdAt\" <= (to_timestamp(").push_bind(until).push(") AT TIME ZONE 'UTC')");
        }

        // Single-letter tag filters (#e, #p, #a, #d, ...)
        for (key, val) in filter.iter() {
            let mut chars = key.chars();
            let letter = match (chars.next(), chars.next(), chars.next()) {
                (Some('#'), Some(c), None) if c.is_ascii_alphabetic() => c,
                _ => continue,
            };
            if let Some(values) = json_strings(Some(val)) {
                qb.push(" AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(tags) = 'array' THEN tags ELSE '[]'::jsonb END) AS t WHERE t->>0 = ")
                    .push_bind(letter.to_string())
                    .push(" AND t->>1 = ANY(")
                    .push_bind(values)
                    .push("))");
            }
        }

        let limit = config.clamp_limit(filter.get("limit").and_then(|v| v.as_u64()).map(|n| n as usize)) as i64;
        qb.push(" ORDER BY \"createdAt\" DESC LIMIT ").push_bind(limit).push(")");
    }
    qb.push(") AS matched ORDER BY \"createdAt\" DESC");
    qb
}

// Handle REQ with prefix searches (short author pubkeys)
async fn handle_prefix_search_req(
    sub_id: SubscriptionId,
    filters: Vec<serde_json::Map<String, serde_json::Value>>,
    state: &Arc<AppState>,
    subscriptions: &mut HashMap<String, Vec<Filter>>,
    sender: &tokio::sync::mpsc::Sender<Message>,
) {
    info!("Received REQ with potential prefix search, sub_id: {}", sub_id);
    
    let mut query = build_events_query(&filters, &state.config);

    debug!("Prefix search query: {}", query.sql());

    // Execute query
    let rows = query.build().fetch_all(&state.db).await;
    
    match rows {
        Ok(rows) => {
            info!("Found {} events for prefix search sub_id: {}", rows.len(), sub_id);
            let mut sent_count = 0;
            
            for row in rows {
                let event_id: String = row.get("eventId");
                let pubkey: String = row.get("pubkey");
                let kind: i32 = row.get("kind");
                let content: String = row.get("content");
                let tags_val: serde_json::Value = row.get("tags");
                let sig: String = row.get("sig");
                let created_at: chrono::NaiveDateTime = row.get("createdAt");
                let created_at_utc = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(created_at, chrono::Utc);

                let tags: Vec<Tag> = serde_json::from_value(tags_val).unwrap_or_default();
                
                let event_json = serde_json::json!({
                    "id": event_id,
                    "pubkey": pubkey,
                    "created_at": created_at_utc.timestamp(),
                    "kind": kind,
                    "tags": tags,
                    "content": content,
                    "sig": sig
                });
                
                if let Ok(event) = Event::from_json(&event_json.to_string()) {
                    sent_count += 1;
                    let _ = sender.send(Message::Text(RelayMessage::event(sub_id.clone(), event).as_json().into())).await;
                }
            }
            
            info!("Sent {} events for prefix search sub_id: {}, sending EOSE", sent_count, sub_id);
            let _ = sender.send(Message::Text(RelayMessage::eose(sub_id).as_json().into())).await;
        }
        Err(e) => {
            error!("Prefix search query failed: {}", e);
            let _ = sender.send(Message::Text(RelayMessage::notice("Query error").as_json().into())).await;
        }
    }
}


/// End-to-end tests over a real websocket. Tests marked "no DB" run anywhere;
/// the rest are skipped unless TEST_DATABASE_URL is set (scripts/test-relay-db.sh).
#[cfg(test)]
mod e2e_tests {
    use super::*;
    use std::collections::HashMap;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage, MaybeTlsStream, WebSocketStream};

    type Ws = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

    fn test_config(vars: &[(&str, &str)]) -> RelayConfig {
        let m: HashMap<String, String> = vars.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        RelayConfig::from_lookup(|k| m.get(k).cloned())
    }

    /// Start a relay on a random port. With `need_db`, returns None when
    /// TEST_DATABASE_URL is not set; otherwise uses a pool that never connects.
    async fn start(config: RelayConfig, need_db: bool) -> Option<(SocketAddr, Pool<Postgres>)> {
        let db = match std::env::var("TEST_DATABASE_URL") {
            Ok(url) => PgPoolOptions::new().max_connections(10).connect(&url).await.expect("connect TEST_DATABASE_URL"),
            Err(_) if need_db => return None,
            Err(_) => PgPoolOptions::new()
                .acquire_timeout(Duration::from_millis(200))
                .connect_lazy("postgres://none:none@127.0.0.1:1/none")
                .unwrap(),
        };
        let (tx, _rx) = broadcast::channel(1000);
        let state = Arc::new(AppState {
            db: db.clone(),
            tx,
            redis: None,
            connections: Arc::new(AtomicUsize::new(0)),
            started_at: Instant::now(),
            config,
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, relay_router(state)).await.unwrap() });
        Some((addr, db))
    }

    /// Connect and return the socket plus the NIP-42 challenge.
    async fn connect(addr: SocketAddr) -> (Ws, String) {
        let (mut ws, _) = connect_async(format!("ws://{}/", addr)).await.unwrap();
        let auth = recv(&mut ws).await.expect("AUTH challenge");
        assert_eq!(auth[0], "AUTH");
        let challenge = auth[1].as_str().unwrap().to_string();
        (ws, challenge)
    }

    /// Next JSON text message (None on close/error/timeout).
    async fn recv(ws: &mut Ws) -> Option<serde_json::Value> {
        loop {
            match tokio::time::timeout(Duration::from_secs(5), ws.next()).await {
                Ok(Some(Ok(WsMessage::Text(t)))) => return serde_json::from_str(t.as_str()).ok(),
                Ok(Some(Ok(WsMessage::Ping(_) | WsMessage::Pong(_)))) => continue,
                _ => return None,
            }
        }
    }

    /// Read until a message matches `pred`.
    async fn recv_until(ws: &mut Ws, pred: impl Fn(&serde_json::Value) -> bool) -> serde_json::Value {
        loop {
            let m = recv(ws).await.expect("expected message before timeout/close");
            if pred(&m) {
                return m;
            }
        }
    }

    async fn send(ws: &mut Ws, v: serde_json::Value) {
        ws.send(WsMessage::Text(v.to_string().into())).await.unwrap();
    }

    async fn send_raw(ws: &mut Ws, s: &str) {
        ws.send(WsMessage::Text(s.to_string().into())).await.unwrap();
    }

    /// Publish and return the OK message for it.
    async fn publish(ws: &mut Ws, e: &Event) -> (bool, String) {
        send(ws, serde_json::json!(["EVENT", e])).await;
        let id = e.id.to_hex();
        let ok = recv_until(ws, |m| m[0] == "OK" && m[1] == id.as_str()).await;
        (ok[2].as_bool().unwrap(), ok[3].as_str().unwrap().to_string())
    }

    /// Send a REQ and collect events until EOSE.
    async fn req(ws: &mut Ws, sub: &str, filter: serde_json::Value) -> Vec<serde_json::Value> {
        send(ws, serde_json::json!(["REQ", sub, filter])).await;
        let mut events = Vec::new();
        loop {
            let m = recv(ws).await.expect("EOSE");
            if m[0] == "EOSE" && m[1] == sub {
                return events;
            }
            if m[0] == "EVENT" && m[1] == sub {
                events.push(m[2].clone());
            }
        }
    }

    fn ev(keys: &Keys, kind: u16, created_at: u64, content: &str, tags: Vec<Tag>) -> Event {
        EventBuilder::new(Kind::from(kind), content)
            .tags(tags)
            .custom_created_at(Timestamp::from(created_at))
            .finalize(keys)
            .unwrap()
    }

    fn now() -> u64 {
        Timestamp::now().as_secs()
    }

    async fn whitelisted(db: &Pool<Postgres>) -> Keys {
        let keys = Keys::generate();
        sqlx::query("INSERT INTO users (id, npub, pubkey, \"updatedAt\", \"whitelistStatus\") VALUES ($1, $2, $2, NOW(), 'ACTIVE')")
            .bind(nanoid::nanoid!())
            .bind(keys.public_key().to_hex())
            .execute(db)
            .await
            .unwrap();
        keys
    }

    async fn count_rows(db: &Pool<Postgres>, keys: &Keys, kind: u16) -> i64 {
        sqlx::query("SELECT count(*) AS n FROM events WHERE pubkey = $1 AND kind = $2")
            .bind(keys.public_key().to_hex())
            .bind(kind as i32)
            .fetch_one(db)
            .await
            .unwrap()
            .get("n")
    }

    // ---------- no DB ----------

    #[tokio::test]
    async fn nip11_document_reflects_config() {
        let cfg = test_config(&[("MAX_SUBSCRIPTIONS_PER_CONNECTION", "7")]);
        let (addr, _) = start(cfg.clone(), false).await.unwrap();
        let mut s = tokio::net::TcpStream::connect(addr).await.unwrap();
        s.write_all(b"GET / HTTP/1.1\r\nHost: relay\r\nAccept: application/nostr+json\r\nConnection: close\r\n\r\n").await.unwrap();
        let mut resp = String::new();
        s.read_to_string(&mut resp).await.unwrap();
        let body = &resp[resp.find("\r\n\r\n").unwrap() + 4..];
        let info: serde_json::Value = serde_json::from_str(body).unwrap();
        assert_eq!(info["pubkey"], "8dc8688200b447ec2e4018ea5e42dc5d480940cb3f19ca8f361d28179dc4ba5e");
        assert_eq!(info["contact"], "https://relay.pleb.one");
        assert_eq!(info["icon"], "https://relay.pleb.one/android-chrome-512x512.png");
        assert_eq!(info["limitation"]["max_subscriptions"], 7);
        assert_eq!(info["limitation"]["max_message_length"], cfg.max_message_length);
        assert_eq!(info["limitation"]["max_limit"], cfg.max_limit);
        assert_eq!(info["limitation"]["created_at_upper_limit"], 900);
        assert_eq!(info["limitation"]["auth_required"], false);
        assert_eq!(info["limitation"]["restricted_writes"], true);
    }

    #[tokio::test]
    async fn invalid_and_unknown_messages_get_notice() {
        let (addr, _) = start(RelayConfig::default(), false).await.unwrap();
        let (mut ws, _) = connect(addr).await;
        for raw in ["not json", "{bad", "42", "\"str\"", "[]", "[\"FOO\", 1]", "{\"hello\": 1}", "[\"COUNT\", \"c\", {}]"] {
            send_raw(&mut ws, raw).await;
            let m = recv(&mut ws).await.unwrap_or_else(|| panic!("no reply to {}", raw));
            assert_eq!(m[0], "NOTICE", "reply to {}: {}", raw, m);
        }
    }

    #[tokio::test]
    async fn rejects_future_created_at() {
        let (addr, _) = start(RelayConfig::default(), false).await.unwrap();
        let (mut ws, _) = connect(addr).await;
        let k = Keys::generate();
        let e = ev(&k, 1, now() + 901 + 60, "from the future", vec![]);
        assert_eq!(publish(&mut ws, &e).await, (false, "invalid: created_at too far in the future".to_string()));
    }

    #[tokio::test]
    async fn rejects_oversized_event_and_message() {
        let cfg = test_config(&[("MAX_EVENT_SIZE", "2000")]); // message cap 4000
        let (addr, _) = start(cfg, false).await.unwrap();
        let (mut ws, _) = connect(addr).await;
        let k = Keys::generate();
        let big = ev(&k, 1, now(), &"x".repeat(2500), vec![]);
        assert_eq!(publish(&mut ws, &big).await, (false, "invalid: event too large".to_string()));
        // Over the websocket cap: the connection is dropped.
        send_raw(&mut ws, &format!("[\"NOTICE\",\"{}\"]", "y".repeat(5000))).await;
        assert!(recv(&mut ws).await.is_none());
    }

    #[tokio::test]
    async fn nip42_auth_unchanged() {
        let (addr, _) = start(RelayConfig::default(), false).await.unwrap();
        let (mut ws, challenge) = connect(addr).await;
        let k = Keys::generate();
        let bad = ev(&k, 22242, now(), "", vec![Tag::parse(vec!["challenge", "wrong"]).unwrap()]);
        send(&mut ws, serde_json::json!(["AUTH", bad])).await;
        let m = recv(&mut ws).await.unwrap();
        assert_eq!((m[0].as_str(), m[2].as_bool(), m[3].as_str()), (Some("OK"), Some(false), Some("error: invalid challenge")));
        let good = ev(&k, 22242, now(), "", vec![Tag::parse(vec!["challenge", challenge.as_str()]).unwrap()]);
        send(&mut ws, serde_json::json!(["AUTH", good])).await;
        let m = recv(&mut ws).await.unwrap();
        assert_eq!((m[2].as_bool(), m[3].as_str()), (Some(true), Some("auth-success")));
    }

    // ---------- DB ----------

    #[tokio::test]
    async fn db_whitelist_unchanged() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let (mut ws, _) = connect(addr).await;
        let stranger = Keys::generate();
        assert_eq!(publish(&mut ws, &ev(&stranger, 1, now(), "hi", vec![])).await, (false, "blocked: user not whitelisted".to_string()));
        let k = whitelisted(&db).await;
        assert_eq!(publish(&mut ws, &ev(&k, 1, now(), "hi", vec![])).await, (true, String::new()));
    }

    #[tokio::test]
    async fn db_ephemeral_forwarded_not_stored() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut sub, _) = connect(addr).await;
        let (mut pubr, _) = connect(addr).await;
        let author = k.public_key().to_hex();
        assert!(req(&mut sub, "eph", serde_json::json!({"kinds": [20001], "authors": [author]})).await.is_empty());
        let e = ev(&k, 20001, now(), "ephemeral", vec![]);
        assert_eq!(publish(&mut pubr, &e).await, (true, String::new()));
        let got = recv_until(&mut sub, |m| m[0] == "EVENT").await;
        assert_eq!(got[2]["id"], e.id.to_hex());
        assert_eq!(count_rows(&db, &k, 20001).await, 0);
        // A later REQ does not return it.
        assert!(req(&mut sub, "eph2", serde_json::json!({"kinds": [20001], "authors": [author]})).await.is_empty());
    }

    #[tokio::test]
    async fn db_replaceable_qa_cases() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut ws, _) = connect(addr).await;
        let t = now();
        // QA first pass: four kind 0 versions, REQ returns one.
        let mut newest = None;
        for i in 0..4 {
            let e = ev(&k, 0, t - 100 + i, &format!("v{}", i), vec![]);
            assert_eq!(publish(&mut ws, &e).await, (true, String::new()));
            newest = Some(e);
        }
        let newest = newest.unwrap();
        let filter = serde_json::json!({"kinds": [0], "authors": [k.public_key().to_hex()]});
        let got = req(&mut ws, "k0", filter.clone()).await;
        assert_eq!(got.len(), 1);
        assert_eq!(got[0]["id"], newest.id.to_hex());
        // QA second pass: a kind 0 a day older than the stored newest is not stored.
        let old = ev(&k, 0, newest.created_at.as_secs() - 86_400, "a day old", vec![]);
        assert_eq!(publish(&mut ws, &old).await, (true, "duplicate: have a newer event".to_string()));
        let got = req(&mut ws, "k0b", filter).await;
        assert_eq!(got.len(), 1);
        assert_eq!(got[0]["id"], newest.id.to_hex());
    }

    #[tokio::test]
    async fn db_addressable_replacement_unchanged() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut ws, _) = connect(addr).await;
        let t = now() - 100;
        for e in [
            ev(&k, 30023, t, "a1", vec![Tag::identifier("a")]),
            ev(&k, 30023, t, "b1", vec![Tag::identifier("b")]),
            ev(&k, 30023, t + 1, "a2", vec![Tag::identifier("a")]),
        ] {
            assert_eq!(publish(&mut ws, &e).await, (true, String::new()));
        }
        let got = req(&mut ws, "addr", serde_json::json!({"kinds": [30023], "authors": [k.public_key().to_hex()]})).await;
        let mut contents: Vec<&str> = got.iter().map(|e| e["content"].as_str().unwrap()).collect();
        contents.sort();
        assert_eq!(contents, vec!["a2", "b1"]);
    }

    #[tokio::test]
    async fn db_nip40_expiration_unchanged() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut ws, _) = connect(addr).await;
        let expired = ev(&k, 1, now(), "gone", vec![Tag::parse(vec!["expiration".to_string(), (now() - 10).to_string()]).unwrap()]);
        assert_eq!(publish(&mut ws, &expired).await, (false, "error: event expired".to_string()));
        let later = ev(&k, 1, now(), "later", vec![Tag::parse(vec!["expiration".to_string(), (now() + 3600).to_string()]).unwrap()]);
        assert_eq!(publish(&mut ws, &later).await, (true, String::new()));
        let row = sqlx::query("SELECT \"expiresAt\" IS NOT NULL AS has FROM events WHERE \"eventId\" = $1")
            .bind(later.id.to_hex())
            .fetch_one(&db)
            .await
            .unwrap();
        assert!(row.get::<bool, _>("has"));
    }

    #[tokio::test]
    async fn db_nip09_deletion_unchanged() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut ws, _) = connect(addr).await;
        let note = ev(&k, 1, now(), "delete me", vec![]);
        assert_eq!(publish(&mut ws, &note).await, (true, String::new()));
        assert_eq!(count_rows(&db, &k, 1).await, 1);
        let del = ev(&k, 5, now(), "", vec![Tag::parse(vec!["e".to_string(), note.id.to_hex()]).unwrap()]);
        assert_eq!(publish(&mut ws, &del).await, (true, String::new()));
        assert_eq!(count_rows(&db, &k, 1).await, 0);
        assert_eq!(count_rows(&db, &k, 5).await, 1);
    }

    #[tokio::test]
    async fn db_max_subscriptions_enforced() {
        let cfg = test_config(&[("MAX_SUBSCRIPTIONS_PER_CONNECTION", "2")]);
        let Some((addr, _db)) = start(cfg, true).await else { return };
        let (mut ws, _) = connect(addr).await;
        let f = serde_json::json!({"kinds": [1], "limit": 1});
        req(&mut ws, "s1", f.clone()).await;
        req(&mut ws, "s2", f.clone()).await;
        // Re-using an open id is fine.
        req(&mut ws, "s1", f.clone()).await;
        send(&mut ws, serde_json::json!(["REQ", "s3", f])).await;
        let m = recv_until(&mut ws, |m| m[1] == "s3").await;
        assert_eq!((m[0].as_str(), m[2].as_str()), (Some("CLOSED"), Some("error: too many subscriptions")));
    }

    /// Publish more than the default limit of old events, oldest first. Event 1
    /// carries an `e` tag pointing at the returned target id.
    async fn seed_old_events(ws: &mut Ws, k: &Keys) -> (Vec<Event>, String) {
        let target = Keys::generate().public_key().to_hex(); // any unique 64-char hex
        let base = now() - 100_000;
        let mut events = Vec::new();
        for i in 0..(config::DEFAULT_LIMIT as u64 + 50) {
            let tags = if i == 1 { vec![Tag::parse(vec!["e".to_string(), target.clone()]).unwrap()] } else { vec![] };
            let e = ev(k, 1, base + i, &format!("old note {}", i), tags);
            assert_eq!(publish(ws, &e).await, (true, String::new()));
            events.push(e);
        }
        (events, target)
    }

    fn ids(events: &[serde_json::Value]) -> Vec<String> {
        events.iter().map(|e| e["id"].as_str().unwrap().to_string()).collect()
    }

    #[tokio::test]
    async fn db_req_by_id_finds_event_older_than_default_limit() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut ws, _) = connect(addr).await;
        let (events, _) = seed_old_events(&mut ws, &k).await;
        let got = req(&mut ws, "byid", serde_json::json!({"ids": [events[0].id.to_hex()]})).await;
        assert_eq!(ids(&got), vec![events[0].id.to_hex()]);
    }

    #[tokio::test]
    async fn db_req_by_e_tag_finds_old_event() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut ws, _) = connect(addr).await;
        let (events, target) = seed_old_events(&mut ws, &k).await;
        let got = req(&mut ws, "bytag", serde_json::json!({"#e": [target]})).await;
        assert_eq!(ids(&got), vec![events[1].id.to_hex()]);
    }

    #[tokio::test]
    async fn db_req_uses_all_filters() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut ws, _) = connect(addr).await;
        let (events, _) = seed_old_events(&mut ws, &k).await;
        send(&mut ws, serde_json::json!(["REQ", "multi", {"ids": [events[0].id.to_hex()]}, {"ids": [events[2].id.to_hex()]}])).await;
        let mut got = Vec::new();
        loop {
            let m = recv(&mut ws).await.expect("EOSE");
            if m[0] == "EOSE" { break; }
            if m[0] == "EVENT" { got.push(m[2].clone()); }
        }
        // Newest first
        assert_eq!(ids(&got), vec![events[2].id.to_hex(), events[0].id.to_hex()]);
    }

    #[tokio::test]
    async fn db_short_or_invalid_id_matches_nothing() {
        let Some((addr, db)) = start(RelayConfig::default(), true).await else { return };
        let k = whitelisted(&db).await;
        let (mut ws, _) = connect(addr).await;
        let e = ev(&k, 1, now(), "findable", vec![]);
        assert_eq!(publish(&mut ws, &e).await, (true, String::new()));
        let prefix = e.id.to_hex()[..8].to_string();
        for (i, bad) in [prefix.as_str(), "not-hex", "' OR 1=1 --"].into_iter().enumerate() {
            let got = req(&mut ws, &format!("bad{}", i), serde_json::json!({"ids": [bad]})).await;
            assert!(got.is_empty(), "id {:?} should match nothing, got {} events", bad, got.len());
        }
    }
}
