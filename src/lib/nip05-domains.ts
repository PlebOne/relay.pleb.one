/**
 * NIP-05 domains served by this app. Users pick one in the dashboard;
 * /.well-known/nostr.json only answers on these hosts.
 * relay.pleb.one is the default and must stay first.
 */
export const NIP05_DOMAINS = [
  "relay.pleb.one",
  "id.pleb.one",
  "me.pleb.one",
  "nostr.pleb.one",
  "based.pleb.one",
] as const;

export type Nip05Domain = (typeof NIP05_DOMAINS)[number];

export const DEFAULT_NIP05_DOMAIN: Nip05Domain = "relay.pleb.one";

export function isNip05Domain(value: string): value is Nip05Domain {
  return (NIP05_DOMAINS as readonly string[]).includes(value);
}

/**
 * Resolve the request host: first X-Forwarded-Host value, else Host.
 * Lowercased, port stripped. Returns null if neither header is present.
 */
export function resolveRequestHost(headers: { get(name: string): string | null }): string | null {
  const raw = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host")?.trim();
  if (!raw) return null;
  return raw.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** The allowed NIP-05 domain for this request, or null if the host is not one of ours. */
export function nip05DomainFromHeaders(headers: { get(name: string): string | null }): Nip05Domain | null {
  const host = resolveRequestHost(headers);
  return host && isNip05Domain(host) ? host : null;
}
