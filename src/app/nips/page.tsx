import Link from "next/link";

import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";

const nipEntries = [
  {
    number: "01",
    title: "Basic Protocol Flow",
    summary:
      "Defines the canonical event envelope, message types, tags, and subscription flow that every Nostr client and relay speaks.",
    focus: "Protocol core",
    status: "draft · mandatory",
    reference: "https://github.com/nostr-protocol/nips/blob/master/01.md",
  },
  {
    number: "09",
    title: "Event Deletion Request",
    summary:
      "Introduces kind 5 deletion requests that reference prior events via e/a/k tags so relays and clients can hide or drop disowned content.",
    focus: "Content lifecycle",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/09.md",
  },
  {
    number: "11",
    title: "Relay Information Document",
    summary:
      "Specifies the HTTP metadata document (Accept: application/nostr+json) that advertises relay capabilities, policies, fees, and limits.",
    focus: "Relay metadata",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/11.md",
  },
  {
    number: "17",
    title: "Private Direct Messages",
    summary:
      "Defines the encrypted chat scheme that uses NIP-44 encryption plus NIP-59 gift wraps for kind 14/15 messages and DM relay hints.",
    focus: "Private messaging",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/17.md",
  },
  {
    number: "23",
    title: "Long-form Content",
    summary:
      "Describes kind 30023/30024 Markdown articles with d-tag identifiers, metadata tags (title/image/summary), and NIP-22 comment threading.",
    focus: "Publishing",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/23.md",
  },
  {
    number: "40",
    title: "Expiration Timestamp",
    summary:
      "Adds the expiration tag so authors can set a unix timestamp where relays drop or stop serving the event and clients ignore it.",
    focus: "Data retention",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/40.md",
  },
  {
    number: "42",
    title: "Client Authentication",
    summary:
      "Defines AUTH messages and kind 22242 challenge events so relays can gate reads and writes behind signed, time-bound proofs.",
    focus: "Access control",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/42.md",
  },
  {
    number: "50",
    title: "Search Capability",
    summary:
      "Adds the search filter field so relays can interpret free-text queries, score results, and expose optional extensions like domain: or language:.",
    focus: "Discovery",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/50.md",
  },
  {
    number: "51",
    title: "Lists",
    summary:
      "Introduces standard lists and addressable sets (follows, mutes, bookmarks, relay groups) with optional encrypted content so users can curate both public and private references.",
    focus: "Lists & curation",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/51.md",
  },
  {
    number: "56",
    title: "Reporting",
    summary:
      "Introduces kind 1984 reporting events with typed reasons (spam, malware, nudity, etc.) referencing pubkeys/events/blobs for moderation tooling.",
    focus: "Moderation",
    status: "optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/56.md",
  },
  {
    number: "62",
    title: "Request to Vanish",
    summary:
      "Specifies kind 62 requests directing tagged relays (or ALL_RELAYS) to purge every event from a pubkey and block rebroadcasts going forward.",
    focus: "Account resets",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/62.md",
  },
  {
    number: "65",
    title: "Relay List Metadata",
    summary:
      "Defines kind 10002 events where users publish their preferred read/write relays, allowing clients to discover where to find them.",
    focus: "Discovery",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/65.md",
  },
  {
    number: "66",
    title: "Decentralized Relay Monitoring",
    summary:
      "Relays publish kind 30166 events containing their own metrics, software version, and supported NIPs for decentralized monitoring.",
    focus: "Monitoring",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/66.md",
  },
  {
    number: "77",
    title: "Negentropy Syncing",
    summary:
      "Wraps the Negentropy range-based reconciliation protocol in NEG-* messages so clients and relays can sync event IDs efficiently.",
    focus: "Sync",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/77.md",
  },
  {
    number: "86",
    title: "Relay Management API",
    summary:
      "Outlines an optional JSON-RPC management API (ban/allow keys, edit metadata, configure limits) authenticated with NIP-98 payloads.",
    focus: "Relay ops",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/86.md",
  },
  {
    number: "87",
    title: "Nostr Discovery & Content Curation",
    summary:
      "Defines a standard for discovering content and curating collections of events, pubkeys, and other data to improve content discovery.",
    focus: "Discovery",
    status: "draft · optional",
    reference: "https://github.com/nostr-protocol/nips/blob/master/87.md",
  },
] as const;

export default function NipsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900 relative overflow-hidden">
      <MatrixRain />
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <TerminalWindow title="relay.pleb.one/nips">
            <div className="space-y-4 font-mono text-sm text-gray-300">
              <p>
                $ cat reference/nips.log
              </p>
              <p className="text-base text-gray-100">
                This relay implements a curated set of Nostr Implementation Possibilities (NIPs).
                Use this page as a quick memory aid and follow the spec links for full details straight from the source repo.
              </p>
              <p className="text-xs text-gray-400">
                All summaries paraphrase the official markdown files maintained at
                {" "}
                <a
                  href="https://github.com/nostr-protocol/nips"
                  target="_blank"
                  rel="noreferrer"
                  className="text-green-400 hover:text-green-300 underline"
                >
                  github.com/nostr-protocol/nips
                </a>
                .
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <GlowingButton asChild>
                  <Link href="/">
                    {'<< Back to landing'}
                  </Link>
                </GlowingButton>
                <GlowingButton variant="secondary" asChild>
                  <a href="https://nostr.com/nips" target="_blank" rel="noreferrer">
                    {'Open full NIP index ↗'}
                  </a>
                </GlowingButton>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </section>

      <section className="pb-24 relative z-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid gap-8 md:grid-cols-2">
            {nipEntries.map((nip) => (
              <TerminalWindow key={nip.number} title={`NIP-${nip.number} · ${nip.title}`}>
                <div className="space-y-4">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {nip.summary}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono uppercase tracking-wide text-gray-400">
                    <span className="px-2 py-1 rounded bg-green-500/10 border border-green-500/40 text-green-300">
                      {nip.focus}
                    </span>
                    <span className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-200">
                      {nip.status}
                    </span>
                    <a
                      href={nip.reference}
                      target="_blank"
                      rel="noreferrer"
                      className="text-green-400 hover:text-green-300 underline decoration-dotted"
                    >
                      {'Read spec ↗'}
                    </a>
                  </div>
                </div>
              </TerminalWindow>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
