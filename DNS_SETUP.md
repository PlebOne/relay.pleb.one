# DNS Setup for NIP-05 Verification

## Overview

For NIP-05 to work, you need proper DNS configuration for both domains:
- `pleb.one` (main website)
- `relay.pleb.one` (relay server)

## Current Architecture

```
User's Nostr Client
    ↓
Requests: https://pleb.one/.well-known/nostr.json?name=alice
    ↓
pleb.one server (proxies to relay.pleb.one)
    ↓
relay.pleb.one server (queries database, returns pubkey)
```

## DNS Requirements

### Scenario 1: Both Servers on Same Machine (Simplest)

If both `pleb.one` and `relay.pleb.one` run on the same server:

**DNS Records:**
```
Type    Name         Value                   TTL
A       @            <your-server-ip>        3600
A       relay        <your-server-ip>        3600
AAAA    @            <your-ipv6> (optional)  3600
AAAA    relay        <your-ipv6> (optional)  3600
```

**Result:**
- `pleb.one` → Your Server IP
- `relay.pleb.one` → Same Server IP

### Scenario 2: Two Separate Servers (Your Setup)

If `pleb.one` and `relay.pleb.one` are on different servers:

**DNS Records:**
```
Type    Name         Value                          TTL
A       @            <main-server-ip>               3600
A       relay        <relay-server-ip>              3600
AAAA    @            <main-server-ipv6> (optional)  3600
AAAA    relay        <relay-server-ipv6> (optional) 3600
```

**Result:**
- `pleb.one` → Main Website Server IP
- `relay.pleb.one` → Relay Server IP

## Step-by-Step DNS Setup

### For Most DNS Providers (Cloudflare, Namecheap, GoDaddy, etc.)

1. **Log into your DNS provider's control panel**

2. **Navigate to DNS management** for `pleb.one`

3. **Add/verify A record for root domain:**
   ```
   Type: A
   Name: @ (or leave blank, or "pleb.one")
   Value: <main-server-ip>
   TTL: 3600 (or Auto)
   Proxy: OFF (if using Cloudflare - see note below)
   ```

4. **Add/verify A record for relay subdomain:**
   ```
   Type: A
   Name: relay
   Value: <relay-server-ip>
   TTL: 3600 (or Auto)
   Proxy: OFF (if using Cloudflare - see note below)
   ```

5. **Optional: Add IPv6 (AAAA) records** if your servers support IPv6:
   ```
   Type: AAAA
   Name: @
   Value: <main-server-ipv6>
   
   Type: AAAA
   Name: relay
   Value: <relay-server-ipv6>
   ```

6. **Save changes** and wait for propagation (usually 5-60 minutes)

## Cloudflare-Specific Instructions

### Important: Proxy Settings

**For pleb.one (main domain):**
- ✅ Cloudflare proxy can be **ON** (orange cloud)
- This provides DDoS protection and caching

**For relay.pleb.one:**
- ⚠️ Cloudflare proxy should be **OFF** (gray cloud) initially
- Why? WebSocket connections for Nostr relay work better without proxy
- After testing, you can enable it if needed

**DNS Records in Cloudflare:**
```
Type    Name     Value              Proxy Status    TTL
A       @        <main-ip>          Proxied         Auto
A       relay    <relay-ip>         DNS Only        Auto
```

### Steps in Cloudflare:

1. Log into Cloudflare dashboard
2. Select your `pleb.one` domain
3. Go to **DNS** → **Records**
4. Look for existing records or add new ones:

**For main domain:**
```
Type: A
Name: @
IPv4 address: <your-main-server-ip>
Proxy status: Proxied (orange cloud) ✅
TTL: Auto
```

**For relay subdomain:**
```
Type: A
Name: relay
IPv4 address: <your-relay-server-ip>
Proxy status: DNS only (gray cloud) ☁️
TTL: Auto
```

5. Click **Save**

## Verify DNS Configuration

### Check DNS Propagation

**Using dig (Linux/Mac):**
```bash
# Check main domain
dig pleb.one +short
# Should return: <main-server-ip>

# Check relay subdomain
dig relay.pleb.one +short
# Should return: <relay-server-ip>
```

**Using nslookup (Windows/All):**
```bash
nslookup pleb.one
nslookup relay.pleb.one
```

**Online tools:**
- https://dnschecker.org/
- https://www.whatsmydns.net/

Enter `pleb.one` and `relay.pleb.one` to check global propagation.

### Test Connectivity

**Test main domain:**
```bash
curl -I https://pleb.one
# Should return 200 OK
```

**Test relay domain:**
```bash
curl -I https://relay.pleb.one
# Should return 200 OK
```

**Test NIP-05 endpoint:**
```bash
curl https://pleb.one/.well-known/nostr.json?name=test
# Should return: {"names":{}}
```

## SSL/TLS Certificates (Caddy Handles This)

✅ **Caddy automatically manages SSL certificates** via Let's Encrypt

**Requirements:**
- DNS records must point to correct IPs
- Ports 80 and 443 must be open
- Caddy must be running

**Caddy will automatically:**
1. Detect domain names in your Caddyfile
2. Request SSL certificates from Let's Encrypt
3. Renew certificates automatically

