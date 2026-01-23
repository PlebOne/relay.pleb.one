# 🔐 IMPORTANT: Login Security Update

## What's Changing

To improve security, we're removing two insecure login methods:
- ❌ **nsec (private key) login** 
- ❌ **Hex private key login**

These methods exposed your private keys to potential security risks.

## What's Staying

✅ **NIP-07 Browser Extension** (Recommended - Most Secure)  
✅ **npub + Password** (Alternative)

## Action Required

### If you currently login with nsec or hex key:

#### **Option 1: Use NIP-07 Extension** (Recommended - 5 minutes)

**Best for:** Everyone who values security

1. Install a NIP-07 browser extension:
   - **[Alby](https://getalby.com/)** (Recommended - Chrome, Firefox, Safari)
   - **[nos2x](https://github.com/fiatjaf/nos2x)** (Chrome, Firefox)
   - **[Flamingo](https://www.getflamingo.org/)** (Chrome)

2. Import your nsec key into the extension (one-time setup)
   - Open the extension
   - Choose "Import existing key"
   - Paste your nsec key
   - Set a password to protect it

3. Login to relay.pleb.one:
   - Click "Sign in with Extension"
   - Approve the signature request
   - Done! ✓

**Why this is better:**
- Your private key never leaves the extension
- Works with hardware wallets
- Most secure method available
- Better user experience

---

#### **Option 2: Set a Password** (5 minutes)

**Best for:** Users who need automation or CLI access

1. Login NOW (before the update) using your current method
2. Go to Settings or Profile
3. Set a strong password (minimum 8 characters)
4. After the update, login with your npub + password

**Note:** Less secure than NIP-07 extensions, but acceptable.

---

#### **Option 3: Contact Support** (If you're locked out)

If you can't complete Option 1 or 2 before the update:
- Visit [relay.pleb.one/support](https://relay.pleb.one/support)
- Submit a support request
- An admin will help you regain access

## Timeline

**⏰ Update Date:** [TO BE ANNOUNCED]

**Recommended Action:** Switch to NIP-07 extension before the update date.

## Why We're Making This Change

### Security Issues with Private Key Login

When you enter your private key (nsec/hex) into a website:
- ❌ It's exposed to the web application
- ❌ It's visible in browser memory
- ❌ It could be logged accidentally
- ❌ It's vulnerable to XSS attacks
- ❌ It could be stolen by malicious extensions
- ❌ It trains users to enter keys in websites (phishing risk)

### How NIP-07 Extensions Fix This

- ✅ Private key stays in secure, isolated storage
- ✅ Website only receives signatures, never the key
- ✅ You approve each action explicitly
- ✅ Compatible with hardware wallets
- ✅ Industry best practice for Nostr applications

## FAQ

### Q: I don't want to install an extension. Can I still use the site?
**A:** Yes! You can set a password and use npub+password login. However, NIP-07 extensions are more secure and provide a better experience.

### Q: Which extension should I use?
**A:** We recommend [Alby](https://getalby.com/) for most users. It's user-friendly, well-maintained, and supports multiple platforms.

### Q: Will my existing session be affected?
**A:** No. Your current session will remain active. This only affects new logins.

### Q: I use multiple devices. Do I need the extension on all of them?
**A:** Yes, install the extension on each device, OR set a password and use that on devices where you can't install extensions.

### Q: Can I still use my nsec key somewhere?
**A:** Yes! Import it into a NIP-07 extension. The extension keeps it secure and uses it to sign on your behalf.

### Q: What if I forget my password?
**A:** Contact support. Since passwords are hashed, we cannot recover them, but admins can help you regain access.

### Q: Is this change mandatory?
**A:** Yes. For security reasons, we can no longer support private key-based login through web forms.

## Getting Help

### Installation Guides

**Alby Extension:**
1. Visit [getalby.com](https://getalby.com/)
2. Click "Get Alby Extension"
3. Follow the installation prompts
4. Import your existing nsec key
5. You're ready to go!

**nos2x Extension:**
1. Visit the [nos2x GitHub page](https://github.com/fiatjaf/nos2x)
2. Install from Chrome Web Store or Firefox Add-ons
3. Click the extension icon
4. Import your nsec key
5. Done!

### Video Tutorials

- [How to Install Alby](https://www.youtube.com/results?search_query=how+to+install+alby+extension)
- [Understanding NIP-07](https://www.youtube.com/results?search_query=nostr+nip-07+extension)

### Support Channels

- **Support Form:** [relay.pleb.one/support](https://relay.pleb.one/support)
- **Report Issues:** [relay.pleb.one/report](https://relay.pleb.one/report)

## Technical Details

For developers and technical users:

- **Removed:** nsec and hex key authentication providers
- **Enhanced:** NIP-07 validation (event ID verification, stricter timestamps)
- **Enhanced:** Password authentication (timing attack prevention, format validation)
- **No Database Changes:** This is purely a login method change
- **Session Compatibility:** Existing sessions remain valid

See [SECURITY_LOGIN_REVAMP.md](./SECURITY_LOGIN_REVAMP.md) for complete technical documentation.

## Thank You

We appreciate your understanding as we improve the security of relay.pleb.one. This change protects both you and the community.

If you have any questions or concerns, please don't hesitate to reach out through our support channels.

---

**Stay Secure! 🔒**

*The relay.pleb.one Team*
