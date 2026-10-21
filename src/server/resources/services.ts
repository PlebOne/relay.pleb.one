import "server-only";
import net from "node:net";
import tls from "node:tls";

import { db } from "@/server/db";
import { NIP05_DOMAINS } from "@/lib/nip05-domains";
import { isRedisConfigured, parseRedisInfo, redisPipeline } from "./redis";

/**
 * Service health via cheap pings from the app container (no Docker socket):
 * Postgres `SELECT 1`, Redis `PING`, TCP connects to the relay and Caddy.
 */

const RELAY_HOST = process.env.RELAY_INTERNAL_HOST ?? "relay";
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 3001);
const RELAY_STATS_URL = process.env.RELAY_STATS_URL ?? `http://${RELAY_HOST}:3002/stats`;
const CADDY_HOST = process.env.CADDY_INTERNAL_HOST ?? "caddy";

const CHECK_TIMEOUT_MS = 2000;
const TLS_CACHE_MS = 6 * 60 * 60 * 1000;

export type ServiceName = "app" | "relay" | "postgres" | "redis" | "caddy";
export type ServiceState = "up" | "down" | "unconfigured";

export interface ServiceStatus {
  name: ServiceName;
  state: ServiceState;
  latencyMs: number | null;
}

function withTimeout<T>(promise: Promise<T>, ms = CHECK_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error("failed"));
      },
    );
  });
}

function tcpPing(host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(CHECK_TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", () => {
      socket.destroy();
      reject(new Error("unreachable"));
    });
  });
}

async function timed(name: ServiceName, check: () => Promise<unknown>): Promise<ServiceStatus> {
  const started = Date.now();
  try {
    await withTimeout(check());
    return { name, state: "up", latencyMs: Date.now() - started };
  } catch {
    return { name, state: "down", latencyMs: null };
  }
}

export async function checkServices(): Promise<ServiceStatus[]> {
  const redisCheck: Promise<ServiceStatus> = isRedisConfigured()
    ? timed("redis", async () => {
        const [reply] = await redisPipeline([["PING"]]);
        if (reply !== "PONG") throw new Error("bad reply");
      })
    : Promise.resolve({ name: "redis", state: "unconfigured", latencyMs: null });

  return Promise.all([
    Promise.resolve<ServiceStatus>({ name: "app", state: "up", latencyMs: 0 }),
    timed("relay", () => tcpPing(RELAY_HOST, RELAY_PORT)),
    timed("postgres", () => db.$queryRaw`SELECT 1`),
    redisCheck,
    timed("caddy", () => tcpPing(CADDY_HOST, 80)),
  ]);
}

export async function readPostgresStats() {
  try {
    const [sizeRows, eventCount] = await withTimeout(
      Promise.all([
        db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
        db.event.count(),
      ]),
      5000,
    );
    const size = sizeRows[0]?.size;
    return { sizeBytes: size !== undefined ? Number(size) : null, eventCount };
  } catch {
    return { sizeBytes: null, eventCount: null };
  }
}

export async function readRedisStats() {
  if (!isRedisConfigured()) return null;
  try {
    const [reply] = await redisPipeline([["INFO", "memory"]]);
    if (typeof reply !== "string") return null;
    const info = parseRedisInfo(reply);
    const used = Number(info.used_memory);
    const max = Number(info.maxmemory);
    return {
      usedMemoryBytes: Number.isFinite(used) ? used : null,
      usedMemoryHuman: info.used_memory_human ?? null,
      maxMemoryBytes: Number.isFinite(max) ? max : null,
      maxMemoryHuman: info.maxmemory_human ?? null,
    };
  } catch {
    return null;
  }
}

export async function readRelayStats() {
  try {
    const res = await fetch(RELAY_STATS_URL, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { connections?: unknown; uptime_seconds?: unknown };
    return {
      connections: typeof body.connections === "number" ? body.connections : null,
      uptimeSeconds: typeof body.uptime_seconds === "number" ? body.uptime_seconds : null,
    };
  } catch {
    return null;
  }
}

export interface CertStatus {
  domain: string;
  expiresAt: string | null;
  daysRemaining: number | null;
  valid: boolean;
}

function checkCert(domain: string) {
  return new Promise<CertStatus>((resolve) => {
    const socket = tls.connect({
      host: domain,
      port: 443,
      servername: domain,
      // Read the certificate even if it is invalid; validity is reported separately.
      rejectUnauthorized: false,
      timeout: 5000,
    });
    const done = (status: Omit<CertStatus, "domain">) => {
      socket.destroy();
      resolve({ domain, ...status });
    };
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const expires = cert?.valid_to ? new Date(cert.valid_to) : null;
      if (!expires || Number.isNaN(expires.getTime())) {
        done({ expiresAt: null, daysRemaining: null, valid: false });
        return;
      }
      done({
        expiresAt: expires.toISOString(),
        daysRemaining: Math.floor((expires.getTime() - Date.now()) / 86_400_000),
        valid: socket.authorized,
      });
    });
    socket.once("timeout", () => done({ expiresAt: null, daysRemaining: null, valid: false }));
    socket.once("error", () => done({ expiresAt: null, daysRemaining: null, valid: false }));
  });
}

const TLS_RETRY_MS = 10 * 60 * 1000;

let certCache: { at: number; ttl: number; certs: CertStatus[] } | null = null;
let certInFlight: Promise<CertStatus[]> | null = null;

/** TLS expiry for the relay/NIP-05 domains, refreshed at most every 6 hours. */
export async function readCertStatus(): Promise<{ checkedAt: string | null; certs: CertStatus[] }> {
  if (!certCache || Date.now() - certCache.at > certCache.ttl) {
    certInFlight ??= Promise.all(NIP05_DOMAINS.map(checkCert)).finally(() => {
      certInFlight = null;
    });
    const certs = await certInFlight;
    // If every handshake failed (e.g. no outbound network), retry sooner.
    const ttl = certs.some((c) => c.expiresAt) ? TLS_CACHE_MS : TLS_RETRY_MS;
    certCache = { at: Date.now(), ttl, certs };
  }
  return { checkedAt: new Date(certCache.at).toISOString(), certs: certCache.certs };
}
