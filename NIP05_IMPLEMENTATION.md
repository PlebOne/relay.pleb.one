# NIP-05 Verification System Implementation

## Overview
This implementation provides dynamic NIP-05 verification for relay users, allowing them to have verified `name@pleb.one` addresses.

## Architecture

### Database Changes
Two new fields added to the `users` table:
- `nip05_name` (TEXT, UNIQUE, INDEXED) - The user's chosen handle
- `nip05_enabled` (BOOLEAN, DEFAULT false) - Whether NIP-05 is active

### Backend Components

#### 1. API Endpoint
**File:** `src/app/api/.well-known/nostr.json/route.ts`

Handles NIP-05 verification requests:
- **Endpoint:** `GET /.well-known/nostr.json?name=<username>`
- **Response:** `{"names": {"<username>": "<pubkey>"}}`
- **Features:**
  - CORS enabled (`Access-Control-Allow-Origin: *`)
  - Reserved name protection (admin, root, info, etc.)
  - 1-hour cache headers
  - Rate limiting ready

#### 2. tRPC Procedures
**File:** `src/server/api/routers/user.ts`

Two new procedures:
- `getNip05Settings` - Fetch current NIP-05 configuration
- `updateNip05` - Update NIP-05 name and enabled status
  - Validates name format (lowercase, alphanumeric, underscores)
  - Checks for reserved names
  - Ensures uniqueness

#### 3. UI Component
**File:** `src/components/dashboard/nip05-panel.tsx`

User-facing panel in the dashboard:
- Enable/disable toggle
- Handle input with validation
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

### Production Setup (pleb.one)
To enable NIP-05 on the main domain, add this to the pleb.one Caddyfile:

```caddy
pleb.one {
    # Proxy NIP-05 lookups to the relay backend
    handle /.well-known/nostr.json {
        reverse_proxy https://relay.pleb.one {
            header_up Host {upstream_hostport}
        }
    }
    
    # Existing website config follows...
    root * /var/www/html
    file_server
}
```

This configuration:
1. Intercepts NIP-05 requests on `pleb.one`
2. Forwards them to `relay.pleb.one`
3. The relay server handles the database lookup
4. Returns the response through the proxy chain

## Database Migration

Apply the migration when the database is available:

```bash
cd /home/plebadmin/relay.pleb.one
psql $DATABASE_URL -f scripts/add_nip05_migration.sql
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
3. Chooses a unique handle (e.g., "alice")
4. Saves settings
5. Address becomes active: `alice@pleb.one`
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
