import Link from "next/link";

const linkClass =
  "font-mono text-sm text-green-400 underline underline-offset-4 hover:text-green-300 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-green-400 focus-visible:outline-offset-2";

// Interim pairing link; swap to PlebOne-hosted pairing docs once they exist.
const OMOSTRICH_PAIRING_URL = "https://github.com/ninepointlabs/omostrich#install";

export function PlebOneCommunity({ variant }: { variant: "request" | "login" }) {
  return (
    <aside
      aria-labelledby="pc-title"
      className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-l-4 border-green-500/40 border-l-green-500 bg-green-950/25 px-[18px] py-3.5"
    >
      <div
        aria-hidden="true"
        className="grid h-11 w-11 flex-none place-items-center rounded-md border border-green-400/60"
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          stroke="#4ade80"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 9l5 5-5 5" />
          <path d="M14 19h9" />
        </svg>
      </div>
      <div className="min-w-[18rem] flex-1 text-left">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-green-300">PlebOne community</p>
        <h2 id="pc-title" className="font-mono text-lg font-bold text-green-400">
          A community relay, run in the open
        </h2>
        <p className="text-sm leading-relaxed text-gray-300">
          {variant === "request" ? (
            <>
              relay.pleb.one is part of PlebOne, a small home for open-source Nostr tools. Invites are reviewed by
              people, not bots.
            </>
          ) : (
            <>
              relay.pleb.one is part of PlebOne, a small home for open-source Nostr tools. New here?{" "}
              <Link href="/request" className="text-green-400 underline underline-offset-4 hover:text-green-300 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-green-400 focus-visible:outline-offset-2">
                Request an invite
              </Link>
              .
            </>
          )}
        </p>
      </div>
      <div className="flex w-full flex-wrap gap-4">
        <a href="https://github.com/PlebOne" target="_blank" rel="noopener" className={linkClass}>
          PlebOne on GitHub ↗<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <a href={OMOSTRICH_PAIRING_URL} target="_blank" rel="noopener" className={linkClass}>
          Pair with Omostrich ↗<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </aside>
  );
}
