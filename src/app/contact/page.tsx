"use client";

import { useState } from "react";
import Link from "next/link";
import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";
import { SiteHeader } from "@/components/layout/site-header";

export default function ContactPage() {
  const [showEmail, setShowEmail] = useState(false);
  const adminNpub = "npub13hyx3qsqk3r7ctjqrr49uskut4yqjsxt8uvu4rekr55p08wyhf0qq90nt7";
  const adminName = "PlebAdmin";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-950 via-black to-gray-950 relative overflow-hidden">
      <MatrixRain />
      <SiteHeader />

      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <TerminalWindow title="contact-info.vcf">
              <div className="space-y-8 font-mono">
                <div className="text-center">
                  <h1 className="text-3xl font-bold text-green-400 mb-2">Contact Admin</h1>
                  <p className="text-gray-400 text-sm">
                    Need help? Found a bug? Just want to say hi?
                  </p>
                </div>

                {/* Nostr Contact Card */}
                <div className="rounded-xl border border-green-500/30 bg-black/50 p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-50 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs text-green-500 border border-green-500/30 rounded px-2 py-1">NOSTR</span>
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 rounded-full bg-green-900/20 border border-green-500/30 flex items-center justify-center text-2xl">
                      🧙‍♂️
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-green-400">{adminName}</h3>
                      <p className="text-sm text-gray-400 mb-3">Relay Operator</p>
                      
                      <div className="bg-black/60 rounded p-3 border border-green-500/20 mb-3">
                        <code className="text-xs text-green-300 break-all block">
                          {adminNpub}
                        </code>
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => copyToClipboard(adminNpub)}
                          className="text-xs bg-green-900/20 hover:bg-green-900/40 text-green-400 border border-green-500/30 px-3 py-1.5 rounded transition-colors"
                        >
                          Copy npub
                        </button>
                        <a 
                          href={`nostr:${adminNpub}`}
                          className="text-xs bg-green-500/10 hover:bg-green-500/20 text-green-300 border border-green-500/30 px-3 py-1.5 rounded transition-colors"
                        >
                          Open in Client
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email Contact Card */}
                <div className="rounded-xl border border-green-500/30 bg-black/50 p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-50 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs text-green-500 border border-green-500/30 rounded px-2 py-1">EMAIL</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-green-900/20 border border-green-500/30 flex items-center justify-center text-xl">
                      📧
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-green-400 mb-1">Email Support</h3>
                      {showEmail ? (
                        <a 
                          href="mailto:relay@pleb.one" 
                          className="text-green-300 hover:text-green-200 transition-colors"
                        >
                          relay@pleb.one
                        </a>
                      ) : (
                        <button
                          onClick={() => setShowEmail(true)}
                          className="text-sm text-gray-400 hover:text-green-400 underline decoration-dotted transition-colors"
                        >
                          [Click to reveal email]
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-center pt-8 border-t border-green-500/20">
                  <p className="text-xs text-gray-500 mb-4">
                    For urgent matters, please use Nostr DM. Email response times may vary.
                  </p>
                  <Link href="/">
                    <GlowingButton variant="secondary">
                      Return Home
                    </GlowingButton>
                  </Link>
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </section>
    </main>
  );
}
