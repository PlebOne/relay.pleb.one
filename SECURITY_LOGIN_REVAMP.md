# Login Security Revamp - January 2026

## Overview

This document describes the comprehensive security improvements made to the authentication system for relay.pleb.one. The revamp focuses on eliminating insecure authentication methods and implementing industry best practices.

## Changes Summary

### ✅ What Was Improved

1. **Removed Insecure Methods**
   - ❌ Removed nsec (private key) login
   - ❌ Removed hex private key login
   - ✅ These methods exposed private keys to web applications (major security risk)

2. **Kept Only Secure Methods**
   - ✅ NIP-07 Browser Extension (Primary & Recommended)
   - ✅ npub + Password (Alternative)

3. **Enhanced Security Validations**
   - Stricter timestamp validation (5 minutes vs 15 minutes)
   - Comprehensive event structure validation
   - Event ID integrity verification (prevents tampering)
   - Pubkey format validation (64-char hex)
   - Password minimum length enforcement (8 characters)
   - npub format validation
   - Constant-time comparison for timing attack prevention

4. **Improved Error Handling**
   - User-friendly error messages
   - Specific timeout, cancellation, and failure messages
   - Better logging for debugging
   - Exponential backoff retry logic

5. **Better User Experience**
   - Cleaner 2-method UI (was 4 methods)
   - Security warnings and recommendations
   - Clear indication of which method is more secure
   - Extended extension detection (2s vs 1s)
   - Visual feedback for all states

## Security Best Practices Implemented

### 1. NIP-07 Authentication (Primary Method)

**Why it's secure:**
- Private keys never leave the user's browser extension
- Cryptographic signatures prove identity without exposing secrets
- User explicitly approves each authentication attempt
- Compatible with hardware wallets through extensions

**Security validations:**
```typescript
✓ Event kind validation (22242 or 27235)
✓ Pubkey format validation (64-char hex)
✓ Timestamp validation (5-minute window)
✓ Event ID recomputation & verification
✓ Cryptographic signature verification
✓ Pubkey consistency check
✓ Complete event structure validation
```

**Timeout protection:**
- 10 seconds for `getPublicKey()`
- 30 seconds for `signEvent()` (allows user interaction)
- Automatic retry with exponential backoff

**Extension compatibility:**
- Alby ✅
- nos2x ✅
- Flamingo ✅
- Horse ✅
- Nostore ✅

### 2. npub + Password Authentication (Alternative Method)

**Why it's acceptable:**
- Only public key (npub) is transmitted
- Password never stored in plaintext (bcrypt hashing)
- Requires pre-configured password (not for new users)
- Useful for automation and CLI tools

**Security validations:**
```typescript
✓ npub format validation (starts with 'npub1', 63 chars)
✓ npub decodability check
✓ Minimum password length (8 characters)
✓ bcrypt password verification (work factor 10)
✓ Constant-time comparison for non-existent users
✓ No password set = authentication denied
```

**Protections implemented:**
- Timing attack prevention (constant-time comparison)
- Clear error messages without revealing user existence
- Client-side validation reduces server load
- Server-side validation prevents bypass

## What Was Removed and Why

### ❌ nsec (Private Key) Login

**Security problems:**
1. **Private key exposure**: Entering nsec into a web form exposes it to:
   - Browser extensions
   - Browser history
   - JavaScript memory
   - Network traffic (if HTTPS is compromised)
   - Server logs (if misconfigured)
   - XSS vulnerabilities

2. **No user confirmation**: Once entered, key is immediately used without user consent for each action

3. **Phishing risk**: Trains users to enter private keys into websites (bad habit)

4. **Key management**: No way to revoke or rotate without changing identity

**Recommendation**: Use NIP-07 extensions instead. They keep keys secure in isolated storage.

### ❌ Hex Private Key Login

**Same security problems as nsec, plus:**
- Less common format means users might copy from less secure storage
- No checksum validation (nsec has bech32 checksum)
- Even easier to accidentally paste in wrong contexts

