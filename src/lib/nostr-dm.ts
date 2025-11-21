import "server-only";

import { SimplePool, finalizeEvent, getPublicKey, nip04, nip19 } from "nostr-tools";

import { env } from "@/env";
import { DEFAULT_RELAYS } from "@/lib/nostr";
import { buildWhitelistDmMessage } from "@/lib/whitelist-message";

const pool = new SimplePool();
const fallbackRelays = Array.from(
  new Set(
    [env.NEXT_PUBLIC_RELAY_URL, ...DEFAULT_RELAYS, "wss://relay.nostr.band"].filter(
      (url): url is string => Boolean(url && url.startsWith("ws")),
    ),
  ),
);

let cachedKeys: { priv: string; privBytes: Uint8Array; pub: string } | null = null;
let keyErrorLogged = false;

function getAdminKeys() {
  if (cachedKeys) return cachedKeys;

  const secret = env.ADMIN_DM_NSEC?.trim();
  if (!secret) {
    if (!keyErrorLogged) {
      console.warn("ADMIN_DM_NSEC not configured; skipping DM notifications.");
      keyErrorLogged = true;
    }
    return null;
  }

  try {
    const decoded = nip19.decode(secret);
    if (decoded.type !== "nsec") {
      throw new Error("ADMIN_DM_NSEC must be an nsec");
    }
    const priv = typeof decoded.data === "string" ? decoded.data : Buffer.from(decoded.data).toString("hex");
    const privBytes = Buffer.from(priv, "hex");
    const pub = getPublicKey(privBytes);
    cachedKeys = { priv, privBytes, pub };
    return cachedKeys;
  } catch (error) {
    console.error("Failed to decode ADMIN_DM_NSEC", error);
    keyErrorLogged = true;
    return null;
  }
}

type SendWhitelistDmOptions = {
  targetNpub?: string;
  messageOverride?: string;
};

export async function sendWhitelistDm(targetPubkey: string, opts?: SendWhitelistDmOptions) {
  try {
    const keys = getAdminKeys();
    if (!keys) {
      return { sent: false, error: "DM key unavailable" } as const;
    }

    const messageBody =
      opts?.messageOverride ??
      buildWhitelistDmMessage({
        relayUrl: env.NEXT_PUBLIC_RELAY_URL,
        loginUrl: process.env.NEXTAUTH_URL ?? undefined,
        relayName: env.RELAY_NAME,
      });

    const encryptedContent = await nip04.encrypt(keys.priv, targetPubkey, messageBody);
    const event = {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", targetPubkey]].concat(
        opts?.targetNpub ? [["npub", opts.targetNpub]] : [],
      ),
      content: encryptedContent,
      pubkey: keys.pub,
    };

    const signed = finalizeEvent(event, keys.privBytes);
    await pool.publish(fallbackRelays, signed);

    return { sent: true } as const;
  } catch (error) {
    console.error("Failed to send whitelist DM", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" } as const;
  }
}
