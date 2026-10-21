import "server-only";

import { isRedisConfigured, redisPipeline } from "./redis";
import { collectSnapshot } from "./snapshot";

/**
 * 24h of one-minute samples in a capped Redis list (LPUSH + LTRIM + EXPIRE).
 * ~150 bytes per sample, so the list stays under ~250 KB. Responses are
 * downsampled before they reach the browser.
 */

const HISTORY_KEY = "resources:history";
const MAX_SAMPLES = 24 * 60;
const SAMPLE_INTERVAL_MS = 60_000;
const RESPONSE_POINTS = 144; // one point per 10 minutes over 24h

interface Sample {
  t: number;
  mem: number | null; // memory used, bytes
  swap: number | null; // swap used, bytes
  disk: number | null; // disk used, bytes
  pg: number | null; // postgres database size, bytes
  load: number | null; // 1-minute load average
  rx: number | null; // bytes/sec
  tx: number | null; // bytes/sec
  conns: number | null; // open relay websocket connections
}

async function recordSample() {
  const snap = await collectSnapshot({ fresh: true });
  const sample: Sample = {
    t: Date.now(),
    mem: snap.host.memory?.usedBytes ?? null,
    swap: snap.host.swap?.usedBytes ?? null,
    disk: snap.host.disk?.usedBytes ?? null,
    pg: snap.postgres.sizeBytes,
    load: snap.host.load?.one ?? null,
    rx: snap.host.network?.rxBytesPerSec ?? null,
    tx: snap.host.network?.txBytesPerSec ?? null,
    conns: snap.relay?.connections ?? null,
  };
  await redisPipeline([
    ["LPUSH", HISTORY_KEY, JSON.stringify(sample)],
    ["LTRIM", HISTORY_KEY, "0", String(MAX_SAMPLES - 1)],
    ["EXPIRE", HISTORY_KEY, String(25 * 60 * 60)],
  ]);
}

const globalForSampler = globalThis as unknown as { resourcesSampler?: ReturnType<typeof setInterval> };

/** Starts the once-a-minute sampler (idempotent). No-op without Redis or with RESOURCES_HISTORY=0. */
export function startResourceSampler() {
  if (globalForSampler.resourcesSampler) return;
  if (process.env.RESOURCES_HISTORY === "0" || !isRedisConfigured()) return;

  const tick = () => {
    recordSample().catch(() => {
      // Sampling is best effort; a failed minute just leaves a gap.
    });
  };
  tick();
  globalForSampler.resourcesSampler = setInterval(tick, SAMPLE_INTERVAL_MS);
  globalForSampler.resourcesSampler.unref?.();
}

type SeriesKey = Exclude<keyof Sample, "t">;
const SERIES: SeriesKey[] = ["mem", "swap", "disk", "pg", "load", "rx", "tx", "conns"];

export async function readHistory() {
  if (!isRedisConfigured()) return { available: false as const };
  let raw: string[];
  try {
    const [reply] = await redisPipeline([["LRANGE", HISTORY_KEY, "0", String(MAX_SAMPLES - 1)]]);
    raw = Array.isArray(reply) ? reply.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return { available: false as const };
  }

  const samples: Sample[] = [];
  for (const item of raw) {
    try {
      samples.push(JSON.parse(item) as Sample);
    } catch {
      // skip malformed entries
    }
  }
  samples.reverse(); // oldest first

  // Average samples into fixed buckets so the payload stays small.
  const bucketSize = Math.max(1, Math.ceil(samples.length / RESPONSE_POINTS));
  const t: number[] = [];
  const series = Object.fromEntries(SERIES.map((k) => [k, [] as (number | null)[]])) as Record<
    SeriesKey,
    (number | null)[]
  >;
  for (let i = 0; i < samples.length; i += bucketSize) {
    const bucket = samples.slice(i, i + bucketSize);
    t.push(bucket[bucket.length - 1]!.t);
    for (const key of SERIES) {
      const values = bucket.map((s) => s[key]).filter((v): v is number => typeof v === "number");
      series[key].push(values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null);
    }
  }

  return { available: true as const, sampleCount: samples.length, t, series };
}
