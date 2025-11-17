import { BaseNIP } from "../nip-registry";
import { NostrEvent, Filter, RelayInfoFragment } from "../types";
import { db } from "@/server/db";

/**
 * NIP-09: Event Deletion
 * 
 * This NIP handles event deletion requests.
 * A user can delete their own events by publishing a kind 5 event.
 */
export class NIP09 extends BaseNIP {
  readonly nipNumber = 9;
  readonly name = "Event Deletion";
  readonly description = "Event deletion requests";

  shouldHandle(event: NostrEvent): boolean {
    // Handle kind 5 (deletion) events
    return event.kind === 5;
  }

  validateEvent(event: NostrEvent): { valid: boolean; reason?: string } {
    if (event.kind !== 5) {
      return { valid: true }; // Not our concern
    }
    
    // Check that deletion event has proper tags
    const eTags = event.tags.filter((tag: string[]) => tag[0] === "e");
    if (eTags.length === 0) {
      return { valid: false, reason: "Deletion event must reference events to delete" };
    }
    
    return { valid: true };
  }

  async processEvent(event: NostrEvent): Promise<void> {
    if (event.kind !== 5) return;
    
    try {
      // Extract event IDs to delete
      const eventIdsToDelete = event.tags
        .filter((tag) => tag[0] === "e")
        .map((tag) => tag[1])
        .filter((id): id is string => Boolean(id)); // Remove empty IDs
      
      // Only allow users to delete their own events
      const eventsToDelete = await db.event.findMany({
        where: {
          eventId: { in: eventIdsToDelete },
          pubkey: event.pubkey, // Only delete own events
        },
      });
      
      if (eventsToDelete.length > 0) {
        await db.event.deleteMany({
          where: {
            id: { in: eventsToDelete.map(e => e.id) },
          },
        });
        
        console.log(`Deleted ${eventsToDelete.length} events for pubkey ${event.pubkey}`);
      }
      
      // Store the deletion event itself
      await db.event.create({
        data: {
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
      console.error("Failed to process deletion event:", error);
      throw error;
    }
  }

  shouldHandleFilter(filter: Filter): boolean {
    // Don't modify basic filtering for deletions
    void filter;
    return false;
  }

  applyFilter(events: NostrEvent[], filter: Filter): NostrEvent[] {
    void filter;
    return events; // No additional filtering
  }

  getRelayInfo(): RelayInfoFragment {
    return {
      supported_nips: [9],
    };
  }
}