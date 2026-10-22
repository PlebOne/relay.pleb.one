// Unit test for src/lib/sentry-scrub.ts. Run: npm run test:sentry-scrub
// Imports the TypeScript module directly (node >= 22.18 strips types).
import assert from "node:assert/strict";
import { test } from "node:test";

import { FILTERED, scrubBreadcrumb, scrubEvent, scrubSpan, scrubString } from "../src/lib/sentry-scrub.ts";

const NSEC = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";
const NCRYPT = "ncryptsec1qgg9947rlpvqu76pj5ecreduf9jxhselq2nae2kghhvd5g7dgjtcxfqtd67p9m0w57lspw8gsq6yphnm8623nsl8xn9j4jdzz84zm3frztj3z7s35vpzmqf6ksu8r89qk5z2zxfmu5gv8th8wclt0h4p";
const HEX = "a".repeat(64);
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc_DEF-123";

test("masks secrets in free text", () => {
  const s = scrubString(
    `user bob@example.com key ${NSEC} enc ${NCRYPT} hex ${HEX} jwt ${JWT} Authorization: Bearer abc.def-123 at /api/x?token=zzz`,
  );
  for (const leak of ["bob@example.com", NSEC, NCRYPT, HEX, JWT, "abc.def-123", "token=zzz"]) {
    assert.ok(!s.includes(leak), `leaked ${leak} in ${s}`);
  }
  assert.ok(s.includes("/api/x?"));
});

test("leaves ordinary text alone", () => {
  assert.equal(scrubString("TypeError: x is undefined"), "TypeError: x is undefined");
  assert.equal(scrubString("npub1abc short hex deadbeef"), "npub1abc short hex deadbeef");
});

test("scrubs a full event recursively", () => {
  const event = {
    event_id: "0123456789abcdef0123456789abcdef",
    message: `login failed for alice@example.com`,
    server_name: "relay-app",
    user: { id: "u_42", email: "alice@example.com", ip_address: "1.2.3.4", username: "alice" },
    request: {
      url: "https://relay.pleb.one/api/auth/callback?code=secret#frag",
      query_string: "code=secret",
      cookies: { "next-auth.session-token": "abc" },
      data: { password: "hunter2" },
      headers: {
        Cookie: "next-auth.session-token=abc",
        "set-cookie": "x=1",
        Authorization: "Bearer xyz",
        "User-Agent": "Mozilla/5.0",
      },
    },
    exception: { values: [{ type: "Error", value: `bad key ${NSEC}` }] },
    extra: { nested: { deeper: { privkey: HEX, note: `see ${HEX}`, apiKey: "k", ok: 1 } }, seed: "words" },
    contexts: { app: { sessionToken: "s", nextauth_secret: "n" }, trace: { trace_id: "0123456789abcdef0123456789abcdef" } },
    tags: { email: "carol@example.com", route: "/dashboard" },
    breadcrumbs: [{ category: "fetch", data: { url: "/api/trpc/x?input=%7B%7D", status_code: 200 } }],
  };
  const out = scrubEvent(event);
  const json = JSON.stringify(out);

  for (const leak of ["@example.com", "hunter2", "next-auth.session-token", "xyz", NSEC, HEX, "code=secret", "1.2.3.4", "relay-app", "input=%7B%7D", "words"]) {
    assert.ok(!json.includes(leak), `leaked ${leak}`);
  }
  assert.deepEqual(out.user, { id: "u_42" });
  assert.equal(out.request.url, "https://relay.pleb.one/api/auth/callback");
  assert.equal(out.request.cookies, undefined);
  assert.equal(out.request.data, undefined);
  assert.equal(out.request.query_string, undefined);
  assert.deepEqual(out.request.headers, { "User-Agent": "Mozilla/5.0" });
  assert.equal(out.extra.nested.deeper.privkey, FILTERED);
  assert.equal(out.extra.nested.deeper.apiKey, FILTERED);
  assert.equal(out.extra.nested.deeper.ok, 1);
  assert.equal(out.contexts.app.sessionToken, FILTERED);
  assert.equal(out.contexts.trace.trace_id, "0123456789abcdef0123456789abcdef");
  assert.equal(out.tags.route, "/dashboard");
  // Does not mutate the input.
  assert.equal(event.user.email, "alice@example.com");
});

test("drops user entirely when no opaque id", () => {
  const out = scrubEvent({ user: { email: "a@b.co", ip_address: "{{auto}}" } });
  assert.equal("user" in out, false);
});

test("scrubs breadcrumbs and drops console arguments", () => {
  const b = scrubBreadcrumb({
    category: "console",
    message: `nsec is ${NSEC}`,
    data: { arguments: ["secret thing"], logger: "console" },
  });
  assert.ok(!JSON.stringify(b).includes(NSEC));
  assert.ok(!JSON.stringify(b).includes("secret thing"));
});

test("handles circular references", () => {
  const a = { name: "x" };
  a.self = a;
  assert.doesNotThrow(() => scrubEvent({ extra: a }));
});

test("scrubs streamed span attributes", () => {
  const span = {
    trace_id: "0123456789abcdef0123456789abcdef",
    span_id: "0123456789abcdef",
    name: "GET /api/auth/callback?code=abc",
    start_timestamp: 1,
    status: "ok",
    is_segment: true,
    attributes: {
      "url.full": "https://relay.pleb.one/api/x?token=zzz",
      "url.query": "token=zzz",
      "http.request.header.cookie": "next-auth.session-token=abc",
      "client.address": "1.2.3.4",
      "user.ip_address": "1.2.3.4",
      "user.email": "dave@example.com",
      "http.response.status_code": 200,
      "http.route": "/api/x",
    },
  };
  const out = scrubSpan(span);
  const json = JSON.stringify(out);
  for (const leak of ["token=zzz", "code=abc", "session-token=abc", "1.2.3.4", "dave@example.com"]) {
    assert.ok(!json.includes(leak), `leaked ${leak}`);
  }
  assert.equal(out.trace_id, span.trace_id);
  assert.equal(out.span_id, span.span_id);
  assert.equal(out.attributes["http.response.status_code"], 200);
  assert.equal(out.attributes["http.route"], "/api/x");
});
