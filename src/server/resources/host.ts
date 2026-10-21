import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Host metrics read from a read-only bind mount of the host's /proc
 * (HOST_PROC_PATH, default /host/proc) and a path on the data disk
 * (HOST_DISK_PATH, default /host/pgdata). When a mount is missing (e.g. local
 * dev) the corresponding fields are null ("unavailable") instead of throwing.
 */

const HOST_PROC = process.env.HOST_PROC_PATH ?? "/host/proc";
const HOST_DISK = process.env.HOST_DISK_PATH ?? "/host/pgdata";

// Virtual interfaces excluded from the network totals (docker bridges, veths, loopback).
const IGNORED_IFACES = /^(lo|veth|docker|br-|virbr)/;

export interface HostMetrics {
  memory: { usedBytes: number; totalBytes: number } | null;
  swap: { usedBytes: number; totalBytes: number } | null;
  disk: { usedBytes: number; freeBytes: number; totalBytes: number } | null;
  load: { one: number; five: number; fifteen: number } | null;
  cpuCores: number | null;
  uptimeSeconds: number | null;
  network: {
    rxBytes: number;
    txBytes: number;
    rxBytesPerSec: number | null;
    txBytesPerSec: number | null;
    scope: "host" | "container";
  } | null;
}

async function readProc(file: string) {
  try {
    return await fs.readFile(path.join(/*turbopackIgnore: true*/ HOST_PROC, file), "utf8");
  } catch {
    return null;
  }
}

function parseMeminfo(text: string) {
  const kb = (key: string) => {
    const match = new RegExp(`^${key}:\\s+(\\d+)`, "m").exec(text);
    return match ? Number(match[1]) * 1024 : null;
  };
  const memTotal = kb("MemTotal");
  const memAvailable = kb("MemAvailable");
  const swapTotal = kb("SwapTotal");
  const swapFree = kb("SwapFree");
  return {
    memory:
      memTotal !== null && memAvailable !== null
        ? { usedBytes: memTotal - memAvailable, totalBytes: memTotal }
        : null,
    swap:
      swapTotal !== null && swapFree !== null
        ? { usedBytes: swapTotal - swapFree, totalBytes: swapTotal }
        : null,
  };
}

function parseNetDev(text: string) {
  let rx = 0;
  let tx = 0;
  for (const line of text.split("\n").slice(2)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const iface = line.slice(0, idx).trim();
    if (IGNORED_IFACES.test(iface)) continue;
    const fields = line.slice(idx + 1).trim().split(/\s+/).map(Number);
    rx += fields[0] ?? 0;
    tx += fields[8] ?? 0;
  }
  return { rx, tx };
}

let lastNet: { at: number; rx: number; tx: number } | null = null;
let lastRate: { rx: number; tx: number } | null = null;

async function readNetwork(): Promise<HostMetrics["network"]> {
  // /proc/net is per network namespace. PID 1's view is the host namespace;
  // fall back to our own (container) namespace if that is not readable.
  let scope: "host" | "container" = "host";
  let text = await readProc("1/net/dev");
  if (!text) {
    scope = "container";
    text = await readProc("net/dev");
  }
  if (!text) return null;

  const { rx, tx } = parseNetDev(text);
  const now = Date.now();
  if (lastNet && now - lastNet.at >= 5000 && rx >= lastNet.rx && tx >= lastNet.tx) {
    const secs = (now - lastNet.at) / 1000;
    lastRate = { rx: (rx - lastNet.rx) / secs, tx: (tx - lastNet.tx) / secs };
  }
  if (!lastNet || now - lastNet.at >= 5000) lastNet = { at: now, rx, tx };

  return {
    rxBytes: rx,
    txBytes: tx,
    rxBytesPerSec: lastRate ? Math.round(lastRate.rx) : null,
    txBytesPerSec: lastRate ? Math.round(lastRate.tx) : null,
    scope,
  };
}

async function readDisk(): Promise<HostMetrics["disk"]> {
  try {
    const stats = await fs.statfs(/*turbopackIgnore: true*/ HOST_DISK);
    const totalBytes = stats.blocks * stats.bsize;
    return {
      totalBytes,
      usedBytes: (stats.blocks - stats.bfree) * stats.bsize,
      freeBytes: stats.bavail * stats.bsize,
    };
  } catch {
    return null;
  }
}

export async function readHostMetrics(): Promise<HostMetrics> {
  const [meminfo, loadavg, uptime, stat, network, disk] = await Promise.all([
    readProc("meminfo"),
    readProc("loadavg"),
    readProc("uptime"),
    readProc("stat"),
    readNetwork(),
    readDisk(),
  ]);

  const mem = meminfo ? parseMeminfo(meminfo) : { memory: null, swap: null };

  let load: HostMetrics["load"] = null;
  if (loadavg) {
    const [one, five, fifteen] = loadavg.split(/\s+/).map(Number);
    if ([one, five, fifteen].every((n) => Number.isFinite(n))) {
      load = { one: one!, five: five!, fifteen: fifteen! };
    }
  }

  const uptimeSeconds = uptime ? Math.floor(Number(uptime.split(/\s+/)[0])) : null;
  const cpuCores = stat ? (stat.match(/^cpu\d+\s/gm)?.length ?? null) : null;

  return {
    memory: mem.memory,
    swap: mem.swap,
    disk,
    load,
    cpuCores,
    uptimeSeconds: Number.isFinite(uptimeSeconds) ? uptimeSeconds : null,
    network,
  };
}
