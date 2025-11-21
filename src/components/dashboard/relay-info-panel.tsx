"use client";

import { useState } from "react";
import { GlowingButton, TerminalWindow } from "@/components/ui/cypherpunk";

export function RelayInfoPanel() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const relayUrl = "wss://relay.pleb.one";

  return (
    <div className="space-y-6">
      {/* Relay Connection Info */}
      <TerminalWindow title="relay-connection.conf">
        <h3 className="text-xl font-semibold text-green-400 mb-4">📡 Relay Connection</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm uppercase tracking-wide text-green-500/70 mb-2">
              WebSocket URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={relayUrl}
                className="flex-1 rounded-md border border-green-500/30 bg-black/60 px-3 py-2 text-sm text-white font-mono"
              />
              <GlowingButton
                variant="secondary"
                onClick={() => copyToClipboard(relayUrl, "relay")}
              >
                {copied === "relay" ? "✓ Copied" : "Copy"}
              </GlowingButton>
            </div>
          </div>
          <div className="rounded-lg border border-green-500/20 bg-green-900/10 p-3">
            <p className="text-xs text-gray-300">
              <span className="text-green-400 font-bold">Note:</span> This is an invite-only relay.
              You must be whitelisted to publish events. Reading is open to all.
            </p>
          </div>
        </div>
      </TerminalWindow>

      {/* Client Setup Instructions */}
      <div className="grid gap-4 md:grid-cols-2">
        <TerminalWindow title="damus.app">
          <h4 className="text-lg font-semibold text-green-400 mb-3">🍎 Damus (iOS)</h4>
          <ol className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">1.</span>
              <span>Open Damus and tap your profile icon</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">2.</span>
              <span>Go to <span className="text-cyan-400">Relays</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">3.</span>
              <span>Tap <span className="text-cyan-400">Add Relay</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">4.</span>
              <span>Enter: <code className="text-green-400">{relayUrl}</code></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">5.</span>
              <span>Toggle on for both Read & Write</span>
            </li>
          </ol>
        </TerminalWindow>

        <TerminalWindow title="amethyst.app">
          <h4 className="text-lg font-semibold text-green-400 mb-3">🤖 Amethyst (Android)</h4>
          <ol className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">1.</span>
              <span>Open Amethyst menu (☰)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">2.</span>
              <span>Tap <span className="text-cyan-400">Relays</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">3.</span>
              <span>Tap the <span className="text-cyan-400">+</span> button</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">4.</span>
              <span>Paste: <code className="text-green-400">{relayUrl}</code></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">5.</span>
              <span>Enable Read & Write permissions</span>
            </li>
          </ol>
        </TerminalWindow>

        <TerminalWindow title="primal.net">
          <h4 className="text-lg font-semibold text-green-400 mb-3">🌐 Primal (Web/Mobile)</h4>
          <ol className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">1.</span>
              <span>Click/tap your profile picture</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">2.</span>
              <span>Go to <span className="text-cyan-400">Settings</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">3.</span>
              <span>Select <span className="text-cyan-400">Network</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">4.</span>
              <span>Click <span className="text-cyan-400">Add Relay</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">5.</span>
              <span>Enter relay URL and save</span>
            </li>
          </ol>
        </TerminalWindow>

        <TerminalWindow title="nostrudel.ninja">
          <h4 className="text-lg font-semibold text-green-400 mb-3">🥷 noStrudel (Web)</h4>
          <ol className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">1.</span>
              <span>Click the ⚙️ Settings icon</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">2.</span>
              <span>Navigate to <span className="text-cyan-400">Relays</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">3.</span>
              <span>Click <span className="text-cyan-400">Add Relay</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">4.</span>
              <span>Paste the relay URL</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">5.</span>
              <span>Toggle Read & Write as needed</span>
            </li>
          </ol>
        </TerminalWindow>
      </div>

      {/* Testing Connection */}
      <TerminalWindow title="test-connection.sh">
        <h3 className="text-xl font-semibold text-green-400 mb-4">🔧 Test Your Connection</h3>
        <div className="space-y-3">
          <p className="text-sm text-gray-300">
            After adding the relay to your client, verify it's working:
          </p>
          <ol className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">1.</span>
              <span>Check your client's relay list - the relay should show as <span className="text-green-400">Connected</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">2.</span>
              <span>Try publishing a test note</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">3.</span>
              <span>Check the <span className="text-cyan-400">Live Feed</span> tab in this dashboard to see your event</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-bold">4.</span>
              <span>Rotate between relays in your client to verify failover works as expected</span>
            </li>
          </ol>
        </div>
      </TerminalWindow>

      {/* Support */}
      <div className="rounded-xl border border-green-500/20 bg-black/50 p-4 text-center">
        <p className="text-sm text-gray-400">
          Having trouble connecting? Check our{" "}
          <a href="/nips" className="text-green-400 hover:text-green-300 underline">
            NIPs page
          </a>{" "}
          for supported features or contact support.
        </p>
      </div>
    </div>
  );
}
