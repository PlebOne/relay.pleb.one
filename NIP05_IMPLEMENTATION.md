# NIP-05 Verification System Implementation

## Overview
This implementation provides dynamic NIP-05 verification for relay users, allowing them to have verified `name@<domain>` addresses on one of `relay.pleb.one` (default), `id.pleb.one`, `me.pleb.one`, `nostr.pleb.one` or `based.pleb.one`. The list lives in `src/lib/nip05-domains.ts`.

Bare `pleb.one` is a static GitHub Pages site and no longer serves NIP-05; old `name@pleb.one` addresses stop verifying.

## Architecture

### Database Changes
Two new fields added to the `users` table:
- `nip05_name` (TEXT, UNIQUE, INDEXED) - The user's chosen handle
- `nip05_enabled` (BOOLEAN, DEFAULT false) - Whether NIP-05 is active
- `nip05Domain` (TEXT, NOT NULL, DEFAULT 'relay.pleb.one') - Which domain the name is served on

Names stay globally unique across all domains (one `tim`, on one domain).

### Backend Components

#### 1. API Endpoint
**File:** `src/app/api/.well-known/nostr.json/route.ts`

Handles NIP-05 verification requests:
- **Endpoint:** `GET /.well-known/nostr.json?name=<username>`
- **Response:** `{"names": {"<username>": "<pubkey>"}, "relays": {"<pubkey>": ["wss://relay.pleb.one"]}}`
- **Features:**
  - Host-aware: uses the first `X-Forwarded-Host` value, else `Host` (lowercased, port stripped). Only the five NIP-05 domains are answered; any other host gets 404 `{"names":{}}`
  - A name is returned only on the host matching the user's `nip05Domain`
  - CORS enabled (`Access-Control-Allow-Origin: *`)
  - Reserved name protection (admin, root, info, etc.)
  - 5-minute cache on hits (so domain switches take effect quickly)
  - Rate limiting ready

#### 2. tRPC Procedures
**File:** `src/server/api/routers/user.ts`

Two new procedures:
- `getNip05Settings` - Fetch current NIP-05 configuration
- `updateNip05` - Update NIP-05 name, domain (`z.enum` of the shared list) and enabled status
  - Validates name format (lowercase, alphanumeric, underscores)
  - Checks for reserved names
  - Ensures uniqueness

#### 3. UI Component
**File:** `src/components/dashboard/nip05-panel.tsx`

User-facing panel in the dashboard:
- Enable/disable toggle
- Handle input with validation
- Domain select (relay.pleb.one default)
- Live preview of final address
- Success/error messaging
- Instructions for client configuration

#### 4. Dashboard Integration
**File:** `src/components/dashboard/dashboard-tabs.tsx`

New "Identity" tab added to the dashboard navigation.

## Network Configuration

### Current Setup (relay.pleb.one)
The Caddyfile has been updated to route `.well-known/nostr.json` requests to the Next.js application:

```caddy
# NIP-05 verification endpoint
handle /.well-known/nostr.json* {
    reverse_proxy app:3000
}
```

### NIP-05 subdomains (id/me/nostr/based.pleb.one)
The same Caddyfile has a block for the extra domains. They point (DNS A records) at the relay server:

```caddy
id.pleb.one, me.pleb.one, nostr.pleb.one, based.pleb.one {
    handle /.well-known/nostr.json* {
        rewrite * /api{uri}
        reverse_proxy app:3000
    }
    handle {
        redir https://pleb.one{uri}
    }
}
```

Caddy passes the client `Host` through unchanged and sets `X-Forwarded-Host`, so the app sees the subdomain and answers for it. `Caddyfile.pleb.one.snippet` is retired; there is no pleb.one block.

## Database Migration

Apply the migration when the database is available:

```bash
cd /home/plebadmin/relay.pleb.one
psql $DATABASE_URL -f scripts/add_nip05_migration.sql
psql $DATABASE_URL -f scripts/add_nip05_domain_migration.sql
```

Or use Prisma:
```bash
npm run db:push
```

## Security Features

### Reserved Names
The following names cannot be registered:
- admin, root, info, support, help
- abuse, postmaster, webmaster, _

### Validation Rules
- **Format:** Only lowercase letters, numbers, and underscores
- **Length:** 1-30 characters
- **Uniqueness:** Enforced at database level
- **Normalization:** Automatic lowercase conversion

### Rate Limiting
The endpoint includes proper headers for client-side caching and is ready for rate limiting middleware.

## User Flow

1. User navigates to Dashboard → Identity tab
2. Enables NIP-05 verification
3. Chooses a unique handle (e.g., "alice") and a domain (e.g., `id.pleb.one`)
4. Saves settings
5. Address becomes active: `alice@id.pleb.one`
6. User updates their Nostr profile with the NIP-05 field
7. Nostr clients verify and display checkmark

## Testing

### Test the Endpoint Locally
```bash
curl "http://localhost:3000/.well-known/nostr.json?name=testuser"
```

Expected response:
```json
{
  "names": {
    "testuser": "hex_pubkey_here"
  }
}
```

### Test from Another Domain
```bash
curl "https://relay.pleb.one/.well-known/nostr.json?name=testuser"
```

### Test CORS
```bash
curl -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: X-Requested-With" \
  -X OPTIONS \
  "https://relay.pleb.one/.well-known/nostr.json"
```

## Monitoring

### Check Logs
```bash
# Caddy logs
tail -f /var/log/caddy/access.log | grep "nostr.json"

# Application logs
docker logs -f relay-pleb-one-app-1 | grep "NIP-05"
```

### Database Queries
```sql
-- Active NIP-05 users
SELECT nip05_name, npub, nip05_enabled 
FROM users 
WHERE nip05_enabled = true;

-- Popular handles
SELECT nip05_name, COUNT(*) as usage_count 
FROM users 
WHERE nip05_enabled = true 
GROUP BY nip05_name;
```

## Troubleshooting

### NIP-05 Not Working
1. Verify database fields exist: `SELECT nip05_name, nip05_enabled FROM users LIMIT 1;`
2. Check if name is enabled: `SELECT * FROM users WHERE nip05_name = 'username';`
3. Test endpoint directly: `curl "https://relay.pleb.one/.well-known/nostr.json?name=username"`
4. Check CORS headers: Should include `Access-Control-Allow-Origin: *`

### Name Already Taken
The system enforces uniqueness. Users will see an error message. Check with:
```sql
SELECT id, npub, nip05_name FROM users WHERE nip05_name = 'desired_name';
```

### Reserved Name Error
Users cannot claim reserved names. The list is in:
- Backend: `src/app/api/.well-known/nostr.json/route.ts`
- Frontend: `src/server/api/routers/user.ts`

## Future Enhancements

1. **Rate Limiting:** Add rate limiting middleware to prevent abuse
2. **Analytics:** Track NIP-05 verification requests
3. **Name Changes:** Add cooldown period for name changes
4. **Premium Names:** Offer premium/short names for payment
5. **Batch Updates:** Admin tool to manage multiple NIP-05 addresses

## References

- [NIP-05 Specification](https://github.com/nostr-protocol/nips/blob/master/05.md)
- [CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Caddy Reverse Proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
