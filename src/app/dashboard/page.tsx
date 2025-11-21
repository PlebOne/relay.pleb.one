import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { MatrixRain, GlowingButton, StatusIndicator } from "@/components/ui/cypherpunk";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";

export const revalidate = 0;

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const totalEvents = await db.event.count();
  
  // Get unique publishers count
  const uniquePublishers = await db.event.groupBy({
    by: ['pubkey'],
  }).then(res => res.length);

  const latestEvent = await db.event.findFirst({
    orderBy: { createdAt: "desc" },
  });

  const latestTimestamp = latestEvent?.createdAt;
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

          <DashboardTabs session={session} />
        </div>
      </div>
    </main>
  );
}
