use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::HeaderMap,
    response::{IntoResponse, Response, Json},
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use nostr::{ClientMessage, Event, Filter, RelayMessage, SubscriptionId, JsonUtil, Tag, Keys, EventBuilder, Timestamp, Kind};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres, Row};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc},
    time::Duration,
};
use tokio::sync::broadcast;
use tracing::{error, info, warn, debug};
use negentropy::{Bytes, Negentropy};

#[derive(Clone)]
struct AppState {
    db: Pool<Postgres>,
    tx: broadcast::Sender<Event>,
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

    let (tx, _rx) = broadcast::channel(100);

    let state = Arc::new(AppState { db: pool, tx });

    // NIP-66: Relay Monitor Task
    let monitor_state = state.clone();
    tokio::spawn(async move {
        let keys = Keys::generate(); // Ephemeral relay keys for now
        let pubkey = keys.public_key();
        info!("Relay Pubkey for NIP-66: {}", pubkey);

        loop {
            // Build Kind 30166 Event
            let tags = vec![
                Tag::Identifier("nrelay".to_string()),
                Tag::parse(vec!["url", "wss://relay.pleb.one"]).unwrap(),
                Tag::parse(vec!["software", "relay-rs"]).unwrap(),
                Tag::parse(vec!["version", "0.1.0"]).unwrap(),
                Tag::parse(vec!["supported_nips", "1", "9", "11", "15", "17", "20", "23", "33", "40", "42", "51", "56", "62", "65", "66", "77", "86"]).unwrap(),
            ];

            let event_builder = EventBuilder::new(
                Kind::from(30166),
                "",
                tags,
            );
            
            if let Ok(event) = event_builder.to_event(&keys) {
                // Save to DB (Upsert)
                let tags_json = serde_json::to_value(&event.tags).unwrap_or(serde_json::Value::Null);
                let created_at = chrono::DateTime::from_timestamp(event.created_at.as_u64() as i64, 0)
                    .unwrap_or_default()
                    .naive_utc()
                    .and_utc();

                // We use a simplified insert here. In a real NIP-66, we might want to replace the previous one.
                // Since it's addressable (30166), we should handle replacement logic, but our DB schema is append-only-ish with "ON CONFLICT DO NOTHING" for ID.
                // For 30166, we should probably delete old ones from this pubkey+d tag or just let them pile up (not ideal).
                // For this MVP, we'll just insert it.
                
                let _ = sqlx::query(
                    "INSERT INTO events (id, \"eventId\", pubkey, kind, content, tags, sig, \"createdAt\", \"receivedAt\") 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                     ON CONFLICT (\"eventId\") DO NOTHING"
                )
                .bind(nanoid::nanoid!())
                .bind(event.id.to_string())
                .bind(event.pubkey.to_string())
                .bind(event.kind.as_u64() as i32)
                .bind(&event.content)
                .bind(tags_json)
                .bind(event.sig.to_string())
                .bind(created_at)
                .execute(&monitor_state.db)
                .await;

                // Broadcast
                let _ = monitor_state.tx.send(event);
            }

            tokio::time::sleep(Duration::from_secs(3600)).await; // Publish every hour
        }
    });

    let app = Router::new()
        .route("/", get(handler))
        .with_state(state);

