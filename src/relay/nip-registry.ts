import { NostrEvent, Filter, RelayInfoDocument, RelayInfoFragment } from "./types";

/**
 * Base NIP interface that all NIPs must implement
 * This modular approach makes it easy to add new NIPs
 */
export abstract class BaseNIP {
  abstract readonly nipNumber: number;
  abstract readonly name: string;
  abstract readonly description: string;
  
  /**
   * Check if this NIP should handle the given event
   */
  abstract shouldHandle(event: NostrEvent): boolean;
  
  /**
   * Validate an event according to this NIP's rules
   */
  abstract validateEvent(event: NostrEvent): { valid: boolean; reason?: string };
  
  /**
   * Process an event (storage, indexing, etc.)
   */
  abstract processEvent(event: NostrEvent): Promise<void>;
  
  /**
   * Check if this NIP modifies REQ filtering
   */
  abstract shouldHandleFilter(filter: Filter): boolean;
  
  /**
   * Apply additional filtering logic for REQ messages
   */
  abstract applyFilter(events: NostrEvent[], filter: Filter): NostrEvent[];
  
  /**
   * Get NIP-specific relay information for NIP-11
   */
  getRelayInfo(): RelayInfoFragment {
    return {};
  }
}

/**
 * Registry to manage all loaded NIPs
 */
export class NIPRegistry {
  private nips: Map<number, BaseNIP> = new Map();
  
  register(nip: BaseNIP): void {
    this.nips.set(nip.nipNumber, nip);
    console.log(`Registered NIP-${nip.nipNumber.toString().padStart(2, '0')}: ${nip.name}`);
  }
  
  get(nipNumber: number): BaseNIP | undefined {
    return this.nips.get(nipNumber);
  }
  
  getAll(): BaseNIP[] {
    return Array.from(this.nips.values());
  }
  
  getSupportedNips(): number[] {
    return Array.from(this.nips.keys()).sort();
  }
  
  async validateEvent(event: NostrEvent): Promise<{ valid: boolean; reason?: string }> {
    // Check all registered NIPs that should handle this event
    for (const nip of this.nips.values()) {
      if (nip.shouldHandle(event)) {
        const result = nip.validateEvent(event);
        if (!result.valid) {
          return result;
        }
      }
    }
    return { valid: true };
  }
  
  async processEvent(event: NostrEvent): Promise<void> {
    // Process with all applicable NIPs
    const promises = Array.from(this.nips.values())
      .filter(nip => nip.shouldHandle(event))
      .map(nip => nip.processEvent(event));
    
    await Promise.all(promises);
  }
  
  applyFilters(events: NostrEvent[], filter: Filter): NostrEvent[] {
    let filteredEvents = events;
    
    // Apply filters from all relevant NIPs
    for (const nip of this.nips.values()) {
      if (nip.shouldHandleFilter(filter)) {
        filteredEvents = nip.applyFilter(filteredEvents, filter);
      }
    }
    
    return filteredEvents;
  }
  
  getRelayInfo(): RelayInfoDocument {
    const info: RelayInfoDocument = {};
    
    for (const nip of this.nips.values()) {
      const nipInfo = nip.getRelayInfo();
      Object.assign(info, nipInfo);
    }
    
    return info;
  }
}

// Global NIP registry instance
export const nipRegistry = new NIPRegistry();