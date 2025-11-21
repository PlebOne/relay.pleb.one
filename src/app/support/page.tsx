"use client";

import Link from "next/link";
import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";
import { SiteHeader } from "@/components/layout/site-header";

export default function SupportPage() {
  const btcAddress = "bc1q9a4hcjpk3v3297t4dvhamg5gjj7dxc0nq9gf5l";
  const lnAddress = "plebone@rizful.com";

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
          <div className="max-w-3xl mx-auto">
            <TerminalWindow title="value-4-value.sh">
              <div className="space-y-8 font-mono">
                <div className="text-center">
                  <h1 className="text-3xl font-bold text-green-400 mb-4">Keep the Network Flowing</h1>
                  <p className="text-gray-300 text-lg mb-6">
                    Value for Value. Support the relay if you can.
                  </p>
                </div>

                <div className="bg-green-900/10 border border-green-500/30 rounded-xl p-6 text-sm text-gray-300 space-y-4">
                  <p>
                    We believe access to censorship-resistant communication should be available to everyone, regardless of their financial situation.
                  </p>
                  <p>
                    For some, 1,000 sats is pocket change. For others, it's a week's worth of groceries. We want to be open for business no matter what your situation is.
                  </p>
                  <p>
                    If you find value in this relay and have the means, please consider supporting its operation. Your contribution helps keep the servers running, the bandwidth flowing, and the access free for those who need it most.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Bitcoin Card */}
                  <div className="rounded-xl border border-orange-500/30 bg-black/50 p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-50 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs text-orange-500 border border-orange-500/30 rounded px-2 py-1">BITCOIN</span>
                    </div>
                    
                    <div className="flex flex-col items-center text-center">
                      <div className="h-16 w-16 rounded-full bg-orange-900/20 border border-orange-500/30 flex items-center justify-center text-3xl mb-4">
                        ₿
                      </div>
                      <h3 className="text-lg font-bold text-orange-400 mb-2">On-Chain</h3>
                      <div className="bg-black/60 rounded p-3 border border-orange-500/20 mb-4 w-full">
                        <code className="text-xs text-orange-300 break-all block">
                          {btcAddress}
                        </code>
                      </div>
                      <button 
                        onClick={() => copyToClipboard(btcAddress)}
                        className="w-full bg-orange-900/20 hover:bg-orange-900/40 text-orange-400 border border-orange-500/30 px-4 py-2 rounded transition-colors text-sm font-bold"
                      >
                        Copy Address
                      </button>
                    </div>
                  </div>

                  {/* Lightning Card */}
                  <div className="rounded-xl border border-yellow-500/30 bg-black/50 p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-50 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs text-yellow-500 border border-yellow-500/30 rounded px-2 py-1">LIGHTNING</span>
                    </div>
                    
                    <div className="flex flex-col items-center text-center">
                      <div className="h-16 w-16 rounded-full bg-yellow-900/20 border border-yellow-500/30 flex items-center justify-center text-3xl mb-4 lightning-animation">
                        ⚡
                      </div>
                      <h3 className="text-lg font-bold text-yellow-400 mb-2">Lightning Address</h3>
                      <div className="bg-black/60 rounded p-3 border border-yellow-500/20 mb-4 w-full">
                        <code className="text-xs text-yellow-300 break-all block">
                          {lnAddress}
                        </code>
                      </div>
                      <button 
                        onClick={() => copyToClipboard(lnAddress)}
                        className="w-full bg-yellow-900/20 hover:bg-yellow-900/40 text-yellow-400 border border-yellow-500/30 px-4 py-2 rounded transition-colors text-sm font-bold"
                      >
                        Copy Address
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-center pt-8 border-t border-green-500/20">
                  <p className="text-xs text-gray-500 mb-4">
                    Thank you for supporting the free and open web.
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
