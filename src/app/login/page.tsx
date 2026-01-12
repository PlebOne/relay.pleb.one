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
  const [nsec, setNsec] = useState("");
  const [hexKey, setHexKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [nip07Error, setNip07Error] = useState<string | null>(null);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [nsecError, setNsecError] = useState<string | null>(null);
  const [hexKeyError, setHexKeyError] = useState<string | null>(null);
  const [isNip07Pending, startNip07Auth] = useTransition();
  const [isCredentialsPending, startCredentialsAuth] = useTransition();
  const [isNsecPending, startNsecAuth] = useTransition();
  const [isHexKeyPending, startHexKeyAuth] = useTransition();

  const handleNip07Login = () => {
    startNip07Auth(async () => {
      setNip07Error(null);
      setMessage(null);

      if (typeof window === "undefined" || !window.nostr) {
        setNip07Error("NIP-07 browser extension not detected.");
        return;
      }

      try {
        // Get pubkey first to ensure extension is available
        const pubkey = await window.nostr.getPublicKey();
        if (!pubkey || typeof pubkey !== "string" || pubkey.length !== 64) {
          setNip07Error("Invalid public key from extension");
          return;
        }

        // Create an unsigned event template (without id, sig, or pubkey - signer adds these)
        const eventTemplate = {
          kind: AUTH_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["relay", "wss://relay.pleb.one"],
            ["client", "relay.pleb.one"],
            ["challenge", crypto.randomUUID()],
          ],
          content: "Login request for relay.pleb.one",
        };

        // Sign the event - this returns a complete signed event with id, pubkey, and sig
        const signedEvent = await window.nostr.signEvent(eventTemplate);
        
        // Validate the signed event has required fields
        if (!signedEvent?.id || !signedEvent?.sig || !signedEvent?.pubkey) {
          setNip07Error("Extension returned invalid signed event");
          return;
        }

        // Verify the pubkey matches what we requested
        if (signedEvent.pubkey !== pubkey) {
          setNip07Error("Signed event pubkey mismatch");
          return;
        }

        const result = await signIn("nip07", {
          pubkey: signedEvent.pubkey,
          event: JSON.stringify(signedEvent),
          redirect: false,
        });

        if (!result) {
          setNip07Error("Authentication failed - no response from server");
          return;
        }

        if (result.error) {
          setNip07Error(result.error);
          return;
        }

        if (!result.ok) {
          setNip07Error("Authentication failed");
          return;
        }

        setMessage("Authenticated via NIP-07");
        router.push("/dashboard");
      } catch (error) {
        console.error("NIP-07 login error:", error);
        if (error instanceof Error) {
          setNip07Error(`Failed to authenticate: ${error.message}`);
        } else {
          setNip07Error("Failed to authenticate with NIP-07");
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
      if (!trimmedNpub || !password) {
        setCredentialsError("npub and password are required");
        return;
      }

      const result = await signIn("npub-password", {
        npub: trimmedNpub,
        password,
        redirect: false,
      });

      if (result?.error) {
        setCredentialsError(result.error || "Login failed");
        return;
      }

      setMessage("Authenticated via npub + password");
      router.push("/dashboard");
    });
  };

  const handleNsecLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startNsecAuth(async () => {
      setNsecError(null);
      setMessage(null);

      if (!nsec.trim()) {
        setNsecError("nsec is required");
        return;
      }

      const result = await signIn("nsec", {
        nsec: nsec.trim(),
        redirect: false,
      });

      if (result?.error) {
        setNsecError(result.error || "Invalid nsec");
        return;
      }

      setMessage("Authenticated via nsec");
      router.push("/dashboard");
    });
  };

  const handleHexKeyLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startHexKeyAuth(async () => {
      setHexKeyError(null);
      setMessage(null);

      if (!hexKey.trim()) {
        setHexKeyError("Hex private key is required");
        return;
      }

      const result = await signIn("hex-key", {
        hexKey: hexKey.trim(),
        redirect: false,
      });

      if (result?.error) {
        setHexKeyError(result.error || "Invalid hex key");
        return;
      }

      setMessage("Authenticated via hex key");
      router.push("/dashboard");
    });
  };

  return (
    <main className="min-h-screen bg-black text-green-400 relative overflow-hidden">
      <MatrixRain />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-5xl space-y-8">
          <div className="text-center space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-green-500">Access Control</p>
            <h1 className="text-4xl font-bold">Authenticate with Nostr</h1>
            <p className="text-gray-400">
              Multiple authentication methods supported. First user becomes admin automatically.
            </p>
            <p className="text-sm text-gray-500">
              Need an invite? <Link href="/request" className="text-green-300 underline decoration-dotted">Request access instead</Link>.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* NIP-07 Browser Extension */}
            <TerminalWindow title="auth --method nip07">
              <div className="space-y-4">
                <p className="text-sm text-gray-300">
                  Use a browser extension (Alby, nos2x, Flamingo, etc.) to sign an auth event.
                </p>
                <GlowingButton
                  onClick={handleNip07Login}
                  disabled={isNip07Pending}
                  className="w-full justify-center"
                >
                  {isNip07Pending ? "Awaiting signature..." : "🔌 Sign in with Extension"}
                </GlowingButton>
                {nip07Error && <p className="text-sm text-red-400">{nip07Error}</p>}
              </div>
            </TerminalWindow>

            {/* nsec (Private Key) */}
            <TerminalWindow title="auth --method nsec">
              <form className="space-y-4" onSubmit={handleNsecLogin}>
                <p className="text-sm text-gray-300">
                  Login with your Nostr private key (nsec format).
                </p>
                <label className="block text-sm">
                  <span className="block text-gray-400 mb-1">Private Key (nsec)</span>
                  <input
                    type="password"
                    className="w-full rounded bg-black/50 border border-green-500/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs"
                    placeholder="nsec1..."
                    value={nsec}
                    onChange={(e) => setNsec(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <GlowingButton
                  type="submit"
                  disabled={isNsecPending}
                  className="w-full justify-center"
                >
                  {isNsecPending ? "Signing in..." : "🔑 Sign in with nsec"}
                </GlowingButton>
                {nsecError && <p className="text-sm text-red-400">{nsecError}</p>}
              </form>
            </TerminalWindow>

            {/* Hex Private Key */}
            <TerminalWindow title="auth --method hex">
              <form className="space-y-4" onSubmit={handleHexKeyLogin}>
                <p className="text-sm text-gray-300">
                  Login with your raw hex private key (64 characters).
                </p>
                <label className="block text-sm">
                  <span className="block text-gray-400 mb-1">Hex Private Key</span>
                  <input
                    type="password"
                    className="w-full rounded bg-black/50 border border-green-500/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs"
                    placeholder="0123456789abcdef..."
                    value={hexKey}
                    onChange={(e) => setHexKey(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <GlowingButton
                  type="submit"
                  variant="secondary"
                  disabled={isHexKeyPending}
                  className="w-full justify-center"
                >
                  {isHexKeyPending ? "Signing in..." : "🔐 Sign in with Hex Key"}
                </GlowingButton>
                {hexKeyError && <p className="text-sm text-red-400">{hexKeyError}</p>}
              </form>
            </TerminalWindow>

            {/* npub + Password */}
            <TerminalWindow title="auth --method npub+password">
              <form className="space-y-4" onSubmit={handleCredentialsLogin}>
                <p className="text-sm text-gray-300">
                  If you&apos;ve set a password for your npub.
                </p>
                <label className="block text-sm">
                  <span className="block text-gray-400 mb-1">npub</span>
                  <input
                    className="w-full rounded bg-black/50 border border-green-500/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs"
                    placeholder="npub1..."
                    value={npub}
                    onChange={(e) => setNpub(e.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label className="block text-sm">
                  <span className="block text-gray-400 mb-1">Password</span>
                  <input
                    type="password"
                    className="w-full rounded bg-black/50 border border-green-500/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
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
                {credentialsError && <p className="text-sm text-red-400">{credentialsError}</p>}
              </form>
            </TerminalWindow>
          </div>

          {message && (
            <div className="text-center text-sm text-green-400">{message}</div>
          )}

          <div className="text-center text-sm text-gray-500">
            <Link href="/" className="hover:text-green-300">
              {'<'} Back to relay.pleb.one
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
