import "server-only";

import { readHostMetrics, type HostMetrics } from "./host";
import {
  checkServices,
  readPostgresStats,
  readRedisStats,
  readRelayStats,
  type ServiceStatus,
} from "./services";

/**
 * One shared snapshot of everything the Resources view shows, cached briefly
 * so concurrent dashboard polls cost a single round of reads.
 */

const SNAPSHOT_TTL_MS = 15_000;
const DISK_DEGRADED_PERCENT = 90;
const MEMORY_DEGRADED_PERCENT = 95;

export interface ResourceSnapshot {
  collectedAt: string;
  status: "healthy" | "degraded";
  issues: string[];
  host: HostMetrics;
  services: ServiceStatus[];
  postgres: { sizeBytes: number | null; eventCount: number | null };
  redis: Awaited<ReturnType<typeof readRedisStats>>;
  relay: Awaited<ReturnType<typeof readRelayStats>>;
}

const percent = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);

async function buildSnapshot(): Promise<ResourceSnapshot> {
  const [host, services, postgres, redis, relay] = await Promise.all([
    readHostMetrics(),
    checkServices(),
    readPostgresStats(),
    readRedisStats(),
    readRelayStats(),
  ]);

  const issues: string[] = [];
  for (const service of services) {
    if (service.state === "down") issues.push(`${service.name} unreachable`);
  }
  if (host.disk && percent(host.disk.usedBytes, host.disk.totalBytes) >= DISK_DEGRADED_PERCENT) {
    issues.push(`disk above ${DISK_DEGRADED_PERCENT}%`);
  }
  if (host.memory && percent(host.memory.usedBytes, host.memory.totalBytes) >= MEMORY_DEGRADED_PERCENT) {
    issues.push(`memory above ${MEMORY_DEGRADED_PERCENT}%`);
  }

  return {
    collectedAt: new Date().toISOString(),
    status: issues.length === 0 ? "healthy" : "degraded",
    issues,
    host,
    services,
    postgres,
    redis,
    relay,
  };
}

let cached: { at: number; snapshot: Promise<ResourceSnapshot> } | null = null;

export function collectSnapshot(opts: { fresh?: boolean } = {}): Promise<ResourceSnapshot> {
  if (!opts.fresh && cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) {
    return cached.snapshot;
  }
  const snapshot = buildSnapshot();
  cached = { at: Date.now(), snapshot };
  snapshot.catch(() => {
    cached = null;
  });
  return snapshot;
}

/** The non-sensitive subset shown to regular members. */
export async function collectSummary() {
  const snap = await collectSnapshot();
  const disk = snap.host.disk;
  return {
    status: snap.status,
    uptimeSeconds: snap.host.uptimeSeconds,
    diskPercentUsed: disk ? Math.round(percent(disk.usedBytes, disk.totalBytes)) : null,
    eventsStored: snap.postgres.eventCount,
  };
}
