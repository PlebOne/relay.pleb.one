# NIP-46 (Nostr Connect) Implementation

## Overview

NIP-46 adds remote signing capability to relay.pleb.one authentication, providing an alternative to browser extensions (NIP-07) that works better for:
- Mobile devices
- Cross-device authentication
- Remote signing scenarios
- Users without browser extension support

## How It Works

### Connection Flow

```
User enters bunker URL (e.g., bunker://pubkey?relay=wss://relay.example&secret=...)
     ↓
Client parses URL to extract:
  - Remote signer pubkey
  - Optional relay URLs
  - Optional shared secret
     ↓
Client creates ephemeral keypair for this session
     ↓
Client subscribes to kind 24133 events (NIP-46 responses)
  - Filters for events tagged with client's ephemeral pubkey
     ↓
Client sends encrypted request (kind 24133) to remote signer:
  - Method: "get_public_key"
  - Encrypted with NIP-04 (client secret ↔ remote pubkey)
     ↓
Remote signer receives request, prompts user for approval
     ↓
Remote signer sends encrypted response back
     ↓
Client receives pubkey, creates auth event
     ↓
Client sends "sign_event" request with auth event template
     ↓
Remote signer signs and returns signed event
     ↓
Client submits to NextAuth for validation
     ↓
Success → User logged in
```

## Components

### 1. NIP-46 Client (`src/lib/nip46-client.ts`)

Core functionality:
- **Nip46Client class**: Manages connection to remote signer
  - `connect()`: Establishes subscription to remote signer
  - `getPublicKey()`: Requests pubkey from remote signer
  - `signEvent()`: Requests signature for an event
  - `cleanup()`: Closes connections and clears state

- **parseBunkerUrl()**: Parses bunker:// URLs into components

### 2. Authentication Provider (`src/server/auth.ts`)

Added "nip46" provider:
- Validates signed events from remote signer
- Same validation as NIP-07 (event structure, signature, timestamp)
- Creates or finds user in database
- Issues session token

### 3. Login UI (`src/app/login/page.tsx`)

New authentication option:
- Input field for bunker:// connection string
- Status messages during connection/signing
- Error handling for connection issues

## Bunker URL Format

```
bunker://<remote-signer-pubkey>?relay=<relay-url>&secret=<optional-secret>
```

Example:
```
bunker://a1b2c3d4e5f6...?relay=wss://relay.nsec.app&secret=mysharedsecret123
```

Parameters:
- **pubkey** (required): 64-character hex public key of remote signer
- **relay** (optional): Relay URL(s) for communication (can specify multiple)
- **secret** (optional): Shared secret for additional authentication

## Compatible Signers

Works with any NIP-46 compliant signer:

### Mobile
- **Amber** (Android): Native Android signing app
- **Nostur** (iOS): With remote signing enabled
- **nsec.app**: Web-based remote signer

### Desktop
- **Nostr Connect**: Browser extension
- **Custom signers**: Any app implementing NIP-46

## Security Features

### Transport Security
- All requests/responses encrypted with NIP-04
- Ephemeral keypair per session (not reused)
- Optional shared secret for additional auth

### Validation (Server-Side)
- ✅ Event signature verification
- ✅ Event ID recomputation check
- ✅ Timestamp validation (5-minute window)
- ✅ Event structure validation
- ✅ Pubkey consistency check

### Privacy
- Client's ephemeral key discarded after login
- Remote signer never learns the app's secrets
- Communication happens over public relays

## Error Handling

| Error | Cause | User Action |
|-------|-------|-------------|
| Invalid bunker URL | Malformed URL | Check format: bunker://pubkey?relay=... |
| Connection timeout | No response from signer | Check signer is online, try different relay |
| Request timeout | Signer didn't respond | Approve request on signer device |
| Invalid signature | Signer malfunction | Try again or use different signer |
| Parse error | URL format issue | Verify bunker URL is correct |

## Configuration

### Relay Selection

Default relays used for NIP-46 communication:
```typescript
const RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
];
```

Can be customized in `src/lib/nip46-client.ts`.

### Timeouts

- **Connection timeout**: 30 seconds
- **Request timeout**: 30 seconds
- **Event age tolerance**: 5 minutes

## Testing

### Manual Testing

1. **With nsec.app**:
   - Visit https://nsec.app
   - Create or import a key
   - Generate bunker URL
   - Copy and paste into relay.pleb.one login

2. **With Amber (Android)**:
   - Install Amber app
   - Add your nsec
   - Go to Settings → Nostr Connect
   - Copy bunker URL
   - Use on relay.pleb.one

### Debug Mode

Enable in browser console:
```javascript
localStorage.setItem('debug', 'nip46:*')
```

Look for:
- `NIP-46 auth: ...` server logs
- Client connection status messages
- Request/response flow

## Comparison with NIP-07

| Feature | NIP-07 (Extension) | NIP-46 (Remote) |
|---------|-------------------|-----------------|
| **Setup** | Install browser extension | Get bunker URL from signer |
| **Mobile Support** | Limited | Excellent |
| **Cross-device** | No | Yes |
| **Reliability** | Race conditions possible | More stable |
| **User Experience** | One-click | Copy/paste URL |
| **Security** | Keys in extension | Keys on remote device |
| **Offline** | Works offline | Needs network |

## Migration Path

Users can use both methods:
1. NIP-07 for desktop browsing (quick & easy)
2. NIP-46 for mobile or when NIP-07 fails

No account changes needed - authentication accepts both.

## Future Enhancements

### Short-term
- [ ] Remember last used bunker URL (local storage)
- [ ] QR code generation for mobile scanning
- [ ] Better connection status indicators

### Long-term
- [ ] Multiple remote signer support
- [ ] Relay pool optimization
- [ ] Session persistence across devices
- [ ] WebRTC for direct connections (NIP-46 extension)

## Troubleshooting

### Connection fails immediately
- Check bunker URL format
- Verify remote signer is running
- Test with default relays first

### Timeout during signing
- Check remote signer notifications
- Approve the request on signer device
- Verify signer has network connection

### "Invalid signature" error
- Signer may be malfunctioning
- Try regenerating bunker URL
- Test with different signer app

## Resources

- [NIP-46 Specification](https://github.com/nostr-protocol/nips/blob/master/46.md)
- [nsec.app](https://nsec.app) - Web-based NIP-46 signer
- [Amber](https://github.com/greenart7c3/Amber) - Android NIP-46 signer

## Support

For issues with NIP-46 authentication:
1. Check browser console for errors
2. Verify bunker URL is valid
3. Test with nsec.app first (known working)
4. Report issues with error messages and signer used
