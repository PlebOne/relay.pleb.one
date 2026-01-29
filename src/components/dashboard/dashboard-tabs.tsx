"use client";

import { useState } from "react";
import { type Session } from "next-auth";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { WhitelistInvitePanel } from "@/components/dashboard/whitelist-invite-panel";
import { AdminWhitelistPanel } from "@/components/dashboard/admin-whitelist-panel";
import { AdminMessageBoard } from "@/components/dashboard/admin-message-board";
import { NipStatusPanel } from "@/components/dashboard/nip-status-panel";
import { RelayInfoPanel } from "@/components/dashboard/relay-info-panel";
import { Nip05Panel } from "@/components/dashboard/nip05-panel";
import { GlowingButton } from "@/components/ui/cypherpunk";

interface DashboardTabsProps {
  session: Session;
}

export function DashboardTabs({ session }: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<"feed" | "invites" | "setup" | "nips" | "identity" | "admin">("feed");
  const isAdmin = session.user.isAdmin;

  return (
    <div>
      {/* Tab Navigation */}
      <div className="mb-8 flex flex-wrap gap-2 border-b border-green-800/30 pb-1">
        <button
          onClick={() => setActiveTab("feed")}
          className={`rounded-t-lg px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all ${
            activeTab === "feed"
              ? "bg-green-900/20 text-green-400 border-b-2 border-green-500"
              : "text-gray-500 hover:text-green-300 hover:bg-green-900/10"
          }`}
        >
          Live Feed
        </button>
        <button
          onClick={() => setActiveTab("invites")}
          className={`rounded-t-lg px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all ${
            activeTab === "invites"
              ? "bg-green-900/20 text-green-400 border-b-2 border-green-500"
              : "text-gray-500 hover:text-green-300 hover:bg-green-900/10"
          }`}
        >
          Invites
        </button>
        <button
          onClick={() => setActiveTab("setup")}
          className={`rounded-t-lg px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all ${
            activeTab === "setup"
              ? "bg-green-900/20 text-green-400 border-b-2 border-green-500"
              : "text-gray-500 hover:text-green-300 hover:bg-green-900/10"
          }`}
        >
          Setup Guide
        </button>
        <button
          onClick={() => setActiveTab("nips")}
          className={`rounded-t-lg px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all ${
            activeTab === "nips"
              ? "bg-green-900/20 text-green-400 border-b-2 border-green-500"
              : "text-gray-500 hover:text-green-300 hover:bg-green-900/10"
          }`}
        >
          NIP Status
        </button>
        <button
          onClick={() => setActiveTab("identity")}
          className={`rounded-t-lg px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all ${
            activeTab === "identity"
              ? "bg-green-900/20 text-green-400 border-b-2 border-green-500"
              : "text-gray-500 hover:text-green-300 hover:bg-green-900/10"
          }`}
        >
          Identity
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab("admin")}
            className={`rounded-t-lg px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === "admin"
                ? "bg-green-900/20 text-green-400 border-b-2 border-green-500"
                : "text-gray-500 hover:text-green-300 hover:bg-green-900/10"
            }`}
          >
            Admin Console
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === "feed" && (
          <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <LiveFeed />

            <aside className="space-y-6">
              <div className="rounded-2xl border border-green-500/30 bg-black/70 p-5 shadow-lg shadow-green-500/10">
                <h2 className="text-lg font-semibold text-green-400">Live Stream</h2>
                <ul className="mt-3 space-y-2 text-sm text-gray-300">
                  <li>• Real-time connection to relay WebSocket.</li>
                  <li>• Showing Kind 1 (Text Notes).</li>
                  <li>• Auto-fetching user profiles (Kind 0).</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-green-500/30 bg-black/70 p-5 shadow-lg shadow-green-500/10">
                <h2 className="text-lg font-semibold text-green-400">Need deeper history?</h2>
                <p className="mt-2 text-sm text-gray-300">
                  Request a signed export from support or pull a CSV snapshot through the admin console.
                </p>
                <GlowingButton className="mt-4 w-full" variant="secondary">
                  Request export
                </GlowingButton>
              </div>
            </aside>
          </section>
        )}

        {activeTab === "invites" && (
          <div className="mx-auto max-w-3xl">
             <WhitelistInvitePanel />
          </div>
        )}

        {activeTab === "setup" && (
          <div className="mx-auto max-w-5xl">
            <RelayInfoPanel />
          </div>
        )}

        {activeTab === "nips" && (
          <div className="mx-auto max-w-5xl">
            <NipStatusPanel />
          </div>
        )}

        {activeTab === "identity" && (
          <div className="mx-auto max-w-3xl">
            <Nip05Panel />
          </div>
        )}

        {activeTab === "admin" && isAdmin && (
          <div className="space-y-8">
            <AdminMessageBoard />
            <AdminWhitelistPanel />
          </div>
        )}
      </div>
    </div>
  );
}
