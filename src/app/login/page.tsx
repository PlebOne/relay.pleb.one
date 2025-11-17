"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";

const AUTH_KIND = 22242;

type NostrAuthEvent = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
  id?: string;
  sig?: string;
};

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: NostrAuthEvent) => Promise<NostrAuthEvent>;
    };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [npub, setNpub] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [nip07Error, setNip07Error] = useState<string | null>(null);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [isNip07Pending, startNip07Auth] = useTransition();
  const [isCredentialsPending, startCredentialsAuth] = useTransition();

  const handleNip07Login = () => {
    startNip07Auth(async () => {
      setNip07Error(null);
      setMessage(null);

      if (typeof window === "undefined" || !window.nostr) {
        setNip07Error("NIP-07 browser extension not detected.");
        return;
      }

      try {
        const pubkey = await window.nostr.getPublicKey();
        const authEvent: NostrAuthEvent = {
          kind: AUTH_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["relay", "wss://relay.pleb.one"],
            ["client", "relay.pleb.one"],
            ["challenge", crypto.randomUUID()],
          ],
          content: "Login request for relay.pleb.one",
          pubkey,
        };

        const signedEvent = await window.nostr.signEvent(authEvent);
        const result = await signIn("nip07", {
          pubkey,
          event: JSON.stringify(signedEvent),
          redirect: false,
        });

        if (result?.error) {
          setNip07Error(result.error);
          return;
        }

        setMessage("Authenticated via NIP-07");
        router.push("/");
      } catch (error) {
        console.error(error);
        setNip07Error("Failed to authenticate with NIP-07");
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
      router.push("/");
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
              Choose between a NIP-07 capable extension or your npub + password pair.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <TerminalWindow title="auth --method nip07">
              <div className="space-y-4">
                <p className="text-sm text-gray-300">
                  Use a browser extension (e.g., Alby, nos2x) to sign a NIP-07 auth event.
                </p>
                <GlowingButton
                  onClick={handleNip07Login}
                  disabled={isNip07Pending}
                  className="w-full justify-center"
                >
                  {isNip07Pending ? "Awaiting signature..." : "Sign in with NIP-07"}
                </GlowingButton>
                {nip07Error && <p className="text-sm text-red-400">{nip07Error}</p>}
              </div>
            </TerminalWindow>

            <TerminalWindow title="auth --method npub+password">
              <form className="space-y-4" onSubmit={handleCredentialsLogin}>
                <label className="block text-sm">
                  <span className="block text-gray-400 mb-1">npub</span>
                  <input
                    className="w-full rounded bg-black/50 border border-green-500/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="npub1..."
                    value={npub}
                    onChange={(event) => setNpub(event.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label className="block text-sm">
                  <span className="block text-gray-400 mb-1">Password</span>
                  <input
                    type="password"
                    className="w-full rounded bg-black/50 border border-green-500/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                <GlowingButton
                  type="submit"
                  variant="secondary"
                  disabled={isCredentialsPending}
                  className="w-full justify-center"
                >
                  {isCredentialsPending ? "Verifying..." : "Sign in with npub"}
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