**Recommendation**: Convert hex keys to nsec and store in a NIP-07 extension.

## Migration Guide for Users

### If you were using nsec/hex key login:

**Option 1: Use NIP-07 Extension (Recommended)**
1. Install a NIP-07 browser extension (Alby is recommended)
2. Import your nsec into the extension (one-time, secure process)
3. Use "Sign in with Extension" on login page
4. Your private key never leaves the extension

**Option 2: Set a Password**
1. If you can still login (during transition period), go to Settings
2. Set a strong password (minimum 8 characters)
3. Use npub + password login going forward
4. Note: Less secure than NIP-07, but acceptable

**Option 3: Contact Admin**
If you're locked out, request access through the support form.

## Security Comparison

| Method | Private Key Security | Phishing Resistance | User Experience | Recommended |
|--------|---------------------|--------------------|--------------------|-------------|
| NIP-07 Extension | ✅ Excellent | ✅ Excellent | ✅ Excellent | ✅ **Yes** |
| npub + Password | ✅ Good | ⚠️ Moderate | ✅ Good | ⚠️ If needed |
| nsec/hex (removed) | ❌ Poor | ❌ Poor | ⚠️ Moderate | ❌ **No** |

## Technical Implementation Details

### Server-Side Validation Flow (NIP-07)

```
1. Receive credentials (pubkey + signed event)
2. Parse and validate JSON structure
3. Validate event fields exist and are correct types
4. Validate event kind (22242 or 27235)
5. Validate pubkey format (64-char hex)
6. Check pubkey matches event.pubkey
7. Validate timestamp (5-minute window)
8. Recompute event ID from event data
9. Verify computed ID matches provided ID
10. Verify cryptographic signature
11. Find or create user in database
12. Return user session data
```

### Server-Side Validation Flow (Password)

```
1. Receive credentials (npub + password)
2. Validate npub format (starts with 'npub1', 63 chars)
3. Decode npub and verify it's valid
4. Check password minimum length (8 chars)
5. Query user by npub
6. If user not found, run constant-time dummy comparison
7. If no password hash, deny with generic error
8. Verify password with bcrypt.compare()
9. Return user session data
```

### Client-Side Error Handling

```typescript
Timeout → "Extension timeout. Try again or use different extension."
Cancelled → "You cancelled. Click again and approve to continue."
Not Found → "Extension not accessible. Check it's enabled."
Invalid Format → "Invalid public key format from extension"
Server Error → "Authentication failed. Please try again."
```

## Testing Checklist

### NIP-07 Testing

- [ ] Fresh page load → click NIP-07 immediately
- [ ] Disable extension → try to login → see appropriate error
- [ ] Cancel signature prompt → see cancellation message
- [ ] Approve signature → successful login
- [ ] Test with multiple extensions (Alby, nos2x, etc.)
- [ ] Test on different browsers (Chrome, Firefox, Brave)
- [ ] Test with slow network (DevTools throttling)

### Password Testing

- [ ] Valid npub + password → successful login
- [ ] Valid npub + wrong password → clear error
- [ ] Invalid npub format → validation error
- [ ] Short password (<8 chars) → validation error
- [ ] Non-existent npub → generic error (no user enumeration)
- [ ] npub without password set → generic error
- [ ] Empty fields → appropriate validation messages

### Security Testing

- [ ] Verify event ID tampering is detected
- [ ] Verify old timestamps are rejected (>5 minutes)
- [ ] Verify future timestamps are rejected
- [ ] Verify mismatched pubkeys are rejected
- [ ] Verify invalid signatures are rejected
- [ ] Verify timing attack protection (constant-time comparison)

## Monitoring and Logs

### What to Monitor

1. **Authentication Success Rate**
   - Target: >95% for NIP-07
   - Target: >98% for password

2. **Error Types Distribution**
   - Track timeout vs cancellation vs other errors
   - Helps identify extension compatibility issues

3. **Login Method Usage**
   - Track NIP-07 vs password usage
   - Should see increasing NIP-07 usage over time

