"use client";

import Link from "next/link";
import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";
import { SiteHeader } from "@/components/layout/site-header";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-950 via-black to-gray-950 relative overflow-hidden">
      <MatrixRain />
      <SiteHeader />

      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <TerminalWindow title="terms-of-service.txt">
              <div className="space-y-6 font-mono text-sm text-gray-300">
                <h1 className="text-3xl font-bold text-green-400 mb-6">Terms of Service</h1>
                
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">1. The "Free Lunch" Clause</h2>
                  <p>
                    This is a free service. You are paying exactly 0 sats for it. As such, you are entitled to exactly 0 sats worth of refunds, guarantees, or emotional support if things go sideways. We try our best to keep the lights on, but if the server catches fire or gets eaten by a grue, we owe you nothing but a sad trombone sound effect.
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">2. The "Don't Be A Jerk" Rule</h2>
                  <p>
                    We run a Web of Trust system. If you act like a spam-bot, a scammer, or generally make the relay a miserable place for others, we will ban you. If you invite people who act like jerks, we might ban you too (or at least put you in timeout).
                  </p>
                  <p>
                    "Free speech" does not mean "obligated to host your noise." This is a private relay. We reserve the right to refuse service to anyone, for any reason, or for no reason at all. Usually, it's because you were being a jerk.
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">3. Content & Liability</h2>
                  <p>
                    You are responsible for what you sign with your private key. We are just a dumb pipe (a relay) that moves JSON blobs from A to B. We don't endorse your content, we don't verify your content, and we certainly don't want to be sued for your content.
                  </p>
                  <p>
                    If you post illegal stuff, that's on you. Don't do that.
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">4. Uptime & Reliability</h2>
                  <p>
                    We aim for 99.9% uptime, but we promise 0%. Sometimes we need to reboot to install updates. Sometimes the internet breaks. Sometimes we just want to sleep. If this relay is critical to your life support system, please reconsider your life choices.
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-green-400">5. Changes to Terms</h2>
                  <p>
                    We might change these terms later. If we do, we'll probably just update this file. It's up to you to check back here and see if we've added a clause demanding your firstborn child (we won't, they eat too much).
                  </p>
                </div>

                <div className="pt-8 border-t border-green-500/20">
                  <p className="text-xs text-gray-500">
                    Last Updated: November 2025 (The "It works on my machine" Edition)
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
