"use client";

import { nip04, finalizeEvent, type EventTemplate } from "nostr-tools";
import "@/types/nostr.d";

export type DmSendResult =
  | { success: true; eventId: string }
  | { success: false; error: string };

/**
 * Send an encrypted DM using NIP-07 browser extension
 */
export async function sendDmViaNip07(
  recipientPubkey: string,
  message: string,
  relays: string[]
): Promise<DmSendResult> {
  try {
    if (!window.nostr) {
      return { success: false, error: "NIP-07 extension not found" };
    }

    // Get sender's pubkey
    const senderPubkey = await window.nostr.getPublicKey();

    // Encrypt the message
    let encryptedContent: string;
    if (window.nostr.nip04?.encrypt) {
      encryptedContent = await window.nostr.nip04.encrypt(recipientPubkey, message);
    } else {
      return { success: false, error: "NIP-04 encryption not supported by extension" };
    }

    // Create the DM event
    const eventTemplate: EventTemplate = {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkey]],
      content: encryptedContent,
    };

    // Sign the event
    const signedEvent = await window.nostr.signEvent(eventTemplate);

    // Publish to relays
    const publishPromises = relays.map(async (relay) => {
      try {
        const ws = new WebSocket(relay);
        return new Promise<void>((resolve, reject) => {
          ws.onopen = () => {
            ws.send(JSON.stringify(["EVENT", signedEvent]));
            setTimeout(() => {
              ws.close();
              resolve();
            }, 1000);
          };
          ws.onerror = () => reject(new Error(`Failed to connect to ${relay}`));
        });
      } catch (err) {
        console.error(`Failed to publish to ${relay}:`, err);
      }
    });

    await Promise.allSettled(publishPromises);

    return { success: true, eventId: signedEvent.id };
  } catch (error) {
    console.error("Failed to send DM via NIP-07:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if NIP-07 extension is available
 */
export function isNip07Available(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}
