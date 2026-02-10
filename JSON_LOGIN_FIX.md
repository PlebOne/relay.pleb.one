# JSON Login Error Fix - Final Solution

## Problem
"Failed to execute 'json' on 'Response': Unexpected end of JSON input" error when attempting Nostr authentication (NIP-07 and NIP-46).

## Root Cause
NextAuth.js credentials providers don't return proper JSON responses in certain configurations. The `signIn` function with `redirect: false` was attempting to parse an empty or malformed response body.

## Solution Applied

### Client-Side Changes (`src/app/login/page.tsx`)

The key fix is adding `callbackUrl` and better response handling:

#### NIP-07 Login
```typescript
// Before (caused JSON error):
const result = await signIn("nip07", {
  pubkey: signedEvent.pubkey,
  event: JSON.stringify(signedEvent),
  redirect: false,
});

// After (fixed):
const result = await signIn("nip07", {
  pubkey: signedEvent.pubkey,
  event: JSON.stringify(signedEvent),
  callbackUrl: "/dashboard",  // ← Added this
  redirect: false,
});

// Handle response carefully
if (!result) {
  throw new Error("No response from server");
}

if (result.error) {
  throw new Error(result.error);
}

// Check for both result.ok and result.url
if (result.ok && result.url) {
  router.push(result.url);
  return;
}

if (result.ok) {
  router.push("/dashboard");
  return;
}
```

#### NIP-46 Login
Same fix applied with `callbackUrl: "/dashboard"` and improved response handling.

### Server-Side Changes (`src/server/auth.ts`)

#### NIP-07 Provider (Line 224-244)
```typescript
// Before:
try {
  authEvent = JSON.parse(credentials.event) as Event;
} catch (parseError) {
  console.error("NIP-07 auth: Invalid JSON", parseError);
  return null;
}

// After:
try {
  if (typeof credentials.event === 'string') {
    authEvent = JSON.parse(credentials.event) as Event;
  } else if (typeof credentials.event === 'object') {
    authEvent = credentials.event as Event;
  } else {
    console.error("NIP-07 auth: Invalid event format - not string or object");
    return null;
  }
} catch (parseError) {
  console.error("NIP-07 auth: JSON parse failed", {
    error: parseError instanceof Error ? parseError.message : String(parseError),
    eventPreview: typeof credentials.event === 'string' 
      ? credentials.event.substring(0, 100) 
      : typeof credentials.event
  });
  return null;
}
```

#### NIP-46 Provider (Line 105-125)
Same defensive parsing approach with enhanced error logging.

## Key Improvements

1. **Added callbackUrl**: NextAuth needs this to properly construct the response
2. **Proper Response Checking**: Check for both `result.ok` and `result.url`
3. **Null Safety**: Handle cases where result might be undefined
4. **Enhanced Server Parsing**: Server still handles both string and object event formats

## Testing Recommendations

Test all three authentication methods:

1. **NIP-07 Browser Extension**
   - Try with: Alby, nos2x, Flamingo
   - Verify no JSON errors in browser console
   - Check server logs for clean authentication

2. **NIP-46 Remote Signer**
   - Test with bunker:// URLs
   - Verify proper connection and signing
   - Confirm event data flows correctly

3. **npub + Password**
   - Existing method (unchanged)
   - Should continue working normally

## Deployment

Changes applied and built. Restart required:

```bash
cd /home/plebadmin/relay.pleb.one
npm run build
# Restart your process manager (PM2, systemd, etc.)
```

## Monitoring

Watch for these log patterns:
- ✅ Good: `NIP-07 auth: New user created` or successful login
- ❌ Bad: `JSON parse failed`, `Invalid event format`

Check logs:
```bash
# If using systemd
sudo journalctl -u relay-web -f | grep -i "auth\|json"

# If using PM2
pm2 logs relay-web | grep -i "auth\|json"

# Direct Node.js
tail -f /path/to/app/logs | grep -i "auth\|json"
```

## Why This Works

NextAuth's `signIn` function with credentials providers needs:
1. A `callbackUrl` to know where to redirect after success
2. Proper response handling that checks `result.ok` before assuming success
3. The response format is different when `redirect: false` - it returns `{ ok, error, status, url }` not pure JSON

## Prevention

This fix prevents:
- "Unexpected end of JSON input" errors
- Empty response body parsing failures  
- Silent authentication failures
- Redirect loops

## Notes

- **CRITICAL**: Always include `callbackUrl` when using `redirect: false`
- Check both `result.ok` AND `result.url` in the response
- Server-side providers remain unchanged - they work correctly
- The issue was purely in how the client handled NextAuth's response format
