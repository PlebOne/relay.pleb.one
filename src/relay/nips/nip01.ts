import { BaseNIP } from "../nip-registry";
import { NostrEvent, Filter, RelayInfoFragment } from "../types";
import { verifyEvent } from "nostr-tools/pure";
import { db } from "@/server/db";

/**
 * NIP-01: Basic Protocol Flow Description
 * 
 * This is the foundational NIP that defines the basic Nostr protocol.
 * It handles basic event validation, storage, and retrieval.
 */
export class NIP01 extends BaseNIP {
  readonly nipNumber = 1;
  readonly name = "Basic Protocol Flow";
  readonly description = "Basic protocol flow description for Nostr";

  shouldHandle(event: NostrEvent): boolean {
    // NIP-01 handles all basic events
    return Boolean(event);
  }

  validateEvent(event: NostrEvent): { valid: boolean; reason?: string } {
    // Basic validation according to NIP-01
    
    // Check required fields
    if (!event.id || !event.pubkey || !event.sig) {
      return { valid: false, reason: "Missing required fields" };
    }
    
    // Validate pubkey format (64 hex chars)
    if (!/^[0-9a-fA-F]{64}$/.test(event.pubkey)) {
      return { valid: false, reason: "Invalid pubkey format" };
    }
    
    // Validate signature format (128 hex chars)
    if (!/^[0-9a-fA-F]{128}$/.test(event.sig)) {
      return { valid: false, reason: "Invalid signature format" };
    }
    
    // Validate timestamp (not in the future)
    const now = Math.floor(Date.now() / 1000);
    if (event.created_at > now + 60) { // Allow 1 minute clock skew
      return { valid: false, reason: "Event created in the future" };
    }
    
    // Verify cryptographic signature
    try {
      const isValid = verifyEvent(event);
      if (!isValid) {
        return { valid: false, reason: "Invalid signature" };
      }
    } catch (error) {
      console.error("Signature verification failed", error);
      return { valid: false, reason: "Signature verification failed" };
    }
    
    return { valid: true };
  }

  async processEvent(event: NostrEvent): Promise<void> {
    try {
      // Store the event in the database
      await db.event.upsert({
        where: { eventId: event.id },
        update: {
          // Update fields if needed
        },
        create: {
          eventId: event.id,
          pubkey: event.pubkey,
          kind: event.kind,
          content: event.content,
          tags: event.tags,
          sig: event.sig,
          createdAt: new Date(event.created_at * 1000),
        },
      });
    } catch (error) {
      console.error("Failed to store event:", error);
      throw error;
    }
  }

  shouldHandleFilter(filter: Filter): boolean {
    // NIP-01 handles basic filtering
    return Boolean(filter);
  }

  applyFilter(events: NostrEvent[], filter: Filter): NostrEvent[] {
    return events.filter(event => {
      // Apply basic NIP-01 filters
      
      // Filter by IDs
      if (filter.ids && !filter.ids.includes(event.id)) {
        return false;
      }
      
      // Filter by authors
      if (filter.authors && !filter.authors.includes(event.pubkey)) {
        return false;
      }
      
      // Filter by kinds
      if (filter.kinds && !filter.kinds.includes(event.kind)) {
        return false;
      }
      
      // Filter by timestamp
      if (filter.since && event.created_at < filter.since) {
        return false;
      }
      
      if (filter.until && event.created_at > filter.until) {
        return false;
      }
      
      // Filter by tags
      if (filter["#e"]) {
        const eTags = event.tags.filter(tag => tag[0] === "e").map(tag => tag[1]);
        if (!filter["#e"].some(id => eTags.includes(id))) {
          return false;
        }
      }
      
      if (filter["#p"]) {
        const pTags = event.tags.filter(tag => tag[0] === "p").map(tag => tag[1]);
        if (!filter["#p"].some(pubkey => pTags.includes(pubkey))) {
          return false;
        }
      }
      
      return true;
    });
  }

  getRelayInfo(): RelayInfoFragment {
    return {
      supported_nips: [1], // Will be merged with other NIPs
      software: "relay.pleb.one",
      version: "1.0.0",
    };
  }
}