"use client";

import Link from "next/link";
import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";
import { SiteHeader } from "@/components/layout/site-header";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-950 via-black to-gray-950 relative overflow-hidden">
      <MatrixRain />
      <SiteHeader />

      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <TerminalWindow title="privacy-policy.md">
              <div className="space-y-6 font-mono text-sm text-gray-300">
                <h1 className="text-3xl font-bold text-green-400 mb-6">Privacy Policy</h1>
                
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">1. The Basics</h2>
                  <p>
                    We run a Nostr relay. By definition, a relay's job is to receive public messages (Events) and broadcast them to anyone who asks. 
                    <strong className="text-white"> If you send an event to this relay, you are making it public.</strong> We cannot "un-publish" data that has already been synced to other relays or clients.
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">2. Data We Collect</h2>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>
                      <span className="text-green-400">Nostr Events:</span> The JSON blobs you sign and send to us. We store these so other people can read them.
                    </li>
                    <li>
                      <span className="text-green-400">Account Info:</span> If you log in to our dashboard, we store your public key (npub) and display name to manage your whitelist status.
                    </li>
                    <li>
                      <span className="text-green-400">Connection Logs:</span> Our web server (Caddy) temporarily logs IP addresses for security and anti-abuse purposes (e.g., rate limiting).
                    </li>
                    <li>
                      <span className="text-green-400">Admin Messages:</span> If you submit an invite request or appeal, we store the text you wrote, your IP address, and your User Agent string to help us filter spam.
                    </li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">3. Cookies & Local Storage</h2>
                  <p>
                    We use a single session cookie (`next-auth.session-token`) to keep you logged in to the dashboard. That's it. No tracking pixels, no analytics scripts, no third-party ad networks spying on you.
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">4. Data Sharing</h2>
                  <p>
                    We do not sell your data. We do not share your private data (like IP logs) with third parties unless compelled by a valid legal order (and even then, we'll try to fight it if it's stupid).
                  </p>
                  <p>
                    However, remember that <span className="text-white">Nostr events are public data</span>. We share them with every client that connects to this relay. That is the entire point of the protocol.
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">5. Your Rights</h2>
                  <p>
                    You can ask us to delete your account from our whitelist database. This will revoke your access to write to the relay.
                  </p>
                  <p>
                    You can send NIP-09 deletion events to remove your posts. Our relay respects these and will delete the referenced content from our database. However, we cannot delete content from <em>other</em> relays that may have already copied it.
                  </p>
                </div>

                <div className="pt-8 border-t border-green-500/20">
                  <p className="text-xs text-gray-500">
                    Last Updated: November 2025
                  </p>
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </section>
    </main>
  );
}
