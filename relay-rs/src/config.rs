//! Runtime limits and NIP-11 identity, read once from the environment. The
//! NIP-11 `limitation` object is built from these same values so the document
//! always matches what the relay enforces.

use nostr::prelude::PublicKey;

/// Relay operator: npub13hyx3qsqk3r7ctjqrr49uskut4yqjsxt8uvu4rekr55p08wyhf0qq90nt7
pub const DEFAULT_RELAY_PUBKEY: &str = "npub13hyx3qsqk3r7ctjqrr49uskut4yqjsxt8uvu4rekr55p08wyhf0qq90nt7";
pub const DEFAULT_RELAY_CONTACT: &str = "https://relay.pleb.one";
pub const DEFAULT_RELAY_ICON: &str = "https://relay.pleb.one/android-chrome-512x512.png";

pub const DEFAULT_MAX_EVENT_SIZE: usize = 64 * 1024;
pub const DEFAULT_CREATED_AT_UPPER_LIMIT_SECS: u64 = 900;
pub const DEFAULT_MAX_SUBSCRIPTIONS: usize = 20;
pub const DEFAULT_MAX_LIMIT: usize = 500;
pub const DEFAULT_LIMIT: usize = 100;
/// Room for the `["EVENT", ...]` envelope around an event at the size cap.
const MESSAGE_HEADROOM: usize = 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelayConfig {
    /// Max serialized event JSON, bytes (MAX_EVENT_SIZE).
    pub max_event_size: usize,
    /// Max incoming websocket message/frame, bytes (MAX_MESSAGE_SIZE,
    /// default 2x the event cap; never below the event cap plus envelope).
    pub max_message_length: usize,
    /// Reject events this many seconds or more ahead of now (CREATED_AT_UPPER_LIMIT_SECS).
    pub created_at_upper_limit: u64,
    /// Open subscriptions per connection (MAX_SUBSCRIPTIONS_PER_CONNECTION).
    pub max_subscriptions: usize,
    /// Cap on a filter's `limit` (MAX_LIMIT).
    pub max_limit: usize,
    /// Relay operator pubkey, hex (RELAY_PUBKEY, hex or npub).
    pub pubkey: String,
    /// RELAY_CONTACT
    pub contact: String,
    /// RELAY_ICON
    pub icon: String,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self::from_lookup(|_| None)
    }
}

impl RelayConfig {
    pub fn from_env() -> Self {
        Self::from_lookup(|k| std::env::var(k).ok())
    }

    /// Build from a key lookup; empty or unparsable values fall back to defaults.
    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Self {
        let get = |k: &str| get(k).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let num = |k: &str| get(k).and_then(|v| v.parse::<u64>().ok()).filter(|n| *n > 0);

        let max_event_size = num("MAX_EVENT_SIZE").map(|n| n as usize).unwrap_or(DEFAULT_MAX_EVENT_SIZE);
        let max_message_length = num("MAX_MESSAGE_SIZE")
            .map(|n| n as usize)
            .unwrap_or(max_event_size * 2)
            .max(max_event_size + MESSAGE_HEADROOM);

        let default_pubkey = PublicKey::parse(DEFAULT_RELAY_PUBKEY).expect("valid default pubkey");
        let pubkey = get("RELAY_PUBKEY")
            .and_then(|v| PublicKey::parse(&v).ok())
            .unwrap_or(default_pubkey)
            .to_hex();

        Self {
            max_event_size,
            max_message_length,
            created_at_upper_limit: num("CREATED_AT_UPPER_LIMIT_SECS").unwrap_or(DEFAULT_CREATED_AT_UPPER_LIMIT_SECS),
            max_subscriptions: num("MAX_SUBSCRIPTIONS_PER_CONNECTION").map(|n| n as usize).unwrap_or(DEFAULT_MAX_SUBSCRIPTIONS),
            max_limit: num("MAX_LIMIT").map(|n| n as usize).unwrap_or(DEFAULT_MAX_LIMIT),
            pubkey,
            contact: get("RELAY_CONTACT").unwrap_or_else(|| DEFAULT_RELAY_CONTACT.to_string()),
            icon: get("RELAY_ICON").unwrap_or_else(|| DEFAULT_RELAY_ICON.to_string()),
        }
    }

