import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { MatrixRain, GlowingButton, StatusIndicator } from "@/components/ui/cypherpunk";
import { ChatHistoryFeed, type ChatHistoryEntry } from "@/components/dashboard/chat-history-feed";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";

export const revalidate = 0;

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const events = await db.event.findMany({
    take: 150,
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { npub: true },
      },
    },
  });

  const totalEvents = await db.event.count();

  type RelayEvent = (typeof events)[number];

  const entries: ChatHistoryEntry[] = events.map((event: RelayEvent) => ({
    id: event.id,
    eventId: event.eventId,
    pubkey: event.pubkey,
    npub: event.author?.npub,
    kind: event.kind,
    content: event.content,
    createdAt: event.createdAt,
  }));

  const uniquePublishers = new Set(entries.map((entry) => entry.pubkey)).size;
  const latestTimestamp = entries[0]?.createdAt;
  const viewerLabel = session.user.isAdmin ? "admin" : "member";

  return (
    <main className="min-h-screen bg-black text-green-400 relative overflow-hidden">
      <MatrixRain />
      <div className="relative z-10 px-4 py-12">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <header className="rounded-2xl border border-green-500/30 bg-black/70 p-6 shadow-xl shadow-green-500/10 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-green-500/70">Relay Control Surface</p>
                <h1 className="mt-2 text-3xl font-bold">{session.user.npub ?? "Authenticated user"}</h1>
                <p className="text-sm text-gray-400">Viewing complete relay timeline as {viewerLabel}</p>
              </div>
              <div className="flex items-center gap-4">
                <StatusIndicator status="online" />
                <GlowingButton asChild>
                  <Link href="/">
                    {'<'} Back to landing
                  </Link>
                </GlowingButton>
              </div>
            </div>
            <dl className="mt-6 grid gap-4 text-sm font-mono text-gray-300 md:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-green-500/70">events captured</dt>
                <dd className="text-2xl text-white">{formatNumber(totalEvents)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-green-500/70">unique publishers</dt>
                <dd className="text-2xl text-white">{formatNumber(uniquePublishers)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-green-500/70">last activity</dt>
                <dd className="text-2xl text-white">
                  {latestTimestamp ? latestTimestamp.toLocaleString() : "n/a"}
                </dd>
              </div>
            </dl>
          </header>

          <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <ChatHistoryFeed entries={entries} viewerLabel={viewerLabel} />

            <aside className="space-y-6">
              <div className="rounded-2xl border border-green-500/30 bg-black/70 p-5 shadow-lg shadow-green-500/10">
                <h2 className="text-lg font-semibold text-green-400">Feed notes</h2>
                <ul className="mt-3 space-y-2 text-sm text-gray-300">
                  <li>• Stream includes every event observed by the relay.</li>
                  <li>• Entries are ordered newest-first and update on refresh.</li>
                  <li>• Admins will soon unlock moderation actions from this panel.</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-green-500/30 bg-black/70 p-5 shadow-lg shadow-green-500/10">
                <h2 className="text-lg font-semibold text-green-400">Need deeper history?</h2>
                <p className="mt-2 text-sm text-gray-300">
                  Export raw relay data through our Blossom storage or request a CSV snapshot. Automation hooks are coming next.
                </p>
                <GlowingButton className="mt-4 w-full" variant="secondary">
                  Request export
                </GlowingButton>
              </div>
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}
