"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";

// NIP-07 types are declared globally in src/types/nostr.d.ts

const AUTH_KIND = 22242;

export default function LoginPage() {
  const router = useRouter();
  const [npub, setNpub] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [nip07Error, setNip07Error] = useState<string | null>(null);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [isNip07Pending, startNip07Auth] = useTransition();
  const [isCredentialsPending, startCredentialsAuth] = useTransition();

  const waitForExtension = async (maxAttempts = 20, delayMs = 100): Promise<boolean> => {
    for (let i = 0; i < maxAttempts; i++) {
      if (typeof window !== "undefined" && window.nostr) {
        try {
          await Promise.race([
            window.nostr.getPublicKey(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000))
          ]);
          return true;
        } catch {
          // Extension exists but not ready or timed out
        }
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return false;
  };

  const handleNip07Login = () => {
    startNip07Auth(async () => {
      setNip07Error(null);
      setMessage(null);

      // Wait for extension to be ready
      const extensionReady = await waitForExtension();
      if (!extensionReady) {
        setNip07Error("NIP-07 extension not found. Please install Alby, nos2x, Flamingo, or another compatible extension and refresh.");
        return;
      }

      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        try {
          // Get pubkey with timeout protection
          const pubkeyPromise = window.nostr!.getPublicKey();
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error("Extension timeout - took longer than 10 seconds")), 10000)
          );
          
          const pubkey = await Promise.race([pubkeyPromise, timeoutPromise]);
          
          // Validate pubkey format (64-char hex)
          if (!pubkey || typeof pubkey !== "string" || !/^[0-9a-f]{64}$/i.test(pubkey)) {
            throw new Error("Invalid public key format from extension");
          }

          // Create authentication event template (NIP-98)
          const eventTemplate = {
            kind: AUTH_KIND,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ["relay", "wss://relay.pleb.one"],
              ["client", "relay.pleb.one"],
              ["challenge", crypto.randomUUID()],
            ],
            content: "Authentication request for relay.pleb.one",
          };

          // Sign event with timeout protection (30s for user interaction)
          const signPromise = window.nostr!.signEvent(eventTemplate);
          const signTimeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error("Signing timeout - took longer than 30 seconds")), 30000)
          );
          
          const signedEvent = await Promise.race([signPromise, signTimeout]);
          
          // Comprehensive validation of signed event
          if (!signedEvent?.id || !signedEvent?.sig || !signedEvent?.pubkey ||
              !signedEvent.kind || !signedEvent.created_at || 
              !Array.isArray(signedEvent.tags) || typeof signedEvent.content !== 'string') {
            throw new Error("Extension returned invalid or incomplete event");
          }

          // Security check: verify pubkey consistency
          if (signedEvent.pubkey !== pubkey) {
            throw new Error("Security error: Pubkey mismatch in signed event");
          }

          // Submit to authentication server
          const result = await signIn("nip07", {
            pubkey: signedEvent.pubkey,
            event: JSON.stringify(signedEvent),
            redirect: false,
          });

          if (!result) {
            throw new Error("No response from server");
          }

          if (result.error) {
            throw new Error(result.error === "CredentialsSignin" 
              ? "Authentication failed - please try again" 
              : result.error);
          }

          if (!result.ok) {
            throw new Error("Authentication rejected by server");
          }

          // Success!
          setMessage("✓ Authenticated successfully");
          router.push("/dashboard");
          return;

        } catch (error) {
          retries++;
          console.error(`NIP-07 attempt ${retries}/${maxRetries + 1} failed:`, error);
          
          if (retries > maxRetries) {
            // Final failure - provide helpful error message
            if (error instanceof Error) {
              const msg = error.message.toLowerCase();
              if (msg.includes("timeout")) {
                setNip07Error("Extension timeout. Try again or use a different extension.");
              } else if (msg.includes("reject") || msg.includes("cancel") || msg.includes("denied")) {
                setNip07Error("You cancelled the signature. Click again and approve to continue.");
              } else if (msg.includes("not found") || msg.includes("not detected")) {
                setNip07Error("Extension not accessible. Please check it's enabled and try again.");
              } else {
                setNip07Error(`Error: ${error.message}`);
              }
            } else {
              setNip07Error("Authentication failed. Please try again.");
            }
            return;
          }
          
          // Exponential backoff before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    });
  };

  const handleCredentialsLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startCredentialsAuth(async () => {
      setCredentialsError(null);
      setMessage(null);

      const trimmedNpub = npub.trim();
      
      // Client-side validation
      if (!trimmedNpub) {
        setCredentialsError("Please enter your npub");
        return;
      }
      
      if (!password) {
        setCredentialsError("Please enter your password");
        return;
      }

      if (!trimmedNpub.startsWith('npub1')) {
        setCredentialsError("Invalid npub format - must start with 'npub1'");
        return;
      }

      if (password.length < 8) {
        setCredentialsError("Password must be at least 8 characters");
        return;
      }

      try {
        const result = await signIn("npub-password", {
          npub: trimmedNpub,
          password,
          redirect: false,
        });

        if (result?.error) {
          const errorMsg = result.error === "CredentialsSignin" 
            ? "Invalid npub or password" 
            : result.error;
          setCredentialsError(errorMsg);
          return;
        }

        if (!result?.ok) {
          setCredentialsError("Authentication failed - please try again");
          return;
        }

        setMessage("✓ Authenticated successfully");
        router.push("/dashboard");
      } catch (error) {
        console.error("Password auth error:", error);
        setCredentialsError("An error occurred. Please try again.");
      }
    });
  };

  return (
    <main className="min-h-screen bg-black text-green-400 relative overflow-hidden">
      <MatrixRain />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-4xl space-y-8">
          <div className="text-center space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-green-500">Secure Access</p>
            <h1 className="text-4xl font-bold">Authenticate with Nostr</h1>
            <p className="text-gray-400">
              Two secure authentication methods. First user becomes admin automatically.
            </p>
            <p className="text-sm text-gray-500">
              Need an invite? <Link href="/request" className="text-green-300 underline decoration-dotted">Request access instead</Link>.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* NIP-07 Browser Extension - Primary Method */}
            <TerminalWindow title="auth --method nip07">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-gray-300">
                    <strong className="text-green-400">Recommended:</strong> Use a NIP-07 browser extension to sign securely.
                  </p>
                  <p className="text-xs text-gray-500">
                    Compatible with: Alby, nos2x, Flamingo, Horse, Nostore
                  </p>
                </div>
                <GlowingButton
                  onClick={handleNip07Login}
                  disabled={isNip07Pending}
                  className="w-full justify-center"
                >
                  {isNip07Pending ? "Waiting for signature..." : "🔌 Sign in with Extension"}
                </GlowingButton>
                {nip07Error && (
                  <div className="p-3 rounded bg-red-950/30 border border-red-500/40">
                    <p className="text-sm text-red-400">{nip07Error}</p>
                  </div>
                )}
                <div className="pt-2 text-xs text-gray-600 border-t border-gray-800">
                  <p>✓ Private keys never leave your device</p>
                  <p>✓ Best security and user experience</p>
                </div>
              </div>
            </TerminalWindow>

            {/* npub + Password - Alternative Method */}
            <TerminalWindow title="auth --method password">
              <form className="space-y-4" onSubmit={handleCredentialsLogin}>
                <div className="space-y-2">
                  <p className="text-sm text-gray-300">
                    If you&apos;ve previously set a password for your npub.
                  </p>
                  <p className="text-xs text-gray-500">
                    Don&apos;t have a password? Use NIP-07 extension instead.
                  </p>
                </div>
                <label className="block text-sm">
                  <span className="block text-gray-400 mb-1">Public Key (npub)</span>
                  <input
                    className="w-full rounded bg-black/50 border border-green-500/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs"
                    placeholder="npub1..."
                    value={npub}
                    onChange={(e) => setNpub(e.target.value)}
                    autoComplete="username"
                    disabled={isCredentialsPending}
                  />
                </label>
                <label className="block text-sm">
                  <span className="block text-gray-400 mb-1">Password</span>
                  <input
                    type="password"
                    className="w-full rounded bg-black/50 border border-green-500/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={isCredentialsPending}
                  />
                </label>
                <GlowingButton
                  type="submit"
                  variant="secondary"
                  disabled={isCredentialsPending}
                  className="w-full justify-center"
                >
                  {isCredentialsPending ? "Verifying..." : "🔒 Sign in with Password"}
                </GlowingButton>
                {credentialsError && (
                  <div className="p-3 rounded bg-red-950/30 border border-red-500/40">
                    <p className="text-sm text-red-400">{credentialsError}</p>
                  </div>
                )}
                <div className="pt-2 text-xs text-gray-600 border-t border-gray-800">
                  <p>⚠ Requires password to be set in settings</p>
                  <p>⚠ Less secure than NIP-07 extensions</p>
                </div>
              </form>
            </TerminalWindow>
          </div>

          {message && (
            <div className="text-center p-4 rounded bg-green-950/30 border border-green-500/40">
              <p className="text-sm text-green-400">{message}</p>
            </div>
          )}

          <div className="text-center space-y-2">
            <div className="text-sm text-gray-500">
              <Link href="/" className="hover:text-green-300 transition-colors">
                {'<'} Back to relay.pleb.one
              </Link>
            </div>
            <div className="pt-4 text-xs text-gray-600 space-y-1">
              <p>🔐 Security Notice: Never enter your private key (nsec) on websites.</p>
              <p>Always use NIP-07 extensions for maximum security.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