    /// Effective `limit` for a filter.
    pub fn clamp_limit(&self, requested: Option<usize>) -> usize {
        requested.unwrap_or(DEFAULT_LIMIT.min(self.max_limit)).min(self.max_limit)
    }
}

/// NIP-11 relay information document.
pub fn relay_info(cfg: &RelayConfig) -> serde_json::Value {
    serde_json::json!({
        "name": "Relay Pleb One",
        "description": "A Rust-based Nostr Relay",
        "pubkey": cfg.pubkey,
        "contact": cfg.contact,
        "icon": cfg.icon,
        "supported_nips": [1, 9, 11, 15, 17, 20, 23, 33, 40, 42, 51, 56, 62, 65, 66, 77, 86],
        "software": "relay-rs",
        "version": "0.1.0",
        "limitation": {
            "max_message_length": cfg.max_message_length,
            "max_subscriptions": cfg.max_subscriptions,
            "max_limit": cfg.max_limit,
            "default_limit": cfg.clamp_limit(None),
            // Reads and publishing do not require NIP-42 AUTH; writes are
            // limited to whitelisted pubkeys (checked on the event's pubkey).
            "auth_required": false,
            "restricted_writes": true,
            "created_at_upper_limit": cfg.created_at_upper_limit,
        }
    })
}

/// Reject events whose created_at is more than `upper_limit` seconds ahead of `now`.
pub fn check_created_at(created_at: u64, now: u64, upper_limit: u64) -> Result<(), &'static str> {
    if created_at > now.saturating_add(upper_limit) {
        Err("invalid: created_at too far in the future")
    } else {
        Ok(())
    }
}

/// Reject events whose serialized JSON is larger than `max` bytes.
pub fn check_event_size(json_len: usize, max: usize) -> Result<(), &'static str> {
    if json_len > max {
        Err("invalid: event too large")
    } else {
        Ok(())
    }
}

