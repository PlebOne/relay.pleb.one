import { TerminalWindow } from "@/components/ui/cypherpunk";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const formatRelativeTime = (date: Date) => {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60) {
    return relativeFormatter.format(-diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return relativeFormatter.format(-diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return relativeFormatter.format(-diffDays, "day");
};

export type ChatHistoryEntry = {
  id: string;
  eventId?: string | null;
  pubkey: string;
  npub?: string | null;
  kind: number;
  content: string;
  createdAt: Date;
};

export function ChatHistoryFeed({
  entries,
  viewerLabel,
}: {
  entries: ChatHistoryEntry[];
  viewerLabel: string;
}) {
  return (
    <TerminalWindow title={`relay-feed --viewer ${viewerLabel}`}>
      {entries.length === 0 ? (
        <div className="text-sm text-gray-400">
          No events recorded yet. As soon as clients publish through the relay they will appear here.
        </div>
      ) : (
  <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-2">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-lg border border-green-500/20 bg-black/60 p-4 shadow-inner shadow-green-500/10"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400 font-mono">
                <span className="truncate">
                  {entry.npub ?? `${entry.pubkey.slice(0, 10)}…${entry.pubkey.slice(-6)}`}
                </span>
                <span>
                  {timestampFormatter.format(entry.createdAt)} · {formatRelativeTime(entry.createdAt)}
                </span>
              </header>
              <div className="mt-3 text-sm text-gray-200 whitespace-pre-wrap">
                {entry.content || "<empty event>"}
              </div>
              <footer className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-wide text-green-400/80 font-mono">
                <span>kind:{entry.kind}</span>
                <span>
                  event:{(entry.eventId ?? entry.id).slice(0, 10)}…
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </TerminalWindow>
  );
}
