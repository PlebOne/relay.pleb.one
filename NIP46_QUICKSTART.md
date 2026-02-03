# Quick Start: NIP-46 Login

## For Users

### Getting a Bunker URL

**Option 1: nsec.app (Easiest)**
1. Visit https://nsec.app
2. Import or create your Nostr key
3. Click "Get bunker URL"
4. Copy the `bunker://...` string

**Option 2: Amber (Android)**
1. Install Amber from F-Droid or Play Store
2. Import your nsec
3. Settings → Nostr Connect → Get bunker URL
4. Copy the connection string

### Logging In

1. Go to relay.pleb.one/login
2. Find the "NIP-46 Nostr Connect" section
3. Paste your bunker URL
4. Click "Connect Remote Signer"
5. Approve the request on your signer app
6. Done!

## For Developers

### Using the NIP-46 Client

```typescript
import { Nip46Client, parseBunkerUrl } from '@/lib/nip46-client';

// Parse bunker URL
const { pubkey, secret } = parseBunkerUrl('bunker://...');

// Create client
const client = new Nip46Client(pubkey, secret);

// Connect
await client.connect();

// Get public key
const remotePubkey = await client.getPublicKey();

// Sign an event
const signedEvent = await client.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: "Hello from NIP-46!",
});

// Cleanup
client.cleanup();
```

### Testing Locally

```bash
# Start dev server
npm run dev

# Visit login page
open http://localhost:3000/login

# Use nsec.app to generate a test bunker URL
# Paste and test
```

## Common Issues

**"Connection timeout"**
→ Check your signer app is running and connected to internet

**"Invalid bunker URL"**
→ Format: `bunker://64-char-hex-pubkey?relay=wss://...&secret=...`

**"Request timeout"**
→ Approve the signing request on your signer app

## Benefits Over NIP-07

✅ Works on mobile devices  
✅ No browser extension needed  
✅ More reliable (no race conditions)  
✅ Cross-device authentication  
✅ Better for remote signing scenarios

## Next Steps

- Save your bunker URL securely
- Test authentication flow
- Report any issues on GitHub