    let port = std::env::var("RELAY_PORT").unwrap_or_else(|_| "3001".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();

    info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn handler(
    ws: Option<WebSocketUpgrade>,
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
) -> Response {
    if let Some(ws) = ws {
        return ws.on_upgrade(|socket| handle_socket(socket, state)).into_response();
    }

    if let Some(accept) = headers.get("accept") {
        if accept.to_str().unwrap_or("").contains("application/nostr+json") {
            return Json(serde_json::json!({
                "name": "Relay Pleb One",
                "description": "A Rust-based Nostr Relay",
                "supported_nips": [1, 9, 11, 15, 17, 20, 23, 33, 40, 42, 51, 56, 62, 65, 66, 77, 86],
                "software": "relay-rs",
                "version": "0.1.0"
            })).into_response();
        }
    }

    "Welcome to Relay Pleb One (Rust Edition)".into_response()
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
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
            if tx_ping.send(Message::Ping(vec![])).await.is_err() {
                break;
            }
        }
    });

    // NIP-42: Send AUTH challenge
    let challenge = nanoid::nanoid!();
    let _ = tx_internal.send(Message::Text(RelayMessage::auth(challenge.clone()).as_json())).await;

    let mut auth_pubkey: Option<String> = None;
    let mut negentropy_sessions: HashMap<String, Negentropy> = HashMap::new();

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
                                            match ClientMessage::from_json(&text) {
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
                                                            if let (Some(sub_id), Some(filter_obj)) = (arr[1].as_str(), arr[2].as_object()) {
                                                                // Handle prefix search manually
                                                                handle_prefix_search_req(
                                                                    SubscriptionId::new(sub_id),
                                                                    filter_obj.clone(),
                                                                    &state,
                                                                    &mut subscriptions,
                                                                    &tx_internal
                                                                ).await;
                                                                handled = true;
                                                            }
                                                        }
                                                        
                                                        if !handled {
                                                            warn!("Invalid message: {} - {}", e, text);
                                                            let _ = tx_internal.send(Message::Text(RelayMessage::notice(format!("Invalid message: {}", e)).as_json())).await;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
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
                        if filter.match_event(&event) {
                            debug!("Event {} matches subscription {}", event.id, sub_id);
                            let _ = tx_internal.send(Message::Text(RelayMessage::event(SubscriptionId::new(sub_id), event.clone()).as_json())).await;
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
    msg: ClientMessage,
    state: &Arc<AppState>,
    subscriptions: &mut HashMap<String, Vec<Filter>>, 
    sender: &tokio::sync::mpsc::Sender<Message>,
    challenge: &str,
    auth_pubkey: &mut Option<String>,
) {
    match msg {
        ClientMessage::Event(event) => {
            handle_event(*event, state, sender).await;
        }
        ClientMessage::Req { subscription_id, filters } => {
            handle_req(subscription_id, filters, state, subscriptions, sender).await;
        }
        ClientMessage::Close(subscription_id) => {
            subscriptions.remove(&subscription_id.to_string());
            let _ = sender.send(Message::Text(RelayMessage::closed(subscription_id, "Subscription closed").as_json())).await;
        }
        ClientMessage::Auth(event) => {
            // NIP-42: Verify Auth
            if event.kind.as_u64() != 22242 {
                let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "error: invalid kind for auth".to_string()).as_json())).await;
                return;
            }
            
            // Verify challenge tag
            let mut challenge_valid = false;
            for tag in &event.tags {
                let t = tag.as_vec();
                if t.len() >= 2 && t[0] == "challenge" && t[1] == challenge {
                    challenge_valid = true;
                    break;
                }
            }

            if !challenge_valid {
                let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "error: invalid challenge".to_string()).as_json())).await;
                return;
            }

            // Verify signature
            if let Err(e) = event.verify() {
                let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, format!("error: invalid signature: {}", e)).as_json())).await;
                return;
            }

            *auth_pubkey = Some(event.pubkey.to_string());
            let _ = sender.send(Message::Text(RelayMessage::ok(event.id, true, "auth-success".to_string()).as_json())).await;
        }
        _ => {
            // Other messages
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
        let _ = sender.send(Message::Text(err.to_string())).await;
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

    let _ = sender.send(Message::Text(response.to_string())).await;
}

