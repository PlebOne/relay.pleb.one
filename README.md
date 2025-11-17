# relay.pleb.one

A premium Nostr relay and Blossom host built with the T3 stack (Next.js 15, tRPC, Prisma, Tailwind). It combines a cypherpunk-styled marketing site, subscription management, Lightning payments, a modular relay server, and S3-backed Blossom storage.

---

## Contents

1. [Highlights](#highlights)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Getting started](#getting-started)
5. [Environment](#environment)
6. [NIP coverage](#nip-coverage)
7. [Payments and Blossom](#payments-and-blossom)
8. [Deployment](#deployment)
9. [Contributing](#contributing)
10. [License](#license)

---

## Highlights

- Premium Nostr relay with modular NIP handlers and a custom WebSocket server
- Integrated Blossom image storage (EXIF removal, S3 backends, upload quotas)
- Lightning-enabled subscriptions with pluggable providers (LND, LNURL, mock)
- NextAuth-powered login (NIP-07 + password fallback) and dashboard analytics
- Tailwind-driven, terminal-inspired UI tuned for cypherpunk aesthetics
- Docker-first deployment with optional Caddy reverse proxy

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Next.js 15 App Router, React 18, Tailwind CSS |
| API        | tRPC 11, NextAuth, Zod, TanStack Query |
| Database   | PostgreSQL + Prisma ORM |
| Relay      | Custom TypeScript server using `ws`, modular NIP registry |
| Payments   | Lightning (LND, LNURL), bcrypt-secured credentials |
| Storage    | S3-compatible buckets for Blossom artifacts |
| Tooling    | ESLint, TypeScript 5.6, Docker, Caddy |

## Architecture

```
src/
├── app/                Next.js routes (landing, login, dashboard, docs)
├── components/         Reusable UI (cypherpunk widgets, dashboard feed)
├── lib/                Payments, storage, Blossom helpers
├── relay/              WebSocket relay server + NIP modules
├── server/             tRPC routers, auth, Prisma client
├── styles/             Tailwind globals and theme tokens
└── env.js              Runtime-safe environment loader
```

Relay-specific notes:
- `relay/types.ts` defines canonical Nostr events, filters, and relay info documents.
- Each NIP lives under `relay/nips/<nipXX>.ts` and extends `BaseNIP`.
- `relay/server.ts` wires WebSocket handling, rate limiting, auth, and broadcasting.

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local or remote)
- (Optional) Lightning node credentials (LND macaroon + endpoint, or LNURL)
- (Optional) S3-compatible bucket for Blossom uploads

### Setup

```bash
git clone <this repo> relay.pleb.one
cd relay.pleb.one
cp .env.example .env    # fill in secrets and endpoints
npm install
npm run db:push         # Prisma migrate (safe for dev)
```

### Run locally

```bash
# Terminal 1 – Next.js app (marketing site + dashboard + API routes)
npm run dev

# Terminal 2 – Relay WebSocket server
npm run relay:dev
```

Useful scripts:
- `npm run lint` – ESLint (currently warns about unfinished Blossom helpers)
- `npm run build` – Production Next.js build (also runs lint/typecheck)
- `npm run relay:dev` – Watch mode for the relay server via `tsx`

## Environment

Configuration is entirely `.env`-driven. Key groups (see `.env.example` for the exhaustive list):

- **Database**: `DATABASE_URL`, `DIRECT_URL`
- **Auth**: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_NPUB`
- **Payments**: `LIGHTNING_NODE_URL`, `LIGHTNING_MACAROON`, `LNURL_ENDPOINT`
- **Blossom**: `BLOSSOM_BUCKET`, `BLOSSOM_REGION`, `AWS_ACCESS_KEY_ID`, etc.
- **Relay**: `RELAY_PORT`, `MAX_EVENT_SIZE`, rate limits
- **UI/Meta**: `RELAY_NAME`, `RELAY_DESCRIPTION`, contact info

## NIP coverage

| NIP | Status | Notes |
|-----|--------|-------|
| 01  | ✅ | Core protocol (events, filters, signatures) |
| 09  | ✅ | Deletion requests (kind 5) |
| 11  | ✅ | Relay info document (served over HTTP) |
| 17  | 🚧 | Private DMs scaffolded for future work |
| 23  | 🚧 | Long-form content plumbing |
| 40  | 🚧 | Expiration tag support |
| 42  | 🚧 | Client authentication (AUTH flow) |
| 50  | 🚧 | Search filter field |
| 51  | ✅ | Lists and sets (follows, bookmarks, relay sets) |
| 56  | 🚧 | Reporting (kind 1984) |
| 62  | � | Request to vanish |
| 77  | 🚧 | Negentropy syncing |
| 86  | 🚧 | Relay management API |

Adding a NIP involves subclassing `BaseNIP`, implementing validation and filter hooks, and registering it inside `NostrRelayServer.registerNIPs()`.

## Payments and Blossom

- `lib/payments/providers.ts` exposes an abstract provider plus implementations for LND, LNURL, and a mock dev provider. `PaymentManager` selects the best available provider based on environment variables.
- `lib/blossom/server.ts` handles uploads, metadata sanitization, EXIF stripping, and integration with S3-compatible storage.
- Subscription SKUs (relay, blossom, combo) are defined in the pricing UI and mirrored in payment logic.

## Deployment

### Docker Compose

```bash
docker compose up --build -d
```

The included compose file starts the Next.js app, relay server, Prisma migrations, and Caddy (TLS + reverse proxy). Adjust volumes/secrets before going to production.

### Manual

1. Build the Next.js bundle: `npm run build`
2. Run `npm start` for the frontend/API
3. Launch the relay server via `node dist/relay/server.js` or `npm run relay:dev` with `NODE_ENV=production`
4. Point Caddy (or nginx) at port 3000 + the relay WebSocket port. Caddyfile contains sane defaults.

**Typed routes note:** Next.js 15.5 warns that `experimental.typedRoutes` moved to `typedRoutes`. Update `next.config.js` when upgrading to keep typed links enabled.

## Contributing

Contributions are welcome. Areas that benefit most:
- Finish outstanding NIP implementations (42, 50, 56, 62, 77, 86)
- Harden relay rate limiting and auth flows
- Expand payment providers or add fiat on-ramps
- Polish the dashboard (charts, alerts, logs)
- Improve Blossom tooling (virus scanning, CDN integration)

Please open an issue before large changes and follow conventional commits if possible.

## License

MIT License. See `LICENSE` for details.

---

For support, reach out via the contact defined in `RELAY_CONTACT` or open a GitHub issue once the repo is published.