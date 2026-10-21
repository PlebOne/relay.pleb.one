import "server-only";
import net from "node:net";

/**
 * Minimal Redis client (RESP over a short-lived TCP connection) for the
 * Resources view: INFO, PING and a capped history list. Avoids pulling in a
 * Redis library for a handful of commands a minute.
 *
 * Connection comes from REDIS_URL (redis://[user:pass@]host:port[/db]) with
 * REDIS_PASSWORD taking precedence when set. Errors never include the URL or
 * credentials.
 */

export type RedisReply = string | number | null | RedisReply[] | Error;

interface RedisTarget {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
}

function redisTarget(): RedisTarget | null {
  const raw = process.env.REDIS_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "redis:") return null;
    const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;
    return {
      host: url.hostname || "localhost",
      port: Number(url.port) || 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: process.env.REDIS_PASSWORD || (url.password ? decodeURIComponent(url.password) : undefined),
      db: db !== undefined && Number.isInteger(db) && db > 0 ? db : undefined,
    };
  } catch {
    return null;
  }
}

export function isRedisConfigured() {
  return redisTarget() !== null;
}

function encodeCommand(args: string[]) {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    out += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
  }
  return out;
}

/** Parses one reply starting at `off`. Returns undefined if the buffer is incomplete. */
function parseReply(buf: Buffer, off: number): [RedisReply, number] | undefined {
  if (off >= buf.length) return undefined;
  const lineEnd = buf.indexOf("\r\n", off);
  if (lineEnd === -1) return undefined;
  const type = String.fromCharCode(buf[off]!);
  const line = buf.toString("utf8", off + 1, lineEnd);
  const next = lineEnd + 2;

  switch (type) {
    case "+":
      return [line, next];
    case "-":
      return [new Error(line), next];
    case ":":
      return [Number(line), next];
    case "$": {
      const len = Number(line);
      if (len < 0) return [null, next];
      if (buf.length < next + len + 2) return undefined;
      return [buf.toString("utf8", next, next + len), next + len + 2];
    }
    case "*": {
      const count = Number(line);
      if (count < 0) return [null, next];
      const items: RedisReply[] = [];
      let pos = next;
      for (let i = 0; i < count; i++) {
        const parsed = parseReply(buf, pos);
        if (!parsed) return undefined;
        items.push(parsed[0]);
        pos = parsed[1];
      }
      return [items, pos];
    }
    default:
      throw new Error("Unexpected Redis reply");
  }
}

/** Sends the commands as one pipeline and resolves with one reply per command. */
export function redisPipeline(commands: string[][], timeoutMs = 2000): Promise<RedisReply[]> {
  const target = redisTarget();
  if (!target) return Promise.reject(new Error("Redis not configured"));

  const prelude: string[][] = [];
  if (target.password) {
    prelude.push(target.username ? ["AUTH", target.username, target.password] : ["AUTH", target.password]);
  }
  if (target.db !== undefined) prelude.push(["SELECT", String(target.db)]);
  const all = [...prelude, ...commands];

  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let offset = 0;
    const replies: RedisReply[] = [];
    let settled = false;

    const socket = net.createConnection({ host: target.host, port: target.port });
    const finish = (err: Error | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(replies.slice(prelude.length));
    };

    socket.setTimeout(timeoutMs, () => finish(new Error("Redis timeout")));
    socket.on("error", () => finish(new Error("Redis connection failed")));
    socket.on("connect", () => {
      socket.write(all.map(encodeCommand).join(""));
    });
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        for (;;) {
          const parsed = parseReply(buf, offset);
          if (!parsed) break;
          replies.push(parsed[0]);
          offset = parsed[1];
          if (replies.length === prelude.length && prelude.length > 0) {
            if (replies.some((r) => r instanceof Error)) {
              finish(new Error("Redis auth failed"));
              return;
            }
          }
        }
      } catch {
        finish(new Error("Redis protocol error"));
        return;
      }
      if (replies.length >= all.length) finish(null);
    });
    socket.on("close", () => finish(new Error("Redis connection closed")));
  });
}

/** Parses `INFO` output into a key/value map. */
export function parseRedisInfo(info: string) {
  const out: Record<string, string> = {};
  for (const line of info.split("\r\n")) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}
