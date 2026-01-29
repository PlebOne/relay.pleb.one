# NIP-05 Verification - Deployment Guide

## Quick Start

This guide will help you deploy the NIP-05 verification system for your relay users.

## Prerequisites

- PostgreSQL database running
- Caddy web server on both pleb.one and relay.pleb.one
- Node.js application running on relay.pleb.one
- Access to both server configurations

## Step 1: Apply Database Migration

SSH into your relay server and apply the schema changes:

```bash
cd /home/plebadmin/relay.pleb.one

# Option A: Using Prisma (recommended)
npm run db:push

# Option B: Using raw SQL
psql $DATABASE_URL -f scripts/add_nip05_migration.sql
```

Verify the migration:
```sql
\d users
# Should show nip05_name and nip05_enabled columns
```

## Step 2: Update relay.pleb.one Caddyfile

The Caddyfile at `/home/plebadmin/relay.pleb.one/Caddyfile` has already been updated.

Verify the configuration includes:
```caddy
# NIP-05 verification endpoint
handle /.well-known/nostr.json* {
    reverse_proxy app:3000
}
```

Reload Caddy:
```bash
sudo systemctl reload caddy
# OR if running in Docker:
docker exec relay-pleb-one-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

## Step 3: Update pleb.one Caddyfile

On your main website server (pleb.one), add the following to your Caddyfile:

```caddy
pleb.one {
    # THIS MUST BE FIRST - before other handlers
    handle /.well-known/nostr.json {
        reverse_proxy https://relay.pleb.one {
            header_up Host {upstream_hostport}
        }
    }
    
    # Your existing configuration continues below
    # root * /var/www/html
    # file_server
    # ...
}
```

**Important:** The `handle /.well-known/nostr.json` block MUST come before your website's `file_server` or other handlers, otherwise it won't be matched.

Reload Caddy on pleb.one:
```bash
sudo systemctl reload caddy
```

## Step 4: Restart the Application

Restart the Next.js application to load the new code:

```bash
# If using Docker:
cd /home/plebadmin/relay.pleb.one
docker-compose restart app

# If using PM2 or systemd:
pm2 restart relay-app
# OR
sudo systemctl restart relay-app
```

## Step 5: Verify Installation

### Test 1: Check the endpoint on relay.pleb.one
```bash
curl "https://relay.pleb.one/.well-known/nostr.json?name=test"
```
Expected: `{"names":{}}` (empty because no user named "test" exists yet)

### Test 2: Check the endpoint on pleb.one
```bash
curl "https://pleb.one/.well-known/nostr.json?name=test"
```
Expected: Same response as Test 1 (proving the proxy works)

### Test 3: Check CORS headers
```bash
curl -I "https://pleb.one/.well-known/nostr.json?name=test"
```
Expected headers should include:
```
Access-Control-Allow-Origin: *
Content-Type: application/json
```

### Test 4: Create a test user
1. Log into your dashboard at https://relay.pleb.one/dashboard
2. Go to the "Identity" tab
3. Enable NIP-05
4. Choose a handle (e.g., "alice")
5. Save settings

### Test 5: Verify the test user
```bash
curl "https://pleb.one/.well-known/nostr.json?name=alice"
```
Expected: `{"names":{"alice":"<your_hex_pubkey>"}}`

## Step 6: User Instructions

Users can now set up their NIP-05 verification:

1. Visit https://relay.pleb.one/dashboard
2. Navigate to the "Identity" tab
3. Check "Enable NIP-05 via pleb.one"
4. Enter their desired handle (lowercase, alphanumeric, underscores)
5. Click "Save Settings"
6. Update their Nostr profile with: `<handle>@pleb.one`

Most Nostr clients will automatically verify and display a checkmark.

## Troubleshooting

### Issue: "Can't reach database server"
**Solution:** Start the PostgreSQL database:
```bash
docker-compose up -d postgres
```

### Issue: NIP-05 endpoint returns 404
**Solution:** Check Caddy configuration order. The `.well-known` handler must come first:
```bash
# On pleb.one server:
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### Issue: CORS errors in browser
**Solution:** Verify the API endpoint includes CORS headers:
```bash
curl -v "https://pleb.one/.well-known/nostr.json?name=test" 2>&1 | grep -i "access-control"
```

### Issue: Name already taken
**Solution:** Check who has the name:
```sql
SELECT npub, nip05_name FROM users WHERE nip05_name = 'desired_name';
```

### Issue: Reserved name error
**Solution:** The following names are reserved and cannot be used:
- admin, root, info, support, help
- abuse, postmaster, webmaster, _

Users must choose a different name.

## Security Considerations

1. **Rate Limiting:** Consider adding rate limiting to prevent abuse:
   ```caddy
   handle /.well-known/nostr.json {
       rate_limit {
           zone nip05 {
               key {remote_host}
               events 60
               window 1m
           }
       }
       reverse_proxy https://relay.pleb.one
   }
   ```

2. **Monitoring:** Set up monitoring for the endpoint:
   ```bash
   # Check usage
   tail -f /var/log/caddy/access.log | grep "nostr.json"
   ```

3. **Backup:** Regularly backup the users table:
   ```bash
   pg_dump -t users $DATABASE_URL > users_backup_$(date +%Y%m%d).sql
   ```

## Maintenance

### View active NIP-05 users:
```sql
SELECT nip05_name, npub, created_at 
FROM users 
WHERE nip05_enabled = true 
ORDER BY created_at DESC;
```

### Disable a NIP-05 address:
```sql
UPDATE users 
SET nip05_enabled = false 
WHERE nip05_name = 'username';
```

### Reserve additional names:
Edit the `RESERVED_NAMES` array in:
- `src/app/api/.well-known/nostr.json/route.ts`
- `src/server/api/routers/user.ts`

Then rebuild and restart the application.

## Files Modified/Created

### Database
- `prisma/schema.prisma` - Added nip05_name and nip05_enabled fields

### Backend
- `src/app/api/.well-known/nostr.json/route.ts` - NIP-05 endpoint (NEW)
- `src/server/api/routers/user.ts` - Added getNip05Settings and updateNip05 procedures

### Frontend
- `src/components/dashboard/nip05-panel.tsx` - NIP-05 settings UI (NEW)
- `src/components/dashboard/dashboard-tabs.tsx` - Added Identity tab

### Configuration
- `Caddyfile` - Added .well-known handler on relay.pleb.one
- `Caddyfile.pleb.one.snippet` - Configuration for pleb.one server (NEW)

### Documentation
- `NIP05_IMPLEMENTATION.md` - Technical documentation
- `DEPLOYMENT.md` - This file

### Scripts
- `scripts/add_nip05_migration.sql` - Database migration SQL

## Support

If you encounter issues:

1. Check the logs: `docker logs -f relay-pleb-one-app-1`
2. Verify database connection: `npm run db:studio`
3. Test the endpoint directly: `curl "https://relay.pleb.one/.well-known/nostr.json?name=test"`
4. Review the implementation docs: `cat NIP05_IMPLEMENTATION.md`

## References

- [NIP-05 Specification](https://github.com/nostr-protocol/nips/blob/master/05.md)
- [Caddy Documentation](https://caddyserver.com/docs/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
