import type WebSocket from "ws";
import { z } from "zod";

// Base Nostr event schema
export const nostrEventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string(),
});

export type NostrEvent = z.infer<typeof nostrEventSchema>;

// Filter schema for REQ messages
export const filterSchema = z.object({
  ids: z.array(z.string()).optional(),
  authors: z.array(z.string()).optional(),
  kinds: z.array(z.number()).optional(),
  since: z.number().optional(),
  until: z.number().optional(),
  limit: z.number().max(1000).optional(),
  "#e": z.array(z.string()).optional(),
  "#p": z.array(z.string()).optional(),
  "#a": z.array(z.string()).optional(),
  "#d": z.array(z.string()).optional(),
  search: z.string().optional(),
});

export type Filter = z.infer<typeof filterSchema>;

// WebSocket message schemas
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("EVENT"),
    event: nostrEventSchema,
  }),
  z.object({
    type: z.literal("REQ"),
    subscription_id: z.string(),
    filters: z.array(filterSchema),
  }),
  z.object({
    type: z.literal("CLOSE"),
    subscription_id: z.string(),
  }),
  z.object({
    type: z.literal("AUTH"),
    event: nostrEventSchema,
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// Server response schemas
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("EVENT"),
    subscription_id: z.string(),
    event: nostrEventSchema,
  }),
  z.object({
    type: z.literal("OK"),
    event_id: z.string(),
    accepted: z.boolean(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("EOSE"),
    subscription_id: z.string(),
  }),
  z.object({
    type: z.literal("CLOSED"),
    subscription_id: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("NOTICE"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("AUTH"),
    challenge: z.string(),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

// Subscription state
export interface Subscription {
  id: string;
  filters: Filter[];
  created_at: number;
}

// Connection state
export interface Connection {
  id: string;
  ws: WebSocket;
  subscriptions: Map<string, Subscription>;
  authenticated: boolean;
  pubkey?: string;
  ip: string;
  created_at: number;
  last_activity: number;
  rate_limit: {
    events: number;
    last_reset: number;
  };
}

export interface RelayFeeEntry {
  amount: number;
  unit: string;
  period?: number;
  kinds?: number[];
}

export interface RelayFees {
  admission?: RelayFeeEntry[];
  subscription?: RelayFeeEntry[];
  [key: string]: RelayFeeEntry[] | undefined;
}

export interface RelayLimitations {
  max_message_length?: number;
  max_subscriptions?: number;
  max_filters?: number;
  max_limit?: number;
  max_subid_length?: number;
  max_event_tags?: number;
  max_content_length?: number;
  min_pow_difficulty?: number;
  auth_required?: boolean;
  payment_required?: boolean;
  restricted_writes?: boolean;
  created_at_lower_limit?: number;
  created_at_upper_limit?: number;
  [key: string]: number | boolean | undefined;
}

export interface RelayInfoDocument {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  limitation?: RelayLimitations;
  payments_url?: string;
  fees?: RelayFees;
  relay_countries?: string[];
  language_tags?: string[];
  tags?: string[];
  posting_policy?: string;
  icon?: string;
  [key: string]: unknown;
}

export type RelayInfoFragment = Partial<RelayInfoDocument>;