### Log Messages

```bash
# Successful NIP-07 auth
NIP-07 auth: New user created - npub1abc...

# Failed attempts (examples)
NIP-07 auth: Missing credentials
NIP-07 auth: Invalid event kind
NIP-07 auth: Event ID mismatch - possible tampering
NIP-07 auth: Invalid signature
NIP-07 auth: Event too old or in future

Password auth: Missing credentials
Password auth: Invalid npub format
Password auth: User not found
Password auth: No password set for user
Password auth: Invalid password
```

## Performance Considerations

### Optimizations

1. **Database Query Optimization**
   - Single query with `select` clause (not full user object)
   - Indexed fields (npub, pubkey)

2. **Validation Order**
   - Cheap validations first (format checks)
   - Expensive operations last (cryptography, database)
   - Early returns on validation failures

3. **Constant-Time Operations**
   - Password comparison uses bcrypt (constant-time)
   - Non-existent user path takes same time as wrong password

## Deployment Notes

### Pre-Deployment

1. Backup database
2. Test on staging environment
3. Notify users of upcoming changes
4. Prepare migration guide

### Deployment

1. Deploy code changes
2. Monitor error rates for first hour
3. Be ready to rollback if issues arise

### Post-Deployment

1. Monitor authentication success rates
2. Check logs for unexpected errors
3. Respond to user support requests
4. Update documentation if needed

## Rollback Plan

If critical issues arise:

```bash
git log --oneline | head -5  # Find commit hash before changes
git revert <commit-hash>
git push origin main
```

Changes are backward compatible at the database level, so rollback is safe.

## Future Enhancements

### Short Term (1-3 months)

1. **Rate Limiting**
   - Implement IP-based rate limiting
   - Prevent brute force attacks
   - Track failed attempts per npub

2. **Session Management**
   - Configurable session duration
   - "Remember me" functionality
   - Session invalidation on password change

3. **Two-Factor Authentication**
   - TOTP support for password login
   - Optional but recommended

### Medium Term (3-6 months)

1. **Nostr Connect (NIP-46)**
   - Remote signer support
   - Better mobile experience
   - Use relay for key delegation

2. **WebAuthn/Passkeys**
   - Hardware security key support
   - Biometric authentication
   - Phishing-resistant

3. **Account Recovery**
   - Email-based password reset
   - Guardian-based recovery
   - Social recovery mechanisms

### Long Term (6-12 months)

1. **Advanced Security Features**
   - Device fingerprinting
   - Anomaly detection
   - Geographic restrictions

2. **Audit Logging**
   - Login history for users
   - Failed attempt tracking
   - Security event notifications

## Support and Troubleshooting

### Common Issues

**"Extension not detected"**
- Install a NIP-07 extension
- Refresh the page
- Check extension is enabled
- Try different browser

**"Signing timeout"**
- Extension popup might be hidden behind windows
- Check browser notifications
- Try clicking login button again
- Restart browser if issue persists

**"Invalid npub or password"**
- Verify npub format (starts with 'npub1')
- Check password is correct
- Ensure password was previously set
- Contact admin if locked out

**"Event timestamp outside acceptable range"**
- Check system clock is accurate
- Synchronize system time
- Try again after fixing clock

## Conclusion

This revamp significantly improves the security posture of relay.pleb.one by:

1. ✅ Eliminating private key exposure vectors
2. ✅ Implementing comprehensive validation
3. ✅ Following industry best practices
4. ✅ Improving user experience
5. ✅ Maintaining backward compatibility where appropriate

The system now follows the security principle of **never exposing private keys to web applications** while still providing a convenient and secure authentication experience.

## References

- [NIP-07: Browser Extension Signing](https://github.com/nostr-protocol/nips/blob/master/07.md)
- [NIP-98: HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [bcrypt Best Practices](https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns)

---

**Last Updated:** January 23, 2026  
**Author:** System Administrator  
**Version:** 1.0
