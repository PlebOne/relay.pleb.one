import Link from "next/link";

import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";
import { SiteHeader } from "@/components/layout/site-header";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900 relative overflow-hidden">
      <MatrixRain />
      {/* Header */}
      <SiteHeader />

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
                  [INFO] Starting Nostr relay...
                </div>
                <div className="text-gray-400 font-mono text-sm">
                  [INFO] Lightning payments enabled ⚡
                </div>
                <div className="text-green-400 font-mono text-sm">
                  [SUCCESS] Relay online at wss://relay.pleb.one
                </div>
              </div>
              
              <div className="text-center">
                <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent font-mono">
                  {'> Community Nostr Relay <'}
                </h1>
                <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto font-mono">
                  Lightning-fast, censorship-resistant communication backed by a hardened Rust relay core.
                  <br />
                  <span className="text-green-400">Invite-only Web of Trust access</span> - Quality over quantity.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Link href="/request">
                    <GlowingButton className="text-lg px-8 py-3">
                      Request Invite
                    </GlowingButton>
                  </Link>
                  <Link href="/login">
                    <GlowingButton variant="secondary" className="text-lg px-8 py-3">
                      Member Login
                    </GlowingButton>
                  </Link>
                  <a href="#access">
                    <GlowingButton variant="secondary" className="text-lg px-8 py-3">
                      Learn More
                    </GlowingButton>
                  </a>
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
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Web of Trust</h3>
              <p className="text-gray-300 font-mono text-sm">
                Invite-only access system where trust propagates through personal connections.
              </p>
            </TerminalWindow>
            
            {/* Feature 4 */}
            <TerminalWindow title="uptime.monitor">
              <div className="text-2xl mb-4 text-center">🛰️</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Reliable Uptime</h3>
              <p className="text-gray-300 font-mono text-sm">
                Optimized for stability with automated health monitoring and resource management.
              </p>
            </TerminalWindow>
            
            {/* Feature 5 */}
            <TerminalWindow title="admin.panel">
              <div className="text-2xl mb-4 text-center">📊</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Admin Dashboard</h3>
              <p className="text-gray-300 font-mono text-sm">
                Comprehensive dashboard for monitoring activity, managing invites, and exporting relay data.
              </p>
            </TerminalWindow>
            
            {/* Feature 6 */}
            <TerminalWindow title="privacy.cfg">
              <div className="text-2xl mb-4 text-center">🛡️</div>
              <h3 className="text-xl font-semibold mb-3 text-green-400 font-mono">Privacy First</h3>
              <p className="text-gray-300 font-mono text-sm">
                Minimal logging, no trackers, and clear export tooling so you stay in control.
              </p>
            </TerminalWindow>
          </div>
        </div>
      </section>

      {/* Web of Trust Access Section */}
      <section id="access" className="py-20 border-t border-green-500/20 relative z-10">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-green-400 font-mono">
            {'$ cat /access/web-of-trust.md'}
          </h2>
          
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Main Description */}
            <TerminalWindow title="README.md">
              <div className="prose prose-invert max-w-none font-mono text-sm">
                <h3 className="text-2xl font-semibold mb-4 text-green-400">Invite-Only Web of Trust System</h3>
                <p className="text-gray-300 mb-4">
                  relay.pleb.one operates on a <span className="text-green-400 font-bold">Web of Trust</span> model. 
                  Access is granted through personal invitations, creating a network of trusted users who vouch for each other.
                </p>
                <p className="text-gray-300">
                  This system ensures high-quality content and reduces spam while maintaining decentralization principles.
                </p>
              </div>
            </TerminalWindow>

            {/* How It Works */}
            <div className="grid md:grid-cols-2 gap-6">
              <TerminalWindow title="initial-access.sh">
                <div className="space-y-3">
                  <h4 className="text-lg font-semibold text-green-400 mb-3">🔑 Getting Started</h4>
                  <div className="text-gray-300 text-sm space-y-2">
                    <p><span className="text-green-400">[1]</span> Receive an invite from an existing member</p>
                    <p><span className="text-green-400">[2]</span> Connect with your Nostr keys</p>
                    <p><span className="text-green-400">[3]</span> Get <span className="text-cyan-400 font-bold">5 invites</span> to share monthly</p>
                    <p className="text-xs text-gray-500 mt-3">
                      * Initial members are carefully vetted by admins
                    </p>
                  </div>
                </div>
              </TerminalWindow>

              <TerminalWindow title="invite-system.js">
                <div className="space-y-3">
                  <h4 className="text-lg font-semibold text-green-400 mb-3">🎟️ Monthly Invites</h4>
                  <div className="text-gray-300 text-sm space-y-2">
                    <p><span className="text-green-400">[✓]</span> <span className="font-bold">5 invites/month</span> for all members</p>
                    <p><span className="text-green-400">[✓]</span> Invites reset on the 1st of each month</p>
                    <p><span className="text-green-400">[✓]</span> Share with trusted friends & colleagues</p>
                    <p className="text-xs text-gray-500 mt-3">
                      * Unused invites don&apos;t roll over
                    </p>
                  </div>
                </div>
              </TerminalWindow>
            </div>

            {/* Accountability System */}
            <TerminalWindow title="accountability.cfg">
              <h4 className="text-xl font-semibold text-green-400 mb-4">⚖️ Accountability & Trust</h4>
              <div className="grid md:grid-cols-3 gap-6 text-sm">
                <div className="space-y-2">
                  <div className="text-red-400 font-bold mb-2">⚠️ Blacklist Violation</div>
                  <p className="text-gray-300">
                    If someone you invited gets <span className="text-red-400">blacklisted</span>, 
                    you lose invite privileges for <span className="font-bold">1 month</span>.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="text-orange-400 font-bold mb-2">🚫 Three Strikes</div>
                  <p className="text-gray-300">
                    <span className="text-orange-400 font-bold">3 blacklist violations</span> result in 
                    permanent loss of invite privileges unless reinstated by admin review.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="text-cyan-400 font-bold mb-2">⭐ Good Standing</div>
                  <p className="text-gray-300">
                    Members with <span className="text-cyan-400 font-bold">no violations</span> after 
                    <span className="font-bold"> 3 months</span> earn <span className="text-green-400 font-bold">15 invites/month</span>!
                  </p>
                </div>
              </div>
            </TerminalWindow>

            {/* Benefits */}
            <div className="grid md:grid-cols-2 gap-6">
              <TerminalWindow title="benefits.list">
                <h4 className="text-lg font-semibold text-green-400 mb-3">✨ Why This Works</h4>
                <ul className="space-y-2 text-gray-300 text-sm">
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">[✓]</span>
                    <span><span className="font-bold">Quality community:</span> Members vouch for their invites</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">[✓]</span>
                    <span><span className="font-bold">Reduced spam:</span> Accountability discourages abuse</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">[✓]</span>
                    <span><span className="font-bold">Organic growth:</span> Trusted networks expand naturally</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">[✓]</span>
                    <span><span className="font-bold">Self-moderating:</span> Community polices itself</span>
                  </li>
                </ul>
              </TerminalWindow>

              <TerminalWindow title="stats.json">
                <h4 className="text-lg font-semibold text-green-400 mb-3">📊 Quick Stats</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-gray-300">
                    <span>Base invite quota:</span>
                    <span className="text-cyan-400 font-bold">5/month</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Trusted member quota:</span>
                    <span className="text-green-400 font-bold">15/month</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Time to trusted status:</span>
                    <span className="text-green-400 font-bold">3 months</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Violation suspension:</span>
                    <span className="text-orange-400 font-bold">1 month</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Permanent ban threshold:</span>
                    <span className="text-red-400 font-bold">3 violations</span>
                  </div>
                </div>
              </TerminalWindow>
            </div>

            {/* CTA */}
            <div className="text-center pt-8">
              <div className="inline-block">
                <TerminalWindow title="get-started.sh">
                  <div className="text-center py-4 px-8">
                    <p className="text-gray-300 mb-4 font-mono text-sm">
                      Ready to join the Web of Trust?
                    </p>
                    <Link href="/request">
                      <GlowingButton className="text-lg px-8 py-3">
                        Request Invite Access
                      </GlowingButton>
                    </Link>
                    <p className="text-xs text-gray-500 mt-4">
                      Already have an invite? <Link href="/login" className="text-green-400 hover:underline">Sign in</Link> to activate your account
                    </p>
                  </div>
                </TerminalWindow>
              </div>
            </div>
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
              {" • "}
              <Link href="/report" className="hover:text-green-400 transition">[Report Abuse]</Link>
            </p>
            <div className="mt-4 text-xs text-gray-500">
              <span>{"> System uptime: 99.9% | "}</span>
              <Link
                href="/nips"
                className="text-green-400 hover:text-green-300 underline decoration-dotted"
              >
                NIPs: 01,09,11,17,23,40,42,50,51,56,62,65,66,77,86
              </Link>
              <span>{" | ⚡ Lightning enabled <"}</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}