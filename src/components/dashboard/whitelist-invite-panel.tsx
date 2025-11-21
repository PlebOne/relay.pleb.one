"use client";

import { useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { GlowingButton } from "@/components/ui/cypherpunk";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-300 border-green-500/40",
  PENDING: "bg-yellow-500/10 text-yellow-200 border-yellow-500/30",
  PAUSED: "bg-orange-500/10 text-orange-200 border-orange-500/30",
  REVOKED: "bg-red-500/10 text-red-300 border-red-500/30",
};

export function WhitelistInvitePanel() {
  const [npub, setNpub] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Debounce npub for preview
  const [debouncedNpub, setDebouncedNpub] = useState("");
  
  // Update debounced value after delay
  const handleNpubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNpub(val);
    // Simple debounce
    setTimeout(() => {
      setDebouncedNpub(val);
    }, 500);
  };

  const previewQuery = api.user.getProfilePreview.useQuery(
    { npub: debouncedNpub },
    { 
      enabled: debouncedNpub.startsWith("npub1") && debouncedNpub.length > 10,
      retry: false 
    }
  );

  // Auto-fill display name if found and empty
  useMemo(() => {
    if (previewQuery.data && !displayName) {
      const name = previewQuery.data.displayName || previewQuery.data.name;
      if (name) setDisplayName(name);
    }
  }, [previewQuery.data, displayName]);

  const whitelistQuery = api.user.getWhitelistStatus.useQuery();
  const inviteMutation = api.user.inviteToWhitelist.useMutation({
    onSuccess: async () => {
      setFeedback("Invite submitted. Your friend will have access shortly.");
      setNpub("");
      setDisplayName("");
      setNote("");
      await whitelistQuery.refetch();
    },
    onError: (error: { message: string }) => setFeedback(error.message),
  });

  const statusSummary = whitelistQuery.data;
  const invitesRemaining = statusSummary?.invitesAvailable ?? 0;
  const statusLabel = statusSummary?.status ?? "LOADING";

  const statusBadgeClass = useMemo(() => {
    if (!statusSummary) return "bg-gray-700 text-gray-300 border-gray-600";
    return STATUS_COLORS[statusSummary.status] ?? "bg-gray-700 text-gray-300 border-gray-600";
  }, [statusSummary]);

  return (
    <div className="rounded-2xl border border-green-500/30 bg-black/70 p-5 shadow-lg shadow-green-500/10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-green-400">Whitelist access</h2>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass}`}>
          {statusLabel}
        </span>
      </div>

      {!statusSummary ? (
        <p className="mt-4 text-sm text-gray-400">Loading whitelist details…</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-green-500/70">Invites remaining</dt>
              <dd className="text-xl text-white">{invitesRemaining}</dd>
            </div>
            <div>
              <dt className="text-green-500/70">Total allocated</dt>
              <dd className="text-xl text-white">{statusSummary.inviteQuota}</dd>
            </div>
          </dl>

          {statusSummary.notes ? (
            <p className="mt-3 text-xs text-gray-400">Note from admin: {statusSummary.notes}</p>
          ) : null}

          {statusSummary.invitePrivilegesSuspended ? (
            <div className="mt-4 rounded-lg border border-yellow-500/40 bg-yellow-900/10 p-3">
              <p className="text-sm font-semibold text-yellow-300">⚠️ Invite privileges suspended</p>
              <p className="mt-1 text-xs text-gray-300">
                {statusSummary.inviteSuspensionReason ??
                  "Someone you invited was removed from the whitelist. An admin will review your case."}
              </p>
            </div>
          ) : null}

          {statusSummary.status === "ACTIVE" && !statusSummary.invitePrivilegesSuspended ? (
            <form
              className="mt-5 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!npub.trim()) {
                  setFeedback("Provide an npub to share access.");
                  return;
                }
                setFeedback(null);
                inviteMutation.mutate({
                  npub: npub.trim(),
                  displayName: displayName.trim() || undefined,
                  note: note.trim() || undefined,
                });
              }}
            >
              <label className="block text-xs uppercase tracking-wide text-green-500/70">
                Invite a friend via npub
              </label>
              <input
                className="w-full rounded-md border border-green-500/30 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                placeholder="npub1..."
                value={npub}
                onChange={handleNpubChange}
              />
              {previewQuery.isLoading && <p className="mt-1 text-xs text-gray-500">Looking up profile...</p>}
              {previewQuery.data && (
                <div className="mt-2 flex items-center gap-2 rounded border border-green-500/20 bg-green-900/10 p-2">
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
                  <label className="block text-xs uppercase tracking-wide text-green-500/70">
                    Optional name
                  </label>
                  <input
                    className="w-full rounded-md border border-green-500/30 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                    placeholder="Display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-green-500/70">
                    Optional note
                  </label>
                  <input
                    className="w-full rounded-md border border-green-500/30 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                    placeholder="For admin context"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>
              <GlowingButton className="w-full" disabled={inviteMutation.isPending || invitesRemaining <= 0}>
                {inviteMutation.isPending ? "Sharing access…" : invitesRemaining <= 0 ? "No invites left" : "Send invite"}
              </GlowingButton>
            </form>
          ) : (
            <p className="mt-5 text-sm text-gray-400">
              Once an admin activates your whitelist slot you&apos;ll see invite controls here.
            </p>
          )}
        </>
      )}

      {feedback ? <p className="mt-4 text-xs text-yellow-300">{feedback}</p> : null}
    </div>
  );
}
