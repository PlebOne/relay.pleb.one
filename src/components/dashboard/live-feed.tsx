"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { SimplePool, type Event } from "nostr-tools";
import { TerminalWindow } from "@/components/ui/cypherpunk";

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL || "wss://relay.pleb.one";

type UserMetadata = {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
};

type EnrichedEvent = Event & {
  user?: UserMetadata;
};

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const formatRelativeTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
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

const extractImages = (content: string) => {
  const imgRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi;
  const images = content.match(imgRegex) || [];
  const text = content.replace(imgRegex, "").trim();
  return { text, images };
};

export function LiveFeed() {
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [metadata, setMetadata] = useState<Record<string, UserMetadata>>({});
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const poolRef = useRef<SimplePool | null>(null);
  const processedEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pool = new SimplePool();
    poolRef.current = pool;

    const connect = async () => {
      try {
        // Subscribe to recent events
        const sub = pool.subscribeMany(
          [RELAY_URL],
          [
            {
              kinds: [1], // Text notes
              limit: 50,
            },
          ],
          {
            onevent(event) {
              if (processedEvents.current.has(event.id)) return;
              processedEvents.current.add(event.id);

              setEvents((prev) => {
                const newEvents = [event, ...prev].sort((a, b) => b.created_at - a.created_at);
                return newEvents.slice(0, 100); // Keep last 100
              });

              // Fetch metadata if missing
              if (!metadata[event.pubkey]) {
                fetchMetadata(pool, event.pubkey);
              }
            },
            oneose() {
              setStatus("connected");
            },
          }
        );

        return () => {
          sub.close();
          pool.close(Array.from(pool.listConnectionStatus().keys()));
        };
      } catch (err) {
        console.error("Relay connection error:", err);
        setStatus("error");
      }
    };

    connect();

    return () => {
      if (poolRef.current) {
        // Cleanup handled by sub.close() above mostly, but good practice
      }
    };
  }, []);

  const fetchMetadata = async (pool: SimplePool, pubkey: string) => {
    // Debounce or batch could be better, but simple for now
    const event = await pool.get([RELAY_URL], {
      kinds: [0],
      authors: [pubkey],
    });

    if (event) {
      try {
        const content = JSON.parse(event.content);
        setMetadata((prev) => ({
          ...prev,
          [pubkey]: content,
        }));
      } catch (e) {
        console.error("Failed to parse metadata for", pubkey);
      }
    }
  };

  return (
    <TerminalWindow title={`relay-feed --live --source ${RELAY_URL}`}>
      <div className="mb-4 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              status === "connected" ? "bg-green-500 animate-pulse" : "bg-yellow-500"
            }`}
          />
          <span className="uppercase text-gray-400">{status}</span>
        </div>
        <div className="text-gray-500">
          Showing last {events.length} events
        </div>
      </div>

      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-black">
        {events.length === 0 && status === "connected" && (
          <div className="text-center py-12 text-gray-500">
            Waiting for events...
          </div>
        )}
        
        {events.map((event) => {
          const user = metadata[event.pubkey] || {};
          const { text, images } = extractImages(event.content);
          const displayName = user.display_name || user.name || `${event.pubkey.slice(0, 8)}...`;
          
          return (
            <article
              key={event.id}
              className="group relative rounded-lg border border-green-500/10 bg-black/40 p-4 transition-all hover:border-green-500/30 hover:bg-green-900/5"
            >
              <div className="flex gap-4">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={displayName}
                      className="h-10 w-10 rounded-full border border-green-500/30 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${event.pubkey}`;
                      }}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full border border-green-500/30 bg-green-900/20 p-1">
                      <img
                        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${event.pubkey}`}
                        alt="avatar"
                        className="h-full w-full opacity-70"
                      />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <header className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-green-400 truncate">
                        {displayName}
                      </span>
                      {user.nip05 && (
                        <span className="text-xs text-green-500/60 truncate max-w-[150px]">
                          {user.nip05.replace("_@", "")}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap" title={new Date(event.created_at * 1000).toLocaleString()}>
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </header>

                  <div className="mt-2 text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                    {text}
                  </div>

                  {images.length > 0 && (
                    <div className="mt-3 grid gap-2 grid-cols-2">
                      {images.map((img, i) => (
                        <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-green-500/20 bg-black/50">
                          <img
                            src={img}
                            alt="attachment"
                            className="h-48 w-full object-cover transition-transform hover:scale-105"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  <footer className="mt-3 flex items-center gap-4 text-[10px] uppercase tracking-wider text-gray-500 font-mono opacity-0 transition-opacity group-hover:opacity-100">
                    <span>ID: {event.id.slice(0, 8)}</span>
                    <span>KIND: {event.kind}</span>
                    <button 
                      className="hover:text-green-400"
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(event))}
                    >
                      COPY JSON
                    </button>
                  </footer>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </TerminalWindow>
  );
}
