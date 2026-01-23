# Login Security Quick Reference

## TL;DR

**What Changed:**
- ❌ Removed: nsec and hex private key login (insecure)
- ✅ Kept: NIP-07 extension (recommended) and npub+password

**Why:**
Never expose your private keys to websites. Use extensions that keep keys secure.

## For Users

### Best Method: NIP-07 Extension

1. Install extension (Alby recommended)
2. Import your key once (secure)
3. Click "Sign in with Extension"
4. Approve the signature prompt
5. Done! Your key never leaves the extension

### Alternative: npub + Password

1. You must have previously set a password
2. Enter your npub (starts with npub1...)
3. Enter your password (min 8 characters)
4. Click "Sign in with Password"

## For Developers

### NIP-07 Validation Checklist

```typescript
✓ Event kind: 22242 or 27235
✓ Pubkey format: 64-char hex
✓ Timestamp: within 5 minutes
✓ Event ID: recompute and verify
✓ Signature: cryptographically valid
✓ Pubkey consistency: matches across fields
✓ Structure: all required fields present
```

### Password Validation Checklist

```typescript
✓ npub format: starts with 'npub1', 63 chars
✓ npub decodable: valid bech32
✓ Password length: minimum 8 chars
✓ bcrypt verification: work factor 10
✓ Timing attack prevention: constant-time
✓ User existence: don't reveal in errors
```

### Error Messages

| Error Type | User Message | Action |
|------------|--------------|---------|
| Extension timeout | "Extension timeout. Try again." | Retry or switch extension |
| User cancelled | "You cancelled. Approve to continue." | Click again and approve |
| Invalid credentials | "Invalid npub or password" | Check credentials |
| Event tampering | "Authentication rejected" | Security issue - investigate |

### Testing Commands

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build (tests compilation)
npm run build

# Dev server
npm run dev
```

## Security Principles

1. **Private keys never enter web forms** - Use NIP-07 extensions
2. **Validate everything server-side** - Never trust client input
3. **Fail securely** - Generic errors, don't leak information
4. **Constant-time comparisons** - Prevent timing attacks
5. **Strong password hashing** - bcrypt with appropriate work factor

## Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Extension not detected | Install extension, refresh page |
| Timeout | Check for hidden popup, try again |
| Wrong password | Reset via admin or use NIP-07 |
| Old timestamp error | Fix system clock |

## Monitoring

Watch for:
- Success rate drop (should be >95%)
- Increase in timeout errors (extension issue)
- Spike in failed passwords (potential attack)

Check logs:
```bash
grep "NIP-07 auth:" /var/log/app.log | tail -100
grep "Password auth:" /var/log/app.log | tail -100
```

## Files Modified

- `src/server/auth.ts` - Removed insecure providers, enhanced validation
- `src/app/login/page.tsx` - Simplified UI to 2 methods, better UX
- `src/app/api/auth/[...nextauth]/route.ts` - Cleaned up types

## Migration Path

**For nsec/hex users:**
1. Install NIP-07 extension (one-time setup)
2. Import your nsec (secure, in extension)
3. Use extension login going forward

**Or:** Set a password in settings (requires current access)

---

**Full Documentation:** See [SECURITY_LOGIN_REVAMP.md](./SECURITY_LOGIN_REVAMP.md)
