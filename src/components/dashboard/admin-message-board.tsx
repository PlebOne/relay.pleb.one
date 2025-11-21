"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { sendDmViaNip07, isNip07Available } from "@/lib/nostr-client-dm";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

type MessageType = "BLACKLIST_REQUEST" | "WHITELIST_REQUEST" | "SUPPORT_REQUEST" | "APPEAL" | "REPORT";
type MessageStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "DENIED" | "RESOLVED";

interface Message {
  id: string;
  type: MessageType;
  status: MessageStatus;
  subject: string;
  content: string;
  submitterNpub: string | null;
  submitterPubkey: string | null;
  targetNpub: string | null;
  targetPubkey: string | null;
  metadata: unknown;
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
  resolvedBy: {
    npub: string;
    displayName: string | null;
  } | null;
}

export function AdminMessageBoard() {
  const [activeTab, setActiveTab] = useState<"all" | MessageType>("all");
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [blacklistReason, setBlacklistReason] = useState("");

  const utils = api.useUtils();

  // Get stats for badge counts
  const { data: stats } = api.message.getStats.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Get messages based on active tab
  const { data, fetchNextPage, hasNextPage, isLoading } = api.message.list.useInfiniteQuery(
    {
      type: activeTab === "all" ? undefined : [activeTab],
      status: ["PENDING", "IN_REVIEW"],
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const messages = data?.pages.flatMap((page) => page.messages) ?? [];

  // Mutations
  const updateStatus = api.message.updateStatus.useMutation({
    onSuccess: () => {
      void utils.message.list.invalidate();
      void utils.message.getStats.invalidate();
    },
  });

  const approveBlacklist = api.message.approveBlacklistRequest.useMutation({
    onSuccess: () => {
      void utils.message.list.invalidate();
      void utils.message.getStats.invalidate();
      setSelectedMessage(null);
      setBlacklistReason("");
    },
  });

  const approveWhitelist = api.message.approveWhitelistRequest.useMutation({
    onSuccess: async (result) => {
      void utils.message.list.invalidate();
      void utils.message.getStats.invalidate();
      
      // Send DM via NIP-07 if available
      if (result?.dmPayload && isNip07Available()) {
        try {
          const dmResult = await sendDmViaNip07(
            result.dmPayload.targetPubkey,
            result.dmPayload.content,
            DEFAULT_RELAYS
          );
          if (!dmResult.success) {
            console.warn("Failed to send DM via NIP-07:", dmResult.error);
          }
        } catch (error) {
          console.error("Error sending DM:", error);
        }
      }
      
      setSelectedMessage(null);
    },
  });

  const denyRequest = api.message.denyRequest.useMutation({
    onSuccess: () => {
      void utils.message.list.invalidate();
      void utils.message.getStats.invalidate();
      setSelectedMessage(null);
      setDenyReason("");
    },
  });

  const tabs: Array<{ key: "all" | MessageType; label: string; count?: number }> = [
    { key: "all", label: "All", count: (stats?.pending ?? 0) + (stats?.inReview ?? 0) },
    { key: "BLACKLIST_REQUEST", label: "Blacklist", count: stats?.byType.BLACKLIST_REQUEST },
    { key: "WHITELIST_REQUEST", label: "Whitelist", count: stats?.byType.WHITELIST_REQUEST },
    { key: "SUPPORT_REQUEST", label: "Support", count: stats?.byType.SUPPORT_REQUEST },
    { key: "APPEAL", label: "Appeals", count: stats?.byType.APPEAL },
    { key: "REPORT", label: "Reports", count: stats?.byType.REPORT },
  ];

  const getMessageTypeColor = (type: MessageType) => {
    switch (type) {
      case "BLACKLIST_REQUEST":
        return "text-red-400";
      case "WHITELIST_REQUEST":
        return "text-green-400";
      case "SUPPORT_REQUEST":
        return "text-blue-400";
      case "APPEAL":
        return "text-yellow-400";
      case "REPORT":
        return "text-orange-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusBadge = (status: MessageStatus) => {
    const colors = {
      PENDING: "bg-yellow-900/30 text-yellow-400 border-yellow-600",
      IN_REVIEW: "bg-blue-900/30 text-blue-400 border-blue-600",
      APPROVED: "bg-green-900/30 text-green-400 border-green-600",
      DENIED: "bg-red-900/30 text-red-400 border-red-600",
      RESOLVED: "bg-gray-900/30 text-gray-400 border-gray-600",
    };

    return (
      <span
        className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${colors[status]}`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="rounded-lg border border-green-800/30 bg-black/50 p-6 font-mono">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-green-400">{'// MESSAGE BOARD'}</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">
            Pending: <span className="font-bold text-yellow-400">{stats?.pending ?? 0}</span>
          </span>
          <span className="text-gray-400">
            In Review: <span className="font-bold text-blue-400">{stats?.inReview ?? 0}</span>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-green-800/30 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm transition-colors ${
              activeTab === tab.key
                ? "bg-green-900/30 text-green-400"
                : "text-gray-400 hover:bg-green-900/10 hover:text-green-300"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-2 rounded-full bg-green-700/30 px-2 py-0.5 text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Messages List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-gray-500">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            No {activeTab === "all" ? "" : activeTab.toLowerCase().replace("_", " ")} messages
            pending
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className="cursor-pointer rounded-lg border border-green-800/20 bg-black/30 p-4 transition-colors hover:border-green-600/50"
                onClick={() => setSelectedMessage(message)}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`font-bold ${getMessageTypeColor(message.type)}`}>
                        {message.type.replace("_", " ")}
                      </span>
                      {getStatusBadge(message.status)}
                    </div>
                    <h3 className="text-sm font-semibold text-green-400">{message.subject}</h3>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(message.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mb-2 line-clamp-2 text-sm text-gray-400">{message.content}</p>
                {message.targetNpub && (
                  <div className="text-xs text-gray-500">
                    Target:{" "}
                    <code className="text-green-400">
                      {message.targetNpub.slice(0, 12)}...{message.targetNpub.slice(-8)}
                    </code>
                  </div>
                )}
              </div>
            ))}

            {hasNextPage && (
              <button
                onClick={() => void fetchNextPage()}
                className="w-full rounded-lg border border-green-800/30 bg-black/30 py-2 text-sm text-green-400 transition-colors hover:border-green-600/50"
              >
                Load More
              </button>
            )}
          </>
        )}
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedMessage(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-green-600/50 bg-black p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`text-lg font-bold ${getMessageTypeColor(selectedMessage.type)}`}>
                    {selectedMessage.type.replace("_", " ")}
                  </span>
                  {getStatusBadge(selectedMessage.status)}
                </div>
                <h3 className="text-xl font-bold text-green-400">{selectedMessage.subject}</h3>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500">Content</label>
                <p className="whitespace-pre-wrap text-sm text-gray-300">{selectedMessage.content}</p>
              </div>

              {selectedMessage.submitterNpub && (
                <div>
                  <label className="block text-xs text-gray-500">Submitter</label>
                  <code className="text-sm text-green-400">{selectedMessage.submitterNpub}</code>
                </div>
              )}

              {selectedMessage.targetNpub && (
                <div>
                  <label className="block text-xs text-gray-500">Target User</label>
                  <code className="text-sm text-green-400">{selectedMessage.targetNpub}</code>
                </div>
              )}

              {!!selectedMessage.metadata && (
                <div>
                  <label className="block text-xs text-gray-500">Metadata</label>
                  <pre className="mt-1 overflow-x-auto rounded bg-black/50 p-2 text-xs text-gray-400">
                    {JSON.stringify(selectedMessage.metadata, null, 2)}
                  </pre>
                </div>
              )}

              <div className="text-xs text-gray-500">
                Submitted: {new Date(selectedMessage.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Action Buttons */}
            {selectedMessage.status === "PENDING" || selectedMessage.status === "IN_REVIEW" ? (
              <div className="space-y-3 border-t border-green-800/30 pt-4">
                {selectedMessage.type === "BLACKLIST_REQUEST" && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={blacklistReason}
                      onChange={(e) => setBlacklistReason(e.target.value)}
                      placeholder="Optional reason for blacklist..."
                      className="w-full rounded bg-black/50 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-red-600"
                    />
                    <button
                      onClick={() =>
                        approveBlacklist.mutate({
                          messageId: selectedMessage.id,
                          reason: blacklistReason || undefined,
                        })
                      }
                      disabled={approveBlacklist.isPending}
                      className="w-full rounded-lg bg-red-600 py-2 text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {approveBlacklist.isPending ? "Processing..." : "✓ Approve & Blacklist User"}
                    </button>
                  </div>
                )}

                {selectedMessage.type === "WHITELIST_REQUEST" && (
                  <button
                    onClick={() =>
                      approveWhitelist.mutate({
                        messageId: selectedMessage.id,
                      })
                    }
                    disabled={approveWhitelist.isPending}
                    className="w-full rounded-lg bg-green-600 py-2 text-sm font-bold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {approveWhitelist.isPending ? "Processing..." : "✓ Approve & Whitelist User"}
                  </button>
                )}

                <div className="space-y-2">
                  <input
                    type="text"
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="Reason for denial (required)..."
                    className="w-full rounded bg-black/50 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-yellow-600"
                  />
                  <button
                    onClick={() => {
                      if (denyReason.trim()) {
                        denyRequest.mutate({
                          messageId: selectedMessage.id,
                          reason: denyReason,
                        });
                      }
                    }}
                    disabled={!denyReason.trim() || denyRequest.isPending}
                    className="w-full rounded-lg bg-gray-700 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {denyRequest.isPending ? "Processing..." : "✕ Deny Request"}
                  </button>
                </div>

                <button
                  onClick={() =>
                    updateStatus.mutate({
                      messageId: selectedMessage.id,
                      status: "IN_REVIEW",
                    })
                  }
                  disabled={updateStatus.isPending || selectedMessage.status === "IN_REVIEW"}
                  className="w-full rounded-lg border border-blue-600 py-2 text-sm font-bold text-blue-400 transition-colors hover:bg-blue-600/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mark as In Review
                </button>
              </div>
            ) : (
              <div className="border-t border-green-800/30 pt-4">
                <div className="rounded-lg bg-green-900/10 p-3">
                  <div className="text-xs text-gray-500">Status: {selectedMessage.status}</div>
                  {selectedMessage.resolution && (
                    <div className="mt-2 text-sm text-gray-300">
                      Resolution: {selectedMessage.resolution}
                    </div>
                  )}
                  {selectedMessage.resolvedBy && (
                    <div className="mt-1 text-xs text-gray-500">
                      Resolved by: {selectedMessage.resolvedBy.displayName ?? selectedMessage.resolvedBy.npub}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
