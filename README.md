# relay.pleb.one

A public Nostr relay with whitelist-based access built with the T3 stack (Next.js 15, tRPC, Prisma, Tailwind) and a high-performance Rust backend. It combines a cypherpunk-styled marketing site, whitelist management, invite propagation, and a robust Rust relay server.

---

## Contents

1. [Highlights](#highlights)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Getting started](#getting-started)
5. [Environment](#environment)
6. [NIP coverage](#nip-coverage)
7. [Deployment](#deployment)
8. [Contributing](#contributing)
9. [License](#license)

---

## Highlights

- **High-Performance Rust Relay**: Built with Axum, Tokio, and SQLx for maximum speed and concurrency.
- **Whitelist Access Control**: Only whitelisted users can publish events.
- **Admin Dashboard**: Manage whitelist entries, notes, and invite quotas via the Next.js frontend.
- **User Invite System**: Whitelisted members can invite up to 5 friends (configurable).
- **Cypherpunk UI**: Tailwind-driven, terminal-inspired aesthetics.
- **Docker-First**: Easy deployment with Docker Compose.

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Next.js 15 App Router, React 18, Tailwind CSS |
| API        | tRPC 11, NextAuth, Zod, TanStack Query |
| Database   | PostgreSQL + Prisma ORM (Frontend) / SQLx (Backend) |
| Relay      | **Rust** (Axum, Tokio, SQLx, Nostr Crate) |
| Payments   | Lightning (LND, LNURL) scaffolding |
| Storage    | External object storage (optional) |
| Tooling    | Docker, Caddy, Cargo |

## Architecture

```
.
├── relay-rs/           Rust Relay Server (The Backend)
│   ├── src/            Rust source code
│   ├── Cargo.toml      Rust dependencies
│   └── Dockerfile      Rust container build
├── src/                Next.js Frontend & Admin Dashboard
│   ├── app/            Next.js routes
│   ├── components/     UI components
│   ├── server/         tRPC routers, auth, Prisma
│   └── ...
├── prisma/             Database schema
├── docker-compose.yml  Orchestration
└── ...
```

## Getting started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for frontend dev)
- Rust / Cargo (for backend dev)

### Setup

1. Clone the repo:
   ```bash
   git clone <this repo> relay.pleb.one
   cd relay.pleb.one
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your secrets and database credentials
   ```

### Run with Docker (Recommended)

The easiest way to run the full stack (Relay + Web App + DB + Redis) is via Docker Compose:

```bash
docker compose up --build -d
```

- Web App: http://localhost:3000
- Relay: ws://localhost:3001

### Run Locally (Dev Mode)

**1. Start Infrastructure (DB & Redis)**
```bash
docker compose up -d postgres redis
```

**2. Run Relay (Rust)**
```bash
cd relay-rs
export DATABASE_URL=postgresql://relay_user:relay_password_change_me@localhost:5432/relay_pleb_one
export RELAY_PORT=3001
cargo run
```

**3. Run Frontend (Next.js)**
```bash
# In a new terminal, root of repo
npm install
npm run db:push  # Sync DB schema
npm run dev
```

## Environment

Configuration is entirely `.env`-driven. Key variables:

- **Database**: `DATABASE_URL` (Used by both Prisma and Rust/SQLx)
- **Auth**: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_NPUB`
- **Relay**: `RELAY_PORT`


## NIP coverage

The Rust relay implements the following NIPs:

| NIP | Status | Notes |
|-----|--------|-------|
| 01  | ✅ | Core protocol (events, filters, signatures) |
| 11  | ✅ | Relay information document |
| 09  | 🚧 | Event Deletion (Planned) |
| 42  | 🚧 | Authentication (Planned) |

*Note: The relay enforces a strict whitelist policy. Only users present in the `users` table with `whitelistStatus: ACTIVE` (or admins) can publish events.*

## Payments

Payment scaffolding exists in `lib/payments` for future monetization (Lightning invoices, LNURL, etc.).

## Deployment

```bash
docker compose up -d --build
```

This starts:
- `relay-server`: The Rust backend (Port 3001)
- `relay-app`: The Next.js frontend (Port 3000)
- `relay-postgres`: Database
- `relay-redis`: Cache
- `relay-caddy`: Reverse proxy (Ports 80/443)

## Contributing

Contributions are welcome!
- **Frontend**: TypeScript/Next.js in `src/`
- **Backend**: Rust in `relay-rs/`

## License

MIT License.
