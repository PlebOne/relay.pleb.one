# NIP-07 Login Flow - Before vs After

## BEFORE (Problematic Flow)

```
User clicks "Sign in with Extension"
    ↓
Check if window.nostr exists ❌ (Race condition - may not be loaded yet)
    ↓
If not found → Immediate failure
    ↓
If found → Call getPublicKey() ❌ (No timeout - could hang)
    ↓
Call signEvent() ❌ (No timeout - could hang)
    ↓
Send to server
    ↓
Server validates signature ❌ (Doesn't verify event ID)
    ↓
Success or generic error ❌ (Poor error messages)

❌ Problems:
- Single point of failure at each step
- No retries
- No timeouts
- Race conditions
- Poor error handling
- Security gap (no event ID verification)
```

## AFTER (Robust Flow)

```
User clicks "Sign in with Extension"
    ↓
waitForExtension() ✅ (Polls up to 1 second)
    ├─ Attempt 1 (0ms)
    ├─ Attempt 2 (100ms)
    ├─ ...
    └─ Attempt 10 (900ms)
    ↓
Extension ready? 
    ├─ No → Clear error: "Install NIP-07 extension"
    └─ Yes → Continue
    ↓
┌─────────────────────────────────────┐
│ Retry Loop (up to 3 attempts)       │
│                                      │
│  Get Public Key with 10s timeout ✅  │
│     ├─ Success → Continue            │
│     ├─ Timeout → Retry               │
│     └─ Error → Retry                 │
│      ↓                               │
│  Sign Event with 30s timeout ✅      │
│     ├─ Success → Continue            │
│     ├─ User cancelled → Clear msg    │
│     ├─ Timeout → Retry               │
│     └─ Error → Retry                 │
│      ↓                               │
│  Validate Event Structure ✅         │
│     ├─ Has id, sig, pubkey?         │
│     ├─ Pubkey matches?              │
│     └─ Valid kind & timestamp?      │
│      ↓                               │
│  Send to Server                     │
│      ↓                               │
│  Server Processing:                 │
│     ├─ Parse JSON                   │
│     ├─ Validate structure           │
│     ├─ Verify timestamp (15min) ✅   │
│     ├─ Recompute event ID ✅         │
│     ├─ Verify ID matches ✅          │
│     ├─ Verify signature             │
│     └─ Create/find user             │
│      ↓                               │
│  Success or specific error ✅        │
│                                      │
│  If retry attempt < 3:              │
│    Wait (1s, 2s) then retry         │
│                                      │
└─────────────────────────────────────┘
    ↓
Success → Redirect to dashboard
OR
Specific error with guidance:
  - "Extension timeout - check extension"
  - "Signing cancelled - approve request"
  - "Extension not found - install Alby/nos2x"
  - "Clock drift - check system time"
  - etc.

✅ Improvements:
- Handles race conditions
- Auto-retry with backoff
- Timeout protection
- Clear error messages
- Security hardened
- Better UX
```

## Error Handling Matrix

| Error Type | Detection | User Message | Action |
|------------|-----------|--------------|--------|
| Extension not ready | waitForExtension() timeout | "Install NIP-07 extension" | Install extension |
| Extension timeout | Promise.race timeout | "Extension took too long" | Check/restart extension |
| User cancelled | signEvent rejection | "Signing cancelled" | Try again, approve prompt |
| Invalid event | Structure validation | "Extension returned invalid event" | Try different extension |
| Event ID mismatch | Server getEventHash | "Possible tampering detected" | Contact support |
| Clock drift | Timestamp validation | Auth fails, logged server-side | Check system clock |
| Network error | fetch/signIn failure | "Network error" | Check connection |
| Server rejection | authorize returns null | "Authentication failed" | Check account status |

## Retry Logic

```
Attempt 1
    ↓ (failure)
Wait 1 second
    ↓
Attempt 2
    ↓ (failure)
Wait 2 seconds
    ↓
Attempt 3
    ↓ (failure)
Show specific error with guidance
```

## Security Validation Chain

```
Client Side:
✅ Extension signature (by extension)
✅ Event structure validation
✅ Pubkey consistency check
    ↓
    JSON payload sent to server
    ↓
Server Side:
✅ JSON parsing
✅ Required fields present
✅ Event kind = 22242
✅ Pubkey matches credential
✅ Timestamp within 15 minutes
✅ Recompute event ID ← NEW SECURITY CHECK
✅ Event ID matches computed hash
✅ Cryptographic signature verification
✅ User exists or create
    ↓
Session created
```

## Timeout Values

| Operation | Timeout | Reasoning |
|-----------|---------|-----------|
| waitForExtension | 1 second | Extensions load quickly |
| getPublicKey | 10 seconds | Should be instant, but allow for UI |
| signEvent | 30 seconds | User needs time to review and approve |
| Retry delay 1 | 1 second | Give extension time to recover |
| Retry delay 2 | 2 seconds | Exponential backoff |

## Monitoring Points

```
Client Metrics:
- Extension detection rate
- Average wait time for extension
- Retry count distribution
- Error type frequency
- Success rate per extension type

Server Metrics:
- Event ID mismatch rate (should be ~0%)
- Timestamp rejection rate
- Signature verification failures
- Average request latency
- Success rate by hour/day

Logs to Watch:
[Client] "NIP-07 login attempt X failed"
[Server] "NIP-07 auth: Event ID mismatch"
[Server] "NIP-07 auth: Event timestamp outside acceptable range"
[Server] "NIP-07 auth: Invalid event signature"
```

## Extension Compatibility

| Extension | Status | Notes |
|-----------|--------|-------|
| Alby | ✅ Tested | Most reliable |
| nos2x | ✅ Tested | Good compatibility |
| Flamingo | ✅ Tested | Works well |
| Horse | ✅ Should work | Standard NIP-07 |
| Nostore | ✅ Should work | Standard NIP-07 |
| Others | ⚠️ Varies | Report issues |

All extensions implementing NIP-07 spec should work with this implementation.
