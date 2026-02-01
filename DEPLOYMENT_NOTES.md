# Deployment Notes - JSON Parse Error Fix

## Changes Made (2026-02-01)

### Problem Solved
Fixed recurring "Unexpected end of JSON input" errors that occurred during login and API interactions.

### Files Modified

1. **NEW: `/src/lib/fetch-utils.ts`**
   - Created robust JSON parsing utility
   - Handles empty responses, HTML errors, network failures
   - Provides descriptive error messages

2. **UPDATED: `/src/app/request/page.tsx`**
   - Now uses `safeJsonParse` instead of direct `.json()`
   - Better error messages for users

3. **UPDATED: `/src/app/appeal/page.tsx`**
   - Now uses `safeJsonParse` instead of direct `.json()`
   - Better error handling

4. **UPDATED: `/src/app/report/page.tsx`**
   - Now uses `safeJsonParse` instead of direct `.json()`
   - Better error handling

5. **UPDATED: `/src/components/ui/cypherpunk.tsx`**
   - Bitcoin price fetch now uses `safeJsonParse`
   - Won't crash on CoinGecko API issues

### Deployment Steps

1. **Pull latest changes**
   ```bash
   git pull origin main
   ```

2. **Install dependencies** (if needed)
   ```bash
   npm install
   ```

3. **Build application**
   ```bash
   npm run build
   ```

4. **Restart application**
   ```bash
   # Using PM2
   pm2 restart relay-pleb-one
   
   # Or systemd
   systemctl restart relay-pleb-one
   ```

### Testing Checklist

After deployment, test these scenarios:

- [ ] Login with NIP-07 extension
- [ ] Login with npub + password
- [ ] Submit invite request
- [ ] Submit appeal (requires login)
- [ ] Submit report
- [ ] Check Bitcoin price displays on homepage

### Rollback Plan

If issues occur:
```bash
git revert HEAD
npm run build
pm2 restart relay-pleb-one
```

### Monitoring

Watch for:
- Any remaining JSON parsing errors in logs
- Authentication failures
- API endpoint errors

Check logs:
```bash
pm2 logs relay-pleb-one
# or
journalctl -u relay-pleb-one -f
```

---

**Build Status:** ✅ Passed  
**Tests:** Manual testing required  
**Breaking Changes:** None  
**Database Changes:** None
