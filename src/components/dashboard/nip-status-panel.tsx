"use client";

import { useState } from "react";
import { GlowingButton } from "@/components/ui/cypherpunk";

type NipStatus = "operational" | "partial" | "not-implemented";

interface NipInfo {
  number: string;
  name: string;
  description: string;
  status: NipStatus;
  notes?: string;
}

const NIPS: NipInfo[] = [
  {
    number: "01",
    name: "Basic protocol flow",
    description: "Core Nostr protocol, events, and basic relay communication",
    status: "operational",
  },
  {
    number: "09",
    name: "Event Deletion",
    description: "Allow users to delete their own events",
    status: "operational",
  },
  {
    number: "11",
    name: "Relay Information Document",
    description: "Relay metadata accessible via HTTP",
    status: "operational",
  },
  {
    number: "15",
    name: "End of Stored Events",
    description: "Notify clients when stored events have been sent",
    status: "operational",
  },
  {
    number: "17",
    name: "Private Direct Messages",
    description: "Encrypted direct messaging between users",
    status: "operational",
  },
  {
    number: "20",
    name: "Command Results",
    description: "Acknowledge if an event was accepted or rejected",
    status: "operational",
  },
  {
    number: "23",
    name: "Long-form Content",
    description: "Articles and blog posts",
    status: "operational",
  },
  {
    number: "40",
    name: "Expiration Timestamp",
    description: "Automatically delete events after a certain time",
    status: "operational",
  },
  {
    number: "42",
    name: "Client Authentication",
    description: "Cryptographic proof of identity for relay access",
    status: "operational",
  },
  {
    number: "50",
    name: "Search Capability",
    description: "Search events by content or metadata",
    status: "partial",
    notes: "Basic text search available via client-side filtering, full-text DB search pending",
  },
  {
    number: "51",
    name: "Lists",
    description: "User-created lists of pubkeys, events, or other data",
    status: "operational",
  },
  {
    number: "56",
    name: "Reporting",
    description: "Report content for moderation",
    status: "operational",
  },
  {
    number: "62",
    name: "Request to Vanish",
    description: "Coordinated deletion requests across relays",
    status: "operational",
  },
  {
    number: "65",
    name: "Relay List Metadata",
    description: "Publish read/write relay preferences (kind 10002)",
    status: "operational",
  },
  {
    number: "66",
    name: "Decentralized Relay Monitoring",
    description: "Relay publishes its own metrics and status (kind 30166)",
    status: "operational",
  },
  {
    number: "77",
    name: "Negentropy Syncing",
    description: "Efficient event reconciliation protocol",
    status: "operational",
  },
  {
    number: "86",
    name: "Relay Management API",
    description: "Remote relay administration",
    status: "operational",
  },
  {
    number: "87",
    name: "Nostr Discovery & Content Curation",
    description: "Standard for content discovery and curation",
    status: "not-implemented",
  },
];

const statusConfig: Record<NipStatus, { color: string; label: string; dotColor: string }> = {
  operational: {
    color: "text-green-400 border-green-500/40 bg-green-500/10",
    label: "Operational",
    dotColor: "bg-green-400",
  },
  partial: {
    color: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
    label: "Partial",
    dotColor: "bg-yellow-400",
  },
  "not-implemented": {
    color: "text-gray-400 border-gray-500/40 bg-gray-500/10",
    label: "Not Implemented",
    dotColor: "bg-gray-400",
  },
};

export function NipStatusPanel() {
  const [filter, setFilter] = useState<NipStatus | "all">("all");

  const filteredNips = filter === "all" ? NIPS : NIPS.filter((nip) => nip.status === filter);

  const operationalCount = NIPS.filter((n) => n.status === "operational").length;
  const partialCount = NIPS.filter((n) => n.status === "partial").length;
  const notImplementedCount = NIPS.filter((n) => n.status === "not-implemented").length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-green-500/30 bg-black/60 p-4">
          <div className="text-sm uppercase tracking-wide text-green-500/70">Total NIPs</div>
          <div className="mt-2 text-3xl font-bold text-white">{NIPS.length}</div>
        </div>
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
          <div className="text-sm uppercase tracking-wide text-green-500/70">Operational</div>
          <div className="mt-2 text-3xl font-bold text-green-400">{operationalCount}</div>
        </div>
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
          <div className="text-sm uppercase tracking-wide text-yellow-500/70">Partial</div>
          <div className="mt-2 text-3xl font-bold text-yellow-400">{partialCount}</div>
        </div>
        <div className="rounded-xl border border-gray-500/30 bg-gray-500/5 p-4">
          <div className="text-sm uppercase tracking-wide text-gray-500/70">Not Implemented</div>
          <div className="mt-2 text-3xl font-bold text-gray-400">{notImplementedCount}</div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-green-500/20 bg-black/50 p-4">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
            filter === "all"
              ? "border-green-400 bg-green-400/20 text-green-300"
              : "border-green-500/20 text-gray-400 hover:border-green-400 hover:text-green-300"
          }`}
        >
          All NIPs
        </button>
        <button
          onClick={() => setFilter("operational")}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
            filter === "operational"
              ? "border-green-400 bg-green-400/20 text-green-300"
              : "border-green-500/20 text-gray-400 hover:border-green-400 hover:text-green-300"
          }`}
        >
          Operational
        </button>
        <button
          onClick={() => setFilter("partial")}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
            filter === "partial"
              ? "border-yellow-400 bg-yellow-400/20 text-yellow-300"
              : "border-green-500/20 text-gray-400 hover:border-yellow-400 hover:text-yellow-300"
          }`}
        >
          Partial
        </button>
        <button
          onClick={() => setFilter("not-implemented")}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
            filter === "not-implemented"
              ? "border-gray-400 bg-gray-400/20 text-gray-300"
              : "border-green-500/20 text-gray-400 hover:border-gray-400 hover:text-gray-300"
          }`}
        >
          Not Implemented
        </button>
      </div>

      {/* NIP List */}
      <div className="space-y-3">
        {filteredNips.map((nip) => {
          const config = statusConfig[nip.status];
          return (
            <div
              key={nip.number}
              className="rounded-xl border border-green-500/20 bg-black/60 p-4 transition-all hover:border-green-500/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-green-900/30 px-3 py-1 text-sm font-bold text-green-400">
                      NIP-{nip.number}
                    </div>
                    <h3 className="text-lg font-semibold text-white">{nip.name}</h3>
                  </div>
                  <p className="mt-2 text-sm text-gray-300">{nip.description}</p>
                  {nip.notes && (
                    <div className="mt-2 rounded-lg border border-yellow-500/30 bg-yellow-900/10 p-2">
                      <p className="text-xs text-yellow-200">
                        <span className="font-semibold">Note:</span> {nip.notes}
                      </p>
                    </div>
                  )}
                </div>
                <div
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${config.color}`}
                >
                  <div className={`h-2 w-2 rounded-full ${config.dotColor}`}></div>
                  {config.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredNips.length === 0 && (
        <div className="rounded-xl border border-green-500/20 bg-black/60 p-8 text-center">
          <p className="text-gray-400">No NIPs match the selected filter.</p>
        </div>
      )}

      {/* Footer */}
      <div className="rounded-xl border border-green-500/20 bg-black/50 p-4 text-center">
        <p className="text-sm text-gray-400">
          For more information about Nostr Implementation Possibilities (NIPs), visit{" "}
          <a
            href="https://github.com/nostr-protocol/nips"
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 hover:text-green-300 underline"
          >
            github.com/nostr-protocol/nips
          </a>
        </p>
      </div>
    </div>
  );
}