// NIP-77: Negentropy
async fn handle_nip77_open(
    arr: &Vec<serde_json::Value>,
    state: &Arc<AppState>,
    sender: &tokio::sync::mpsc::Sender<Message>,
    sessions: &mut HashMap<String, Negentropy>,
) {
    if arr.len() < 5 { return; }
    let sub_id = arr[1].as_str().unwrap_or("");
    let filter_val = &arr[2];
    let _id_len = arr[3].as_u64().unwrap_or(32) as u8; // Not used in this simple impl
    let initial_msg_hex = arr[4].as_str().unwrap_or("");

    if let Ok(_filter) = serde_json::from_value::<Filter>(filter_val.clone()) {
        // 1. Fetch ALL event IDs matching filter (Heavy operation!)
        // In a real impl, this needs optimized DB queries or a separate index
        let rows = sqlx::query("SELECT \"eventId\" FROM events") // Simplified: Fetch all and filter in memory for now due to complex filter mapping
            .fetch_all(&state.db)
            .await;
        
        if let Ok(rows) = rows {
            // Create Negentropy session
            if let Ok(mut neg) = Negentropy::new(32, Some(100_000)) { // 32 byte ID
                for row in rows {
                    let eid: String = row.get("eventId");
                    // We need to check if this event matches the filter. 
                    // Since we don't have the full event here, we should ideally query with WHERE clauses.
                    // For this implementation, we'll assume the DB query handles it (TODO: Map Filter to SQL)
                    // For now, let's just add them all to test the protocol flow
                    if let Ok(bytes) = hex::decode(&eid) {
                         let id_bytes = Bytes::from_slice(&bytes);
                         let _ = neg.add_item(0, id_bytes);
                    }
                }
                
                let _ = neg.seal();
                
                // Process initial message
                if let Ok(msg_bytes) = hex::decode(initial_msg_hex) {
                    let query = Bytes::from_slice(&msg_bytes);
                    if let Ok(response) = neg.reconcile(&query) {
                        sessions.insert(sub_id.to_string(), neg);
                        let _ = sender.send(Message::Text(serde_json::json!(["NEG-MSG", sub_id, response.to_hex()]).to_string())).await;
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
    sessions: &mut HashMap<String, Negentropy>,
) {
    if arr.len() < 3 { return; }
    let sub_id = arr[1].as_str().unwrap_or("");
    let msg_hex = arr[2].as_str().unwrap_or("");

    if let Some(neg) = sessions.get_mut(sub_id) {
        if let Ok(msg_bytes) = hex::decode(msg_hex) {
            let query = Bytes::from_slice(&msg_bytes);
            if let Ok(response) = neg.reconcile(&query) {
                let _ = sender.send(Message::Text(serde_json::json!(["NEG-MSG", sub_id, response.to_hex()]).to_string())).await;
            }
        }
    }
}
async fn handle_nip77_close(
    arr: &Vec<serde_json::Value>,
    sessions: &mut HashMap<String, Negentropy>,
) {
    if arr.len() < 2 { return; }
    let sub_id = arr[1].as_str().unwrap_or("");
    sessions.remove(sub_id);
}

async fn handle_event(event: Event, state: &Arc<AppState>, sender: &tokio::sync::mpsc::Sender<Message>) {
    info!("Received EVENT from pubkey: {}, kind: {}", event.pubkey, event.kind);
    
    // 1. Verify signature
    if let Err(e) = event.verify() {
        let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, format!("Invalid signature: {}", e)).as_json())).await;
        return;
    }

    // NIP-40: Check Expiration
    let mut expires_at: Option<chrono::NaiveDateTime> = None;
    for tag in &event.tags {
        let t = tag.as_vec();
        if t.len() >= 2 && t[0] == "expiration" {
            if let Ok(timestamp) = t[1].parse::<i64>() {
                let exp = chrono::DateTime::from_timestamp(timestamp, 0).unwrap_or_default();
                if exp < chrono::Utc::now() {
                    let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "error: event expired".to_string()).as_json())).await;
                    return;
                }
                expires_at = Some(exp.naive_utc());
            }
        }
    }

    // 2. Check whitelist (User table)
    let pubkey_hex = event.pubkey.to_string();
    
    // Use sqlx::query instead of macro to avoid compile-time DB check
    let row = sqlx::query(
        "SELECT \"isAdmin\", \"whitelistStatus\"::text as status FROM users WHERE pubkey = $1"
    )
    .bind(&pubkey_hex)
    .fetch_optional(&state.db)
    .await;

    let authorized = match row {
        Ok(Some(row)) => {
            let is_admin: bool = row.try_get("isAdmin").unwrap_or(false);
            let status: Option<String> = row.try_get("status").unwrap_or(None);
            is_admin || status == Some("ACTIVE".to_string())
        }
        Ok(None) => false,
        Err(e) => {
            error!("Database error: {}", e);
            false
        }
    };

    if !authorized {
        let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "blocked: user not whitelisted".to_string()).as_json())).await;
        return;
    }

    // 3. Handle addressable/replaceable events (NIP-33: kinds 30000-39999)
    let kind_num = event.kind.as_u64();
    if kind_num >= 30000 && kind_num < 40000 {
        // Extract d-tag for addressable events
        let d_tag = event.tags.iter()
            .find(|t| {
                let v = t.as_vec();
                v.len() >= 1 && v[0] == "d"
            })
            .map(|t| t.as_vec().get(1).cloned().unwrap_or_default())
            .unwrap_or_default();
        
        // Delete older events with same pubkey + kind + d-tag
        let _ = sqlx::query(
            "DELETE FROM events WHERE pubkey = $1 AND kind = $2 AND 
             EXISTS (SELECT 1 FROM jsonb_array_elements(tags) AS t 
                     WHERE t->>0 = 'd' AND (t->>1 = $3 OR ($3 = '' AND (t->>1 IS NULL OR t->>1 = ''))))"
        )
        .bind(event.pubkey.to_string())
        .bind(kind_num as i32)
        .bind(&d_tag)
        .execute(&state.db)
        .await;
        
        info!("Addressable event kind {} with d-tag '{}' - replaced previous version", kind_num, d_tag);
    }

    // 4. Save to DB
    let tags_json = serde_json::to_value(&event.tags).unwrap_or(serde_json::Value::Null);
    let created_at = chrono::DateTime::from_timestamp(event.created_at.as_u64() as i64, 0)
        .unwrap_or_default()
        .naive_utc()
        .and_utc();

    let insert_result = sqlx::query(
        "INSERT INTO events (id, \"eventId\", pubkey, kind, content, tags, sig, \"createdAt\", \"receivedAt\", \"expiresAt\") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
         ON CONFLICT (\"eventId\") DO NOTHING"
    )
    .bind(nanoid::nanoid!())
    .bind(event.id.to_string())
    .bind(event.pubkey.to_string())
    .bind(event.kind.as_u64() as i32)
    .bind(&event.content)
    .bind(tags_json)
    .bind(event.sig.to_string())
    .bind(created_at)
    .bind(expires_at)
    .execute(&state.db)
    .await;

    match insert_result {
        Ok(_) => {
            let _ = sender.send(Message::Text(RelayMessage::ok(event.id, true, "".to_string()).as_json())).await;
            
            // Handle NIP-09: Event Deletion
            if event.kind.as_u64() == 5 {
                let pubkey = event.pubkey.to_string();
                for tag in &event.tags {
                    let t = tag.as_vec();
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
            if event.kind.as_u64() == 62 {
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
            }

            // Broadcast
            let _ = state.tx.send(event);
        }
        Err(e) => {
            error!("Failed to save event: {}", e);
            let _ = sender.send(Message::Text(RelayMessage::ok(event.id, false, "error: internal error".to_string()).as_json())).await;
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
    subscriptions.insert(sub_id.to_string(), filters.clone());

    // Build SQL query based on filters
    let mut sql = String::from("SELECT \"eventId\", pubkey, kind, content, tags, sig, \"createdAt\" FROM events WHERE (\"expiresAt\" IS NULL OR \"expiresAt\" > NOW())");
    let mut params: Vec<String> = Vec::new();
    let mut param_count = 1;
    
    // Take the first filter (most clients send one filter per REQ)
    if let Some(filter) = filters.first() {
        // Filter by kinds
        if let Some(kinds) = &filter.kinds {
            let kind_list: Vec<String> = kinds.iter().map(|k| k.as_u64().to_string()).collect();
            if !kind_list.is_empty() {
                sql.push_str(&format!(" AND kind IN ({})", kind_list.join(",")));
            }
        }
        
        // Filter by authors
        if let Some(authors) = &filter.authors {
            if !authors.is_empty() {
                let author_list: Vec<String> = authors.iter().map(|a| format!("'{}'", a)).collect();
                sql.push_str(&format!(" AND pubkey IN ({})", author_list.join(",")));
            }
        }
        
        // Filter by since
        if let Some(since) = filter.since {
            sql.push_str(&format!(" AND EXTRACT(EPOCH FROM \"createdAt\") >= {}", since.as_u64()));
        }
        
        // Filter by until
        if let Some(until) = filter.until {
            sql.push_str(&format!(" AND EXTRACT(EPOCH FROM \"createdAt\") <= {}", until.as_u64()));
        }
    }
    
    // Order and limit
    sql.push_str(" ORDER BY \"createdAt\" DESC");
    if let Some(filter) = filters.first() {
        if let Some(limit) = filter.limit {
            sql.push_str(&format!(" LIMIT {}", limit.min(500))); // Cap at 500
        } else {
            sql.push_str(" LIMIT 100");
        }
    } else {
        sql.push_str(" LIMIT 100");
    }
    
    debug!("Executing query: {}", sql);
    
    let rows = sqlx::query(&sql)
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
                        if filter.match_event(&event) {
                            matched = true;
                            break;
                        }
                    }
                    
                    if matched {
                        sent_count += 1;
                        info!("handle_req: Sending event {} (kind: {}) to sub_id: {}", event_id, kind, sub_id);
                        let _ = sender.send(Message::Text(RelayMessage::event(sub_id.clone(), event).as_json())).await;
                    }
                }
            }
            info!("handle_req: Sent {} matching events for sub_id: {}, sending EOSE", sent_count, sub_id);
            let _ = sender.send(Message::Text(RelayMessage::eose(sub_id).as_json())).await;
        }
        Err(e) => {
            error!("Failed to query events: {}", e);
            let _ = sender.send(Message::Text(RelayMessage::notice(format!("Failed to query events: {}", e)).as_json())).await;
        }
    }
}