/// Kinds 20000-29999 are forwarded to live subscribers but never stored.
pub fn is_ephemeral(kind: u16) -> bool {
    (20000..30000).contains(&kind)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    const OPERATOR_HEX: &str = "8dc8688200b447ec2e4018ea5e42dc5d480940cb3f19ca8f361d28179dc4ba5e";

    fn cfg(vars: &[(&str, &str)]) -> RelayConfig {
        let m: HashMap<String, String> = vars.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        RelayConfig::from_lookup(|k| m.get(k).cloned())
    }

    #[test]
    fn defaults() {
        let c = RelayConfig::default();
        assert_eq!(c.max_event_size, 65536);
        assert_eq!(c.max_message_length, 131072);
        assert_eq!(c.created_at_upper_limit, 900);
        assert_eq!(c.max_subscriptions, 20);
        assert_eq!(c.max_limit, 500);
        assert_eq!(c.pubkey, OPERATOR_HEX);
        assert_eq!(c.contact, "https://relay.pleb.one");
        assert_eq!(c.icon, "https://relay.pleb.one/android-chrome-512x512.png");
    }

    #[test]
    fn env_overrides() {
        let other = "b16138e586779b4565a6f58707642873505adae0147c71d9198f6851456e0f95";
        let c = cfg(&[
            ("MAX_EVENT_SIZE", "1000"),
            ("CREATED_AT_UPPER_LIMIT_SECS", "60"),
            ("MAX_SUBSCRIPTIONS_PER_CONNECTION", "5"),
            ("MAX_LIMIT", "50"),
            ("RELAY_PUBKEY", other),
            ("RELAY_CONTACT", "mailto:x@example.com"),
            ("RELAY_ICON", "https://example.com/i.png"),
        ]);
        assert_eq!(c.max_event_size, 1000);
        assert_eq!(c.max_message_length, 2024); // max(2000, 1000 + 1024)
        assert_eq!(c.created_at_upper_limit, 60);
        assert_eq!(c.max_subscriptions, 5);
        assert_eq!(c.max_limit, 50);
        assert_eq!(c.pubkey, other);
        assert_eq!(c.contact, "mailto:x@example.com");
        assert_eq!(c.icon, "https://example.com/i.png");
        assert_eq!(cfg(&[("MAX_MESSAGE_SIZE", "500000")]).max_message_length, 500000);
    }

    #[test]
    fn empty_or_invalid_env_falls_back() {
        let c = cfg(&[
            ("RELAY_PUBKEY", ""),
            ("RELAY_CONTACT", "  "),
            ("MAX_EVENT_SIZE", "lots"),
            ("CREATED_AT_UPPER_LIMIT_SECS", "0"),
        ]);
        assert_eq!(c, RelayConfig::default());
        assert_eq!(cfg(&[("RELAY_PUBKEY", "not a key")]).pubkey, OPERATOR_HEX);
        // npub is accepted and normalised to hex
        assert_eq!(cfg(&[("RELAY_PUBKEY", DEFAULT_RELAY_PUBKEY)]).pubkey, OPERATOR_HEX);
    }

    #[test]
    fn message_cap_never_below_event_cap() {
        let c = cfg(&[("MAX_EVENT_SIZE", "100000"), ("MAX_MESSAGE_SIZE", "1000")]);
        assert_eq!(c.max_message_length, 100000 + 1024);
    }

    #[test]
    fn limit_clamp() {
        let c = RelayConfig::default();
        assert_eq!(c.clamp_limit(None), 100);
        assert_eq!(c.clamp_limit(Some(10)), 10);
        assert_eq!(c.clamp_limit(Some(10_000)), 500);
        assert_eq!(cfg(&[("MAX_LIMIT", "20")]).clamp_limit(None), 20);
    }

    #[test]
    fn nip11_matches_config() {
        let c = cfg(&[("MAX_EVENT_SIZE", "1000"), ("MAX_SUBSCRIPTIONS_PER_CONNECTION", "7"), ("CREATED_AT_UPPER_LIMIT_SECS", "30")]);
        let info = relay_info(&c);
        assert_eq!(info["pubkey"], c.pubkey);
        assert_eq!(info["contact"], "https://relay.pleb.one");
        assert_eq!(info["icon"], "https://relay.pleb.one/android-chrome-512x512.png");
        let l = &info["limitation"];
        assert_eq!(l["max_message_length"], c.max_message_length);
        assert_eq!(l["max_subscriptions"], 7);
        assert_eq!(l["max_limit"], 500);
        assert_eq!(l["created_at_upper_limit"], 30);
        assert_eq!(l["auth_required"], false);
        assert_eq!(l["restricted_writes"], true);
    }

    #[test]
    fn created_at_limit() {
        let now = 1_760_000_000;
        assert!(check_created_at(now, now, 900).is_ok());
        assert!(check_created_at(now - 86_400, now, 900).is_ok());
        assert!(check_created_at(now + 900, now, 900).is_ok());
        assert_eq!(check_created_at(now + 901, now, 900), Err("invalid: created_at too far in the future"));
    }

    #[test]
    fn event_size_limit() {
        assert!(check_event_size(65536, 65536).is_ok());
        assert_eq!(check_event_size(65537, 65536), Err("invalid: event too large"));
    }

    #[test]
    fn ephemeral_range() {
        assert!(!is_ephemeral(19999));
        assert!(is_ephemeral(20000));
        assert!(is_ephemeral(29999));
        assert!(!is_ephemeral(30000));
    }
}
