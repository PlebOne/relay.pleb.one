"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouterOutputs } from "@/trpc/server";
import { api } from "@/trpc/react";
import { GlowingButton } from "@/components/ui/cypherpunk";
import { sendDmViaNip07, isNip07Available } from "@/lib/nostr-client-dm";
import { buildStatusChangeDmMessage } from "@/lib/whitelist-message";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

const STATUS_OPTIONS = ["ACTIVE", "PAUSED", "PENDING", "REVOKED"] as const;
type WhitelistStatus = (typeof STATUS_OPTIONS)[number];
type ListedUser = RouterOutputs["admin"]["listWhitelist"][number];
type PendingApproval = RouterOutputs["admin"]["listPendingApprovals"][number];

type FiltersState = {
  query: string;
  statuses: Set<WhitelistStatus>;
};

const statusChipClasses: Record<WhitelistStatus, string> = {
  ACTIVE: "bg-green-500/20 text-green-200 border-green-500/30",
  PENDING: "bg-yellow-500/10 text-yellow-200 border-yellow-500/40",
  PAUSED: "bg-orange-500/10 text-orange-200 border-orange-500/40",
  REVOKED: "bg-red-500/10 text-red-200 border-red-500/40",
};

export function AdminWhitelistPanel() {
  const [filters, setFilters] = useState<FiltersState>({
    query: "",
    statuses: new Set<WhitelistStatus>(),
  });
  const [newEntry, setNewEntry] = useState({
    npub: "",
    displayName: "",
    inviteQuota: 5,
    note: "",
  });

  // Debounce logic for admin panel
  const [debouncedNpub, setDebouncedNpub] = useState("");
  
  const handleNpubChange = (val: string) => {
    setNewEntry((current) => ({ ...current, npub: val }));
    setTimeout(() => setDebouncedNpub(val), 500);
  };

  const previewQuery = api.admin.getProfilePreview.useQuery(
    { npub: debouncedNpub },
    { 
      enabled: debouncedNpub.startsWith("npub1") && debouncedNpub.length > 10,
      retry: false 
    }
  );

  useMemo(() => {
    if (previewQuery.data && !newEntry.displayName) {
      const name = previewQuery.data.displayName || previewQuery.data.name;
      if (name) setNewEntry(curr => ({ ...curr, displayName: name }));
    }
  }, [previewQuery.data, newEntry.displayName]);

  const listInput = useMemo(() => ({
    query: filters.query.trim() || undefined,
    status: filters.statuses.size ? Array.from(filters.statuses) : undefined,
  }), [filters]);

  const listQuery = api.admin.listWhitelist.useQuery(listInput);
  const pendingQuery = api.admin.listPendingApprovals.useQuery();
  const processedMissingNames = useRef(new Set<string>());
  const updateStatus = api.admin.updateWhitelistStatus.useMutation({
    onSuccess: async (result) => {
      await listQuery.refetch();
      await pendingQuery.refetch();
      
      // Send DM via NIP-07 if status changed to PAUSED, REVOKED, or ACTIVE
      if (result?.dmPayload && isNip07Available()) {
        const { targetPubkey, status, reason } = result.dmPayload;
        if (status === "PAUSED" || status === "REVOKED" || status === "ACTIVE") {
          try {
            const dmContent = buildStatusChangeDmMessage(status, reason);
            const dmResult = await sendDmViaNip07(targetPubkey, dmContent, DEFAULT_RELAYS);
            if (!dmResult.success) {
              console.warn("Failed to send status change DM:", dmResult.error);
            }
          } catch (error) {
            console.error("Error sending status change DM:", error);
          }
        }
      }
    },
  });
  const upsertEntry = api.admin.upsertWhitelistEntry.useMutation({
    onSuccess: async () => {
      await listQuery.refetch();
      setNewEntry({ npub: "", displayName: "", inviteQuota: 5, note: "" });
    },
  });
  const approvePrivileges = api.admin.approveInvitePrivileges.useMutation({
    onSuccess: async () => {
      await pendingQuery.refetch();
      await listQuery.refetch();
    },
  });
  const refreshInvites = api.admin.refreshMonthlyInvites.useMutation({
    onSuccess: async () => {
      await listQuery.refetch();
    },
  });
  const {
    mutateAsync: refreshDisplayName,
    isPending: isRefreshingDisplayName,
  } = api.admin.refreshDisplayName.useMutation({
    onSuccess: async (result) => {
      if (result?.updated) {
        await listQuery.refetch();
      }
    },
  });

  useEffect(() => {
    if (!listQuery.data || isRefreshingDisplayName) return;

    const usersMissingNames = listQuery.data.filter((user) => !user.displayName && !!user.npub);
    if (usersMissingNames.length === 0) return;

    let cancelled = false;

    const run = async () => {
      for (const user of usersMissingNames) {
        if (cancelled) return;
        if (processedMissingNames.current.has(user.id)) continue;

        processedMissingNames.current.add(user.id);
        try {
          await refreshDisplayName({ userId: user.id });
        } catch (error) {
          console.error("Failed to refresh display name", error);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isRefreshingDisplayName, listQuery.data, refreshDisplayName]);

  const toggleStatusFilter = (value: WhitelistStatus) => {
    setFilters((current) => {
      const nextStatuses = new Set(current.statuses);
      if (nextStatuses.has(value)) {
        nextStatuses.delete(value);
      } else {
        nextStatuses.add(value);
      }
      return { ...current, statuses: nextStatuses };
    });
  };

  const handleStatusChange = (user: ListedUser, status: WhitelistStatus) => {
    updateStatus.mutate({ userId: user.id, status });
  };

  const handleDetailSave = (user: ListedUser, formData: FormData) => {
    const note = (formData.get("note") as string)?.trim();
    const inviteQuotaRaw = formData.get("inviteQuota") as string;
    const inviteQuota = Number(inviteQuotaRaw);

    updateStatus.mutate({
      userId: user.id,
      status: user.whitelistStatus,
      note: note || undefined,
      inviteQuota: Number.isNaN(inviteQuota) ? undefined : inviteQuota,
    });
  };

  return (
    <section className="rounded-2xl border border-green-500/40 bg-black/70 p-6 shadow-xl shadow-green-500/10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-green-500/70">Admin controls</p>
          <h2 className="text-2xl font-semibold text-green-100">Whitelist directory</h2>
        </div>
        <div className="flex items-center gap-4">
          {pendingQuery.data && pendingQuery.data.length > 0 ? (
            <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-sm text-yellow-300">
              {pendingQuery.data.length} pending approval{pendingQuery.data.length !== 1 ? "s" : ""}
            </span>
          ) : null}
          <span className="text-sm text-gray-400">
            {listQuery.isLoading ? "Syncing…" : `${listQuery.data?.length ?? 0} results`}
          </span>
        </div>
      </header>

      {pendingQuery.data && pendingQuery.data.length > 0 ? (
        <div className="mt-6 rounded-xl border border-yellow-500/40 bg-yellow-900/10 p-4">
          <h3 className="text-sm font-semibold text-yellow-400">⚠️ Pending invite privilege approvals</h3>
          <p className="mt-1 text-xs text-gray-300">
            These users had someone they invited get blacklisted. Review and approve to restore their invite
            privileges.
          </p>
          <div className="mt-4 space-y-3">
            {pendingQuery.data.map((user: PendingApproval) => (
              <div
                key={user.id}
                className="rounded-lg border border-yellow-500/30 bg-black/60 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{user.displayName ?? user.npub}</p>
                    <p className="text-xs text-gray-400">{user.inviteSuspensionReason}</p>
                  </div>
                  <GlowingButton
                    className="px-4 py-2 text-xs"
                    disabled={approvePrivileges.isPending}
                    onClick={() => approvePrivileges.mutate({ userId: user.id })}
                  >
                    Restore privileges
                  </GlowingButton>
                </div>
                {user.usersInvited.length > 0 ? (
                  <div className="mt-2 text-xs text-gray-400">
                    Invited:{" "}
                    {user.usersInvited
                      .map((u: { displayName?: string | null; npub: string }) => u.displayName ?? u.npub)
                      .join(", ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-[2fr,3fr]">
        <div className="rounded-xl border border-green-500/20 bg-black/50 p-4">
          <h3 className="text-sm font-semibold text-green-400">Filters</h3>
          <input
            className="mt-3 w-full rounded-md border border-green-500/30 bg-black/70 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
            placeholder="Search npubs, names, notes"
            value={filters.query}
            onChange={(e) => setFilters((current) => ({ ...current, query: e.target.value }))}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatusFilter(status)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
                  filters.statuses.has(status)
                    ? "border-green-400 text-green-300"
                    : "border-green-500/20 text-gray-400"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <GlowingButton
            className="mt-4 w-full"
            variant="secondary"
            onClick={() => setFilters({ query: "", statuses: new Set() })}
          >
            Clear filters
          </GlowingButton>
          <GlowingButton
            className="mt-2 w-full"
            disabled={refreshInvites.isPending}
            onClick={() => refreshInvites.mutate()}
          >
            {refreshInvites.isPending ? "Refreshing..." : "Refresh monthly invites"}
          </GlowingButton>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-black/50 p-4">
          <h3 className="text-sm font-semibold text-green-400">Add to whitelist</h3>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newEntry.npub.trim()) return;
              upsertEntry.mutate({
                npub: newEntry.npub.trim(),
                displayName: newEntry.displayName.trim() || undefined,
                inviteQuota: newEntry.inviteQuota,
                note: newEntry.note.trim() || undefined,
                status: "ACTIVE",
              });
            }}
          >
            <label className="block text-xs uppercase tracking-wide text-green-500/70">npub</label>
            <input
              className="w-full rounded-md border border-green-500/30 bg-black/70 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
              placeholder="npub1..."
              value={newEntry.npub}
              onChange={(e) => handleNpubChange(e.target.value)}
            />
            {previewQuery.isLoading && <p className="mt-1 text-xs text-gray-500">Fetching metadata...</p>}
            {previewQuery.data && (
              <div className="mt-2 mb-2 flex items-center gap-2 rounded border border-green-500/20 bg-green-900/10 p-2">
                {previewQuery.data.picture && (
                  <img src={previewQuery.data.picture} alt="" className="h-8 w-8 rounded-full" />
                )}
                <div className="text-xs">
                  <p className="font-bold text-green-400">{previewQuery.data.displayName || previewQuery.data.name}</p>
                  <p className="text-gray-400">{previewQuery.data.nip05}</p>
                </div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs uppercase tracking-wide text-green-500/70">Display name</label>
                <input
                  className="w-full rounded-md border border-green-500/30 bg-black/70 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                  value={newEntry.displayName}
                  onChange={(e) => setNewEntry((current) => ({ ...current, displayName: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-green-500/70">Invite quota</label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  className="w-full rounded-md border border-green-500/30 bg-black/70 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                  value={newEntry.inviteQuota}
                  onChange={(e) =>
                    setNewEntry((current) => ({ ...current, inviteQuota: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
            <label className="block text-xs uppercase tracking-wide text-green-500/70">Notes</label>
            <textarea
              className="w-full rounded-md border border-green-500/30 bg-black/70 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
              rows={2}
              value={newEntry.note}
              onChange={(e) => setNewEntry((current) => ({ ...current, note: e.target.value }))}
            />
            <GlowingButton className="w-full" disabled={upsertEntry.isPending}>
              {upsertEntry.isPending ? "Saving…" : "Whitelist npub"}
            </GlowingButton>
          </form>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {listQuery.isLoading && <p className="text-sm text-gray-400">Loading directory…</p>}
        {!listQuery.isLoading && (listQuery.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400">No whitelist entries match the current filters.</p>
        ) : null}

  {listQuery.data?.map((user: ListedUser) => (
          <article
            key={user.id}
            className="rounded-xl border border-green-500/20 bg-black/60 p-4 text-sm text-gray-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{user.displayName ?? user.npub ?? "Unnamed"}</p>
                <p className="text-xs text-gray-400 break-all">{user.npub}</p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  statusChipClasses[user.whitelistStatus as WhitelistStatus]
                }`}
              >
                {user.whitelistStatus}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-3 text-xs text-gray-300">
              <div>
                <dt className="uppercase tracking-wide text-green-500/60">Invites left</dt>
                <dd className="text-base text-white">{user.invitesAvailable}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-green-500/60">Quota</dt>
                <dd className="text-base text-white">{user.inviteQuota}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-green-500/60">Invites used</dt>
                <dd className="text-base text-white">{user.invitesUsed}</dd>
              </div>
            </dl>

            <form
              className="mt-4 grid gap-3 md:grid-cols-[2fr,1fr]"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                handleDetailSave(user, formData);
              }}
            >
              <div>
                <label className="text-xs uppercase tracking-wide text-green-500/70">Notes</label>
                <textarea
                  name="note"
                  defaultValue={user.whitelistNotes ?? ""}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-green-500/30 bg-black/70 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-green-500/70">Invite quota</label>
                <input
                  name="inviteQuota"
                  type="number"
                  min={0}
                  max={500}
                  defaultValue={user.inviteQuota}
                  className="mt-1 w-full rounded-md border border-green-500/30 bg-black/70 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                />
                <GlowingButton className="mt-3 w-full" variant="secondary" disabled={updateStatus.isPending}>
                  Save details
                </GlowingButton>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <GlowingButton
                variant="secondary"
                className="px-4 py-2"
                disabled={updateStatus.isPending || user.whitelistStatus === "ACTIVE"}
                onClick={() => handleStatusChange(user, "ACTIVE")}
              >
                Activate
              </GlowingButton>
              <GlowingButton
                variant="secondary"
                className="px-4 py-2"
                disabled={updateStatus.isPending || user.whitelistStatus === "PAUSED"}
                onClick={() => handleStatusChange(user, "PAUSED")}
              >
                Pause
              </GlowingButton>
              <GlowingButton
                variant="secondary"
                className="px-4 py-2"
                disabled={updateStatus.isPending || user.whitelistStatus === "REVOKED"}
                onClick={() => handleStatusChange(user, "REVOKED")}
              >
                Revoke
              </GlowingButton>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