// Handle REQ with prefix searches (short author pubkeys)
async fn handle_prefix_search_req(
    sub_id: SubscriptionId,
    filter: serde_json::Map<String, serde_json::Value>,
    state: &Arc<AppState>,
    subscriptions: &mut HashMap<String, Vec<Filter>>,
    sender: &tokio::sync::mpsc::Sender<Message>,
) {
    info!("Received REQ with potential prefix search, sub_id: {}", sub_id);
    
    // Extract filter components
    let kinds: Vec<i32> = filter.get("kinds")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_i64().map(|n| n as i32)).collect())
        .unwrap_or_default();
    
    let authors: Vec<String> = filter.get("authors")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    
    let since = filter.get("since").and_then(|v| v.as_i64());
    let until = filter.get("until").and_then(|v| v.as_i64());
    let limit = filter.get("limit").and_then(|v| v.as_i64()).unwrap_or(100);
    
    // Build SQL query with prefix support
    let mut query = String::from(
        "SELECT \"eventId\", pubkey, kind, content, tags, sig, \"createdAt\" FROM events WHERE (\"expiresAt\" IS NULL OR \"expiresAt\" > NOW())"
    );
    
    // Add kinds filter
    if !kinds.is_empty() {
        let kinds_str = kinds.iter().map(|k| k.to_string()).collect::<Vec<_>>().join(",");
        query.push_str(&format!(" AND kind IN ({})", kinds_str));
    }
    
    // Add authors filter with prefix support
    if !authors.is_empty() {
        query.push_str(" AND (");
        let author_conditions: Vec<String> = authors.iter().map(|author| {
            if author.len() == 64 {
                // Full pubkey - exact match
                format!("pubkey = '{}'", author)
            } else {
                // Prefix - use LIKE
                format!("pubkey LIKE '{}%'", author)
            }
        }).collect();
        query.push_str(&author_conditions.join(" OR "));
        query.push_str(")");
    }
    
    // Add time filters
    if let Some(since_ts) = since {
        query.push_str(&format!(" AND EXTRACT(EPOCH FROM \"createdAt\") >= {}", since_ts));
    }
    if let Some(until_ts) = until {
        query.push_str(&format!(" AND EXTRACT(EPOCH FROM \"createdAt\") <= {}", until_ts));
    }
    
    query.push_str(&format!(" ORDER BY \"createdAt\" DESC LIMIT {}", limit));
    
    debug!("Prefix search query: {}", query);
    
    // Execute query
    let rows = sqlx::query(&query).fetch_all(&state.db).await;
    
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
                    let _ = sender.send(Message::Text(RelayMessage::event(sub_id.clone(), event).as_json())).await;
                }
            }
            
            info!("Sent {} events for prefix search sub_id: {}, sending EOSE", sent_count, sub_id);
            let _ = sender.send(Message::Text(RelayMessage::eose(sub_id).as_json())).await;
        }
        Err(e) => {
            error!("Prefix search query failed: {}", e);
            let _ = sender.send(Message::Text(RelayMessage::notice(format!("Query error: {}", e)).as_json())).await;
        }
    }
}

