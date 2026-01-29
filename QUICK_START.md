# NIP-05 Quick Start Guide

## 🎯 What Was Built
A complete NIP-05 verification system allowing relay users to get verified `name@pleb.one` addresses.

## ⚡ Quick Deploy (5 minutes)

### 1. Apply Database Changes
```bash
cd /home/plebadmin/relay.pleb.one
npm run db:push
```

### 2. Restart Application
```bash
docker-compose restart app
```

### 3. Update pleb.one Caddyfile
Add this to the TOP of your pleb.one Caddyfile:
```caddy
pleb.one {
    handle /.well-known/nostr.json {
        reverse_proxy https://relay.pleb.one {
            header_up Host {upstream_hostport}
        }
    }
    # ... rest of your config
}
```

Then reload:
```bash
sudo systemctl reload caddy
```

### 4. Test It
```bash
# Should return empty names
curl "https://pleb.one/.well-known/nostr.json?name=test"

# Create a user in dashboard, then test with their name
curl "https://pleb.one/.well-known/nostr.json?name=yourname"
```

## ✅ Verification Checklist
- [ ] Database migrated (npm run db:push)
- [ ] App restarted
- [ ] pleb.one Caddyfile updated
- [ ] Caddy reloaded on pleb.one
- [ ] Test endpoint returns {"names":{}}
- [ ] CORS header present (Access-Control-Allow-Origin: *)
- [ ] Dashboard shows "Identity" tab
- [ ] User can enable NIP-05
- [ ] User can save handle
- [ ] Lookup returns correct pubkey

## 📱 User Instructions
Tell your users:
1. Go to https://relay.pleb.one/dashboard
2. Click "Identity" tab
3. Enable NIP-05
4. Choose a handle
5. Save
6. Update Nostr profile with: `yourhandle@pleb.one`

## 🐛 Quick Troubleshooting

**Problem:** Endpoint returns 404
**Fix:** Check Caddyfile order - .well-known handler must be FIRST

**Problem:** CORS error
**Fix:** Verify Access-Control-Allow-Origin header is present

**Problem:** Name taken
**Fix:** User must choose different name, check: `SELECT * FROM users WHERE nip05_name='name';`

**Problem:** Database error
**Fix:** Ensure migration applied: `\d users` should show nip05_name and nip05_enabled

## 📚 Documentation
- **Technical Details:** See `NIP05_IMPLEMENTATION.md`
- **Full Deployment:** See `DEPLOYMENT.md`
- **Architecture:** See `ARCHITECTURE.md`
- **Summary:** See `SUMMARY.md`

## �� Done!
Your relay now has NIP-05 verification! Users get verified checkmarks on Nostr.

---
Need help? Check the troubleshooting section in DEPLOYMENT.md
