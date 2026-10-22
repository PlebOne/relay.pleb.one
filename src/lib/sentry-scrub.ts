/**
 * Shared Sentry scrubber (server, edge and browser).
 *
 * Removes or masks anything that could identify a user or leak a secret
 * before an event, transaction or breadcrumb leaves the process:
 * cookies, auth headers, query strings, request bodies, user email/ip,
 * email addresses, bearer tokens, JWTs, Nostr secret keys (nsec1 /
 * ncryptsec1 / 64-char hex) and values under sensitive-looking keys.
 *
 * Kept dependency-free (no @sentry/* imports) so it can be unit tested
 * with plain node.
 */

export const FILTERED = "[Filtered]";

const SENSITIVE_KEY =
  /passw(or)?d|^pass$|passphrase|secret|token|api[-_]?key|authori[sz]ation|cookie|session|nsec|privkey|priv[-_]?key|private[-_]?key|seed|mnemonic|macaroon|credential|^auth$|^dsn$|(^|[._])query(_string)?$|(^|[._])ip(_address)?$|client\.address|remote[._]?addr(ess)?|x-forwarded-for|x-real-ip/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /\b(bearer|basic|nostr)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const NSEC = /\b(nsec1|ncryptsec1)[02-9ac-hj-np-z]+/gi;
const HEX64 = /\b[0-9a-fA-F]{64}\b/g;
// Query strings in URLs embedded in free text ("GET /api/x?token=...").
const QUERY = /(\?)[^\s"'#]+/g;

const MAX_DEPTH = 20;

export function scrubString(value: string): string {
  return value
    .replace(JWT, FILTERED)
    .replace(BEARER, (_m, scheme: string) => `${scheme} ${FILTERED}`)
    .replace(NSEC, FILTERED)
    .replace(HEX64, FILTERED)
    .replace(EMAIL, FILTERED)
    .replace(QUERY, `?${FILTERED}`);
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Recursively scrub any JSON-ish value. Returns a new value; does not mutate. */
export function scrubValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_DEPTH) return FILTERED;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) && v != null && v !== "" ? FILTERED : scrubValue(v, depth + 1, seen);
  }
  return out;
}

type AnyRecord = Record<string, unknown>;

function scrubRequest(request: AnyRecord | undefined): AnyRecord | undefined {
  if (!request) return request;
  const r: AnyRecord = { ...request };
  delete r.cookies;
  delete r.data;
  delete r.query_string;
  delete r.env;
  if (typeof r.url === "string") r.url = r.url.split("?")[0]!.split("#")[0];
  if (r.headers && typeof r.headers === "object") {
    const headers: AnyRecord = {};
    for (const [k, v] of Object.entries(r.headers as AnyRecord)) {
      if (/^(cookie|set-cookie|authorization|proxy-authorization|x-forwarded-for|x-real-ip|forwarded)$/i.test(k)) continue;
      headers[k] = v;
    }
    r.headers = headers;
  }
  return scrubValue(r) as AnyRecord;
}

function scrubUser(user: AnyRecord | undefined): AnyRecord | undefined {
  if (!user) return undefined;
  // Keep only an opaque id (and never if it looks like an email/key).
  if (user.id == null) return undefined;
  const id = scrubString(String(user.id));
  return id === FILTERED ? undefined : { id };
}

/**
 * Scrub a Sentry event or transaction in place-compatible fashion: returns a
 * new object with sensitive data removed. Typed loosely so the same function
 * works for ErrorEvent and TransactionEvent in every runtime.
 */
export function scrubEvent<T>(event: T): T {
  if (!event || typeof event !== "object") return event;
  const e = { ...(event as AnyRecord) };

  e.request = scrubRequest(e.request as AnyRecord | undefined);
  e.user = scrubUser(e.user as AnyRecord | undefined);
  if (e.user === undefined) delete e.user;
  delete e.server_name;

  for (const key of ["message", "logentry", "exception", "extra", "contexts", "breadcrumbs", "tags", "transaction", "spans", "fingerprint"]) {
    if (key in e) e[key] = scrubValue(e[key]);
  }
  return e as T;
}

/**
 * Scrub a streamed span (`beforeSendSpan`, Sentry v11 default
 * `traceLifecycle: 'stream'`, where `beforeSendTransaction` is not called).
 * Ids and timestamps are kept; name, attributes and links are scrubbed.
 */
export function scrubSpan<T>(span: T): T {
  if (!span || typeof span !== "object") return span;
  const s = { ...(span as AnyRecord) };
  for (const key of ["name", "attributes", "links"]) {
    if (key in s) s[key] = scrubValue(s[key]);
  }
  return s as T;
}

/** Scrub a breadcrumb (message, data and fetch/xhr URLs). */
export function scrubBreadcrumb<T>(breadcrumb: T): T {
  if (!breadcrumb || typeof breadcrumb !== "object") return breadcrumb;
  const b = { ...(breadcrumb as AnyRecord) };
  // Console breadcrumbs echo arbitrary arguments; keep the level but drop args.
  if (b.category === "console" && b.data && typeof b.data === "object") {
    const data = { ...(b.data as AnyRecord) };
    delete data.arguments;
    b.data = data;
  }
  return scrubValue(b) as T;
}
