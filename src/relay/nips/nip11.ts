import { BaseNIP } from "../nip-registry";
import { NostrEvent, Filter, RelayInfoDocument, RelayInfoFragment } from "../types";
import { env } from "@/env";

/**
 * NIP-11: Relay Information Document
 * 
 * This NIP provides relay information via HTTP GET to the relay URL.
 * It doesn't process events but provides metadata about the relay.
 */
export class NIP11 extends BaseNIP {
  readonly nipNumber = 11;
  readonly name = "Relay Information Document";
  readonly description = "Relay information document";

  shouldHandle(event: NostrEvent): boolean {
    void event;
    // NIP-11 doesn't handle events, only provides relay info
    return false;
  }

  validateEvent(event: NostrEvent): { valid: boolean; reason?: string } {
    void event;
    return { valid: true }; // No event validation needed
  }

  async processEvent(event: NostrEvent): Promise<void> {
    void event;
    // No event processing needed for NIP-11
  }

  shouldHandleFilter(filter: Filter): boolean {
    void filter;
    return false; // No filter modifications
  }

  applyFilter(events: NostrEvent[], filter: Filter): NostrEvent[] {
    void filter;
    return events; // No filtering changes
  }

  getRelayInfo(): RelayInfoFragment {
    return {
      name: env.RELAY_NAME,
      description: env.RELAY_DESCRIPTION,
      pubkey: env.RELAY_PUBKEY,
      contact: env.RELAY_CONTACT,
      supported_nips: [], // Will be populated by registry
      software: "relay.pleb.one",
      version: "1.0.0",
      limitation: {
        max_message_length: env.MAX_EVENT_SIZE,
        max_subscriptions: env.MAX_SUBSCRIPTIONS_PER_CONNECTION,
        max_filters: 10,
        max_limit: 1000,
        max_subid_length: 256,
        max_event_tags: 100,
        max_content_length: env.MAX_EVENT_SIZE,
        min_pow_difficulty: 0,
        auth_required: true,
        payment_required: true,
        restricted_writes: true,
        created_at_lower_limit: 1577836800, // 2020-01-01
        created_at_upper_limit: Math.floor(Date.now() / 1000) + 3600, // 1 hour in future
      },
      payments_url: `${env.NEXT_PUBLIC_APP_URL}/api/payments`,
      fees: {
        admission: [
          {
            amount: env.MONTHLY_PRICE_SATS,
            unit: "msats",
            period: 2629746, // 1 month in seconds
          },
          {
            amount: env.YEARLY_PRICE_SATS,
            unit: "msats", 
            period: 31556952, // 1 year in seconds
          },
        ],
        subscription: [
          {
            amount: env.BLOSSOM_MONTHLY_PRICE_SATS,
            unit: "msats",
            period: 2629746,
            kinds: [1063, 1064, 1065], // Blossom event kinds
          },
        ],
      },
      relay_countries: ["US"],
      language_tags: ["en"],
      tags: ["paid", "premium", "bitcoin", "lightning", "blossom"],
      posting_policy: `${env.NEXT_PUBLIC_APP_URL}/terms`,
      icon: `${env.NEXT_PUBLIC_APP_URL}/icon.png`,
    };
  }

  /**
   * Generate the complete NIP-11 document
   * This will be served via HTTP GET to the relay endpoint
   */
  generateRelayDocument(supportedNips: number[]): RelayInfoDocument {
    const info: RelayInfoDocument = { ...this.getRelayInfo() };
    info.supported_nips = supportedNips;
    return info;
  }
}