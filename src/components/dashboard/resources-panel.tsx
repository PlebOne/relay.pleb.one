"use client";

import { type inferRouterOutputs } from "@trpc/server";

import { api } from "@/trpc/react";
import { type AppRouter } from "@/server/api/root";

type Detail = inferRouterOutputs<AppRouter>["resources"]["detail"];
type History = inferRouterOutputs<AppRouter>["resources"]["history"];

const card = "rounded-2xl border border-green-500/30 bg-black/70 p-5 shadow-lg shadow-green-500/10";
const label = "text-xs uppercase tracking-wide text-green-500/70";

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatRate(bytesPerSec: number | null | undefined) {
  if (bytesPerSec === null || bytesPerSec === undefined) return "measuring…";
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatUptime(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "unavailable";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? "unavailable" : new Intl.NumberFormat().format(value);

function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

function StatusBadge({ status }: { status: "healthy" | "degraded" }) {
  const healthy = status === "healthy";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
        healthy ? "border-green-500/50 text-green-400" : "border-yellow-500/50 text-yellow-400"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${healthy ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
      {status}
    </span>
  );
}

function Meter({ used, total }: { used: number; total: number }) {
  const value = pct(used, total);
  const color = value >= 90 ? "bg-red-500" : value >= 75 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded bg-green-900/30">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

/** Inline SVG sparkline; gaps (null) break the line. */
function Sparkline({ values }: { values: (number | null)[] | undefined }) {
  const points = values ?? [];
  const numeric = points.filter((v): v is number => v !== null);
  if (numeric.length < 2) return null;
  const width = 160;
  const height = 32;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;

  let d = "";
  let penDown = false;
  points.forEach((v, i) => {
    if (v === null) {
      penDown = false;
      return;
    }
    const x = (i * step).toFixed(1);
    const y = (height - 2 - ((v - min) / span) * (height - 4)).toFixed(1);
    d += `${penDown ? "L" : "M"}${x},${y} `;
    penDown = true;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-8 w-full text-green-400"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d.trim()} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({
  title,
  value,
  sub,
  children,
}: {
  title: string;
  value: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={card}>
      <p className={label}>{title}</p>
      <p className="mt-1 font-mono text-2xl text-white">{value}</p>
      {sub && <p className="mt-1 font-mono text-xs text-gray-400">{sub}</p>}
      {children}
    </div>
  );
}

function MemberSummary() {
  const { data, isLoading, error } = api.resources.summary.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="text-gray-400">Loading...</p>;
  if (error || !data) return <p className="text-red-400">Resource status unavailable.</p>;

  return (
    <div className="space-y-6">
      <div className={`${card} flex items-center justify-between`}>
        <h2 className="text-lg font-semibold text-green-400">Relay status</h2>
        <StatusBadge status={data.status} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat title="uptime" value={formatUptime(data.uptimeSeconds)} />
        <Stat
          title="disk used"
          value={data.diskPercentUsed === null ? "unavailable" : `${data.diskPercentUsed}%`}
        >
          {data.diskPercentUsed !== null && <Meter used={data.diskPercentUsed} total={100} />}
        </Stat>
        <Stat title="events stored" value={formatNumber(data.eventsStored)} />
      </div>
    </div>
  );
}

function growthLabel(series: (number | null)[] | undefined, times: number[] | undefined) {
  const points = (series ?? [])
    .map((v, i) => ({ v, t: times?.[i] }))
    .filter((p): p is { v: number; t: number } => p.v !== null && p.t !== undefined);
  if (points.length < 2) return undefined;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = last.v - first.v;
  const minutes = Math.round((last.t - first.t) / 60_000);
  const span = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${Math.max(1, minutes)}m`;
  return `${delta >= 0 ? "+" : "-"}${formatBytes(Math.abs(delta))} over ${span}`;
}

function AdminDetail() {
  const { data, isLoading, error } = api.resources.detail.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: history } = api.resources.history.useQuery(undefined, {
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) return <p className="text-gray-400">Loading...</p>;
  if (error || !data) return <p className="text-red-400">Resource metrics unavailable.</p>;

  return <AdminDetailView data={data} history={history} />;
}

function AdminDetailView({ data, history }: { data: Detail; history: History | undefined }) {
  const { host } = data;
  const series = history?.available ? history.series : undefined;
  const pgGrowth = growthLabel(series?.pg, history?.available ? history.t : undefined);

  return (
    <div className="space-y-6">
      <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h2 className="text-lg font-semibold text-green-400">Host &amp; services</h2>
          <p className="text-xs text-gray-500">
            Updated {new Date(data.collectedAt).toLocaleTimeString()} · refreshes every 30s
            {history && !history.available && " · history unavailable (Redis not configured)"}
          </p>
          {data.issues.length > 0 && (
            <ul className="mt-2 text-sm text-yellow-400">
              {data.issues.map((issue) => (
                <li key={issue}>• {issue}</li>
              ))}
            </ul>
          )}
        </div>
        <StatusBadge status={data.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Stat
          title="memory"
          value={host.memory ? `${formatBytes(host.memory.usedBytes)} / ${formatBytes(host.memory.totalBytes)}` : "unavailable"}
          sub={host.memory ? `${pct(host.memory.usedBytes, host.memory.totalBytes)}% used` : undefined}
        >
          {host.memory && <Meter used={host.memory.usedBytes} total={host.memory.totalBytes} />}
          <Sparkline values={series?.mem} />
        </Stat>

        <Stat
          title="swap"
          value={host.swap ? `${formatBytes(host.swap.usedBytes)} / ${formatBytes(host.swap.totalBytes)}` : "unavailable"}
          sub={host.swap && host.swap.totalBytes > 0 ? `${pct(host.swap.usedBytes, host.swap.totalBytes)}% used` : undefined}
        >
          {host.swap && host.swap.totalBytes > 0 && <Meter used={host.swap.usedBytes} total={host.swap.totalBytes} />}
          <Sparkline values={series?.swap} />
        </Stat>

        <Stat
          title="data disk"
          value={host.disk ? `${formatBytes(host.disk.usedBytes)} / ${formatBytes(host.disk.totalBytes)}` : "unavailable"}
          sub={host.disk ? `${formatBytes(host.disk.freeBytes)} free · ${pct(host.disk.usedBytes, host.disk.totalBytes)}% used` : undefined}
        >
          {host.disk && <Meter used={host.disk.usedBytes} total={host.disk.totalBytes} />}
          <Sparkline values={series?.disk} />
        </Stat>

        <Stat
          title="cpu load (1 / 5 / 15)"
          value={host.load ? `${host.load.one.toFixed(2)} / ${host.load.five.toFixed(2)} / ${host.load.fifteen.toFixed(2)}` : "unavailable"}
          sub={host.cpuCores !== null ? `${host.cpuCores} core${host.cpuCores === 1 ? "" : "s"}` : undefined}
        >
          <Sparkline values={series?.load} />
        </Stat>

        <Stat
          title={`network${host.network?.scope === "container" ? " (app container only)" : ""}`}
          value={host.network ? `↓ ${formatRate(host.network.rxBytesPerSec)}  ↑ ${formatRate(host.network.txBytesPerSec)}` : "unavailable"}
          sub={host.network ? `totals: ↓ ${formatBytes(host.network.rxBytes)} · ↑ ${formatBytes(host.network.txBytes)}` : undefined}
        >
          <Sparkline values={series?.rx} />
        </Stat>

        <Stat title="host uptime" value={formatUptime(host.uptimeSeconds)} />

        <Stat
          title="postgres"
          value={formatBytes(data.postgres.sizeBytes)}
          sub={`${formatNumber(data.postgres.eventCount)} events${pgGrowth ? ` · ${pgGrowth}` : ""}`}
        >
          <Sparkline values={series?.pg} />
        </Stat>

        <Stat
          title="redis memory"
          value={data.redis?.usedMemoryHuman ?? "unavailable"}
          sub={
            data.redis
              ? `maxmemory: ${data.redis.maxMemoryBytes ? data.redis.maxMemoryHuman : "unlimited"}`
              : undefined
          }
        />

        <Stat
          title="relay connections"
          value={formatNumber(data.relay?.connections)}
          sub={data.relay?.uptimeSeconds != null ? `relay up ${formatUptime(data.relay.uptimeSeconds)}` : undefined}
        >
          <Sparkline values={series?.conns} />
        </Stat>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h3 className="text-lg font-semibold text-green-400">Services</h3>
          <p className="text-xs text-gray-500">Health pings from the app container</p>
          <ul className="mt-3 space-y-2 font-mono text-sm">
            {data.services.map((service) => (
              <li key={service.name} className="flex items-center justify-between">
                <span className="text-gray-300">{service.name}</span>
                <span
                  className={
                    service.state === "up"
                      ? "text-green-400"
                      : service.state === "down"
                        ? "text-red-400"
                        : "text-gray-500"
                  }
                >
                  {service.state}
                  {service.latencyMs !== null && service.state === "up" ? ` · ${service.latencyMs}ms` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={card}>
          <h3 className="text-lg font-semibold text-green-400">TLS certificates</h3>
          <p className="text-xs text-gray-500">
            {data.tls.checkedAt ? `Checked ${new Date(data.tls.checkedAt).toLocaleString()} · cached 6h` : "Not checked yet"}
          </p>
          <ul className="mt-3 space-y-2 font-mono text-sm">
            {data.tls.certs.map((cert) => (
              <li key={cert.domain} className="flex items-center justify-between gap-2">
                <span className="truncate text-gray-300">{cert.domain}</span>
                <span
                  className={
                    cert.daysRemaining === null || !cert.valid
                      ? "text-red-400"
                      : cert.daysRemaining < 14
                        ? "text-yellow-400"
                        : "text-green-400"
                  }
                >
                  {cert.daysRemaining === null
                    ? "unreachable"
                    : `${cert.daysRemaining}d${cert.valid ? "" : " (invalid)"}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ResourcesPanel({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? <AdminDetail /> : <MemberSummary />;
}
