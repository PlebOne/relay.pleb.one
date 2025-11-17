import Link from "next/link";

import { MatrixRain, TerminalWindow, GlowingButton, StatusIndicator, BitcoinPrice } from "@/components/ui/cypherpunk";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900 relative overflow-hidden">
      <MatrixRain />
      {/* Header */}
      <header className="border-b border-green-500/30 bg-black/80 backdrop-blur-sm relative z-10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold text-green-400 lightning-animation">
                ⚡ relay.pleb.one
              </div>
              <StatusIndicator status="online" />
              <div className="text-sm text-gray-400 font-mono">
                Premium Nostr Relay
              </div>
            </div>
            <nav className="flex items-center space-x-6">
              <BitcoinPrice />
              <a href="#features" className="text-green-400 hover:text-green-300 transition font-mono">
                [Features]
              </a>
              <a href="#pricing" className="text-green-400 hover:text-green-300 transition font-mono">
                [Pricing]
              </a>
              <GlowingButton>
                {'>> Connect'}
              </GlowingButton>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <TerminalWindow title="relay.pleb.one - Nostr Relay Server">
              <div className="space-y-2 mb-8">
                <div className="text-green-400 font-mono">
                  $ ./relay.pleb.one --start
                </div>
                <div className="text-gray-400 font-mono text-sm">
                  [INFO] Starting premium Nostr relay...
                </div>
                <div className="text-gray-400 font-mono text-sm">
                  [INFO] Lightning payments enabled ⚡
                </div>
                <div className="text-gray-400 font-mono text-sm">
                  [INFO] Blossom server initialized 🌸
                </div>
                <div className="text-green-400 font-mono text-sm">
                  [SUCCESS] Relay online at wss://relay.pleb.one
                </div>
              </div>
              
              <div className="text-center">
                <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent font-mono">
                  {'> Premium Nostr Relay <'}
                </h1>
                <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto font-mono">
                  Lightning-fast, censorship-resistant communication with Blossom server integration.
                  <br />
                  <span className="text-green-400">Pay with Bitcoin Lightning</span> for premium relay access.
                </p>
                <div className="flex justify-center space-x-4">
                  <GlowingButton className="text-lg px-8 py-3">
                    Start Free Trial
                  </GlowingButton>
                  <GlowingButton variant="secondary" className="text-lg px-8 py-3">
                    Learn More
                  </GlowingButton>
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 border-t border-green-500/20 relative z-10">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-green-400 font-mono">
            {'$ ls -la /relay/features/'}
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <TerminalWindow title="performance.exe">
              <div className="text-2xl mb-4 text-center">🚀</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Lightning Fast</h3>
              <p className="text-gray-300 font-mono text-sm">
                High-performance WebSocket connections with minimal latency for real-time communication.
              </p>
            </TerminalWindow>
            
            {/* Feature 2 */}
            <TerminalWindow title="security.bin">
              <div className="text-2xl mb-4 text-center">🔒</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Censorship Resistant</h3>
              <p className="text-gray-300 font-mono text-sm">
                Fully decentralized relay supporting multiple NIPs for maximum compatibility.
              </p>
            </TerminalWindow>
            
            {/* Feature 3 */}
            <TerminalWindow title="lightning.js">
              <div className="text-2xl mb-4 text-center lightning-animation">⚡</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Lightning Payments</h3>
              <p className="text-gray-300 font-mono text-sm">
                Pay with Bitcoin Lightning Network for premium access. No KYC required.
              </p>
            </TerminalWindow>
            
            {/* Feature 4 */}
            <TerminalWindow title="blossom.srv">
              <div className="text-2xl mb-4 text-center">🌸</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Blossom Server</h3>
              <p className="text-gray-300 font-mono text-sm">
                Integrated image hosting with automatic EXIF removal and secure storage.
              </p>
            </TerminalWindow>
            
            {/* Feature 5 */}
            <TerminalWindow title="admin.panel">
              <div className="text-2xl mb-4 text-center">📊</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Admin Dashboard</h3>
              <p className="text-gray-300 font-mono text-sm">
                Comprehensive dashboard for managing uploads, viewing stats, and downloading data.
              </p>
            </TerminalWindow>
            
            {/* Feature 6 */}
            <TerminalWindow title="privacy.cfg">
              <div className="text-2xl mb-4 text-center">🛡️</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Privacy First</h3>
              <p className="text-gray-300 font-mono text-sm">
                Automatic EXIF removal, no tracking, and full data export capabilities.
              </p>
            </TerminalWindow>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 border-t border-green-500/20 relative z-10">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-green-400 font-mono">
            {'$ cat /pricing/plans.json'}
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Relay Plan */}
            <TerminalWindow title="relay-basic.plan">
              <h3 className="text-2xl font-semibold mb-4 text-green-400 font-mono">Relay Access</h3>
              <div className="text-4xl font-bold mb-4 text-white font-mono">
                1,250 <span className="text-lg text-gray-400">sats/month</span>
              </div>
              <ul className="space-y-3 mb-8 text-gray-300 font-mono text-sm">
                <li className="flex items-center">
                  <span className="text-green-400 mr-2">[✓]</span>
                  Full Nostr relay access
                </li>
                <li className="flex items-center">
                  <span className="text-green-400 mr-2">[✓]</span>
                  All supported NIPs
                </li>
                <li className="flex items-center">
                  <span className="text-green-400 mr-2">[✓]</span>
                  High-speed connections
                </li>
                <li className="flex items-center">
                  <span className="text-green-400 mr-2">[✓]</span>
                  Export your data anytime
                </li>
              </ul>
              <GlowingButton className="w-full">
                Subscribe Now
              </GlowingButton>
            </TerminalWindow>
            
            {/* Combo Plan */}
            <div className="relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-400 text-black px-4 py-1 rounded-full text-sm font-semibold z-20">
                RECOMMENDED
              </div>
              <TerminalWindow title="premium-combo.plan">
                <div className="bg-gradient-to-br from-green-600/20 to-cyan-600/20 rounded p-4 -m-4">
                  <h3 className="text-2xl font-semibold mb-4 text-green-400 font-mono">Relay + Blossom</h3>
                  <div className="text-4xl font-bold mb-4 text-white font-mono">
                    6,250 <span className="text-lg text-gray-400">sats/month</span>
                  </div>
                  <ul className="space-y-3 mb-8 text-gray-300 font-mono text-sm">
                    <li className="flex items-center">
                      <span className="text-green-400 mr-2">[✓]</span>
                      Everything in Relay plan
                    </li>
                    <li className="flex items-center">
                      <span className="text-green-400 mr-2">[✓]</span>
                      Blossom server access
                    </li>
                    <li className="flex items-center">
                      <span className="text-green-400 mr-2">[✓]</span>
                      Image hosting & management
                    </li>
                    <li className="flex items-center">
                      <span className="text-green-400 mr-2">[✓]</span>
                      Automatic EXIF removal
                    </li>
                    <li className="flex items-center">
                      <span className="text-green-400 mr-2">[✓]</span>
                      Secure cloud storage
                    </li>
                  </ul>
                  <GlowingButton className="w-full">
                    Subscribe Now
                  </GlowingButton>
                </div>
              </TerminalWindow>
            </div>
          </div>
          
          <div className="text-center mt-8">
            <p className="text-gray-400">
              💡 Save 15% with yearly subscriptions • No KYC required • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-green-500/20 py-8 relative z-10">
        <div className="container mx-auto px-4">
          <div className="text-center text-gray-400 font-mono">
            <p className="text-sm">
              {'$ echo "© 2025 relay.pleb.one - Built for the Nostr ecosystem"'}
            </p>
            <p className="mt-2 text-sm">
              <a href="/terms" className="hover:text-green-400 transition">[Terms]</a>
              {" • "}
              <a href="/privacy" className="hover:text-green-400 transition">[Privacy]</a>
              {" • "}
              <a href="/contact" className="hover:text-green-400 transition">[Contact]</a>
            </p>
            <div className="mt-4 text-xs text-gray-500">
              <span>{"> System uptime: 99.9% | "}</span>
              <Link
                href="/nips"
                className="text-green-400 hover:text-green-300 underline decoration-dotted"
              >
                NIPs: 01,09,11,17,23,40,42,50,51,56,62,77,86
              </Link>
              <span>{" | ⚡ Lightning enabled <"}</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}