**Check SSL status:**
```bash
# On relay.pleb.one server
caddy validate --config /path/to/Caddyfile
```

## Firewall Configuration

Ensure these ports are open on **both servers**:

```
Port 80   (HTTP)  - Required for Let's Encrypt verification
Port 443  (HTTPS) - Required for secure connections
```

**UFW (Ubuntu firewall):**
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

**Firewalld (CentOS/RHEL):**
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## Common DNS Setups by Provider

### Cloudflare
```
Dashboard → DNS → Records
Add/Edit A records as shown above
Remember: Set relay to "DNS only" (gray cloud)
```

### Namecheap
```
Dashboard → Domain List → Manage → Advanced DNS
Add/Edit A Records:
Host: @        Value: <main-ip>
Host: relay    Value: <relay-ip>
```

### GoDaddy
```
My Products → DNS → Manage Zones
Add/Edit A Records:
Name: @        Value: <main-ip>
Name: relay    Value: <relay-ip>
```

### Google Domains / Google Cloud DNS
```
DNS → Manage Custom Records
Add/Edit:
Host: @        Type: A    Data: <main-ip>
Host: relay    Type: A    Data: <relay-ip>
```

### Route 53 (AWS)
```
Hosted Zones → pleb.one → Create Record
Name: (blank)    Type: A    Value: <main-ip>
Name: relay      Type: A    Value: <relay-ip>
```

## Troubleshooting DNS

### Issue: DNS not resolving

**Check:**
```bash
dig relay.pleb.one +trace
```
This shows the full DNS resolution path.

**Fix:**
- Wait 5-60 minutes for propagation
- Clear local DNS cache:
  ```bash
  # Linux
  sudo systemd-resolve --flush-caches
  
  # Mac
  sudo dscacheutil -flushcache
  
  # Windows
  ipconfig /flushdns
  ```

### Issue: SSL certificate error

**Symptom:** "Certificate not valid" or "Connection not secure"

**Fix:**
1. Verify DNS is pointing to correct IP: `dig relay.pleb.one`
2. Ensure ports 80/443 are open
3. Check Caddy logs: `docker logs <caddy-container>`
4. Manually trigger cert renewal: `caddy reload`

### Issue: NIP-05 returns 404

**Symptom:** `curl https://pleb.one/.well-known/nostr.json?name=test` returns 404

**Fix:**
1. Verify DNS: `dig pleb.one`
2. Check Caddyfile on pleb.one has proxy config
3. Verify relay.pleb.one is accessible: `curl https://relay.pleb.one/health`
4. Check Caddy logs on both servers

### Issue: WebSocket connection fails

**Symptom:** Nostr relay connection errors

**Fix:**
1. Ensure `relay.pleb.one` Cloudflare proxy is OFF (gray cloud)
2. Check WebSocket ports are open
3. Verify Caddy WebSocket configuration

## DNS Security (Optional but Recommended)

### CAA Records (Certificate Authority Authorization)

Tell Let's Encrypt it's authorized to issue certs for your domain:

```
Type    Name    Value
CAA     @       0 issue "letsencrypt.org"
CAA     @       0 issuewild "letsencrypt.org"
```

### DNSSEC (if supported by provider)

Enable DNSSEC in your DNS provider's dashboard for additional security.

## Testing Checklist

After DNS configuration:

- [ ] `dig pleb.one` returns correct IP
- [ ] `dig relay.pleb.one` returns correct IP
- [ ] `curl https://pleb.one` returns 200 OK
- [ ] `curl https://relay.pleb.one` returns 200 OK
- [ ] SSL certificates are valid (no browser warnings)
- [ ] `curl https://pleb.one/.well-known/nostr.json?name=test` returns JSON
- [ ] CORS header present: `curl -I https://pleb.one/.well-known/nostr.json?name=test | grep -i access`

## What IP Addresses Do I Use?

### Find your server's public IP:

**On the server:**
```bash
# Get public IPv4
curl -4 ifconfig.me

# Get public IPv6
curl -6 ifconfig.me

# Alternative
curl icanhazip.com
```

**From your local machine:**
```bash
# SSH to server and run
ssh user@server "curl ifconfig.me"
```

**In your cloud provider dashboard:**
- AWS: EC2 → Instances → Public IPv4 address
- DigitalOcean: Droplets → Your droplet → ipv4
- Linode: Linodes → Your linode → IP Addresses
- Vultr: Servers → Your server → Main IP

## Summary

### For Same Server Setup:
```
pleb.one        →  <server-ip>
relay.pleb.one  →  <server-ip>
```

### For Two Server Setup:
```
pleb.one        →  <main-server-ip>
relay.pleb.one  →  <relay-server-ip>
```

### After DNS Setup:
1. Wait 5-60 minutes for propagation
2. Caddy will auto-issue SSL certificates
3. Test with: `curl https://pleb.one/.well-known/nostr.json?name=test`
4. Deploy NIP-05 application code
5. Test end-to-end with real user

---

**Need help?** Most DNS issues resolve within an hour. If problems persist, check:
1. DNS propagation: https://dnschecker.org/
2. Caddy logs: `docker logs <caddy-container>`
3. Firewall: Ports 80/443 open
