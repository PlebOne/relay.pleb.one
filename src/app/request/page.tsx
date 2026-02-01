"use client";

import { useState } from "react";
import Link from "next/link";
import { MatrixRain, TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";
import { safeJsonParse } from "@/lib/fetch-utils";

export default function RequestInvitePage() {
  const [npub, setNpub] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contact, setContact] = useState("");
  const [referral, setReferral] = useState("");
  const [client, setClient] = useState("");
  const [message, setMessage] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error" | "already_whitelisted">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const resetForm = () => {
    setDisplayName("");
    setContact("");
    setReferral("");
    setClient("");
    setMessage("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/public/request-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npub,
          displayName: displayName || undefined,
          contact: contact || undefined,
          referral: referral || undefined,
          client: client || undefined,
          message,
        }),
      });

      const { data, error, status } = await safeJsonParse<{ alreadyWhitelisted?: boolean; error?: string; details?: string }>(response);

      if (error) {
        throw new Error(error);
      }

      if (!data) {
        throw new Error("No response from server");
      }

      if (data.alreadyWhitelisted) {
        setSubmitStatus("already_whitelisted");
        setNpub("");
        resetForm();
        return;
      }

      if (!response.ok) {
        const errorMsg = data.details || data.error || "Failed to submit request";
        throw new Error(errorMsg);
      }

      setSubmitStatus("success");
      setNpub("");
      resetForm();
    } catch (error) {
      console.error("Submit error:", error);
      setSubmitStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error");
    }
  };

  const isSubmitting = submitStatus === "submitting";

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-950 via-black to-gray-950 relative overflow-hidden">
      <MatrixRain />
      <header className="border-b border-green-500/30 bg-black/80 backdrop-blur-sm relative z-10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-green-400">
              ⚡ relay.pleb.one
            </Link>
            <nav className="flex items-center space-x-6 font-mono text-sm">
              <Link href="/" className="text-green-400 hover:text-green-300 transition">
                [Home]
              </Link>
              <Link href="/login" className="text-green-400 hover:text-green-300 transition">
                [Member Login]
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <TerminalWindow title="request-invite.sh">
              <div className="space-y-8">
                <div>
                  <h1 className="text-3xl font-bold text-green-400 font-mono mb-3">
                    Request an Invite
                  </h1>
                  <p className="text-gray-300 font-mono text-sm">
                    Share your npub and a short note so we can vet your application. Someone from the admin
                    team will review and respond via Nostr DM once processed.
                  </p>
                </div>

                {submitStatus === "success" && (
                  <div className="rounded-lg border border-green-500/40 bg-green-900/10 p-4">
                    <p className="text-green-300 font-mono text-sm">
                      ✓ Request received. Watch your DMs for a response from relay.pleb.one.
                    </p>
                  </div>
                )}

                {submitStatus === "already_whitelisted" && (
                  <div className="rounded-lg border border-cyan-500/40 bg-cyan-900/10 p-4">
                    <p className="text-cyan-300 font-mono text-sm">
                      ℹ️ You are already whitelisted! You can <Link href="/login" className="underline hover:text-cyan-200">login here</Link>.
                    </p>
                  </div>
                )}

                {submitStatus === "error" && (
                  <div className="rounded-lg border border-red-500/40 bg-red-900/10 p-4">
                    <p className="text-red-300 font-mono text-sm">✗ {errorMessage}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-green-400 font-mono text-sm mb-2">npub *</label>
                    <input
                      type="text"
                      required
                      value={npub}
                      onChange={(event) => setNpub(event.target.value)}
                      placeholder="npub1..."
                      className="w-full rounded border border-green-500/40 bg-black/50 px-4 py-2 text-sm text-gray-100 font-mono focus:border-green-400 focus:outline-none"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-green-400 font-mono text-sm mb-2">
                        Display name / handle
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Optional"
                        className="w-full rounded border border-green-500/20 bg-black/30 px-4 py-2 text-sm text-gray-100 font-mono focus:border-green-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-green-400 font-mono text-sm mb-2">
                        Contact (email, LN, etc.)
                      </label>
                      <input
                        type="text"
                        value={contact}
                        onChange={(event) => setContact(event.target.value)}
                        placeholder="Optional"
                        className="w-full rounded border border-green-500/20 bg-black/30 px-4 py-2 text-sm text-gray-100 font-mono focus:border-green-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-green-400 font-mono text-sm mb-2">
                        Who referred you?
                      </label>
                      <input
                        type="text"
                        value={referral}
                        onChange={(event) => setReferral(event.target.value)}
                        placeholder="npub or name (optional)"
                        className="w-full rounded border border-green-500/20 bg-black/30 px-4 py-2 text-sm text-gray-100 font-mono focus:border-green-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-green-400 font-mono text-sm mb-2">
                        Preferred Nostr client
                      </label>
                      <input
                        type="text"
                        value={client}
                        onChange={(event) => setClient(event.target.value)}
                        placeholder="e.g. Damus, Amethyst"
                        className="w-full rounded border border-green-500/20 bg-black/30 px-4 py-2 text-sm text-gray-100 font-mono focus:border-green-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-green-400 font-mono text-sm mb-2">
                      Tell us about you & why you want access *
                    </label>
                    <textarea
                      required
                      rows={6}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Share how you use Nostr, what you plan to post, and any relevant community contributions."
                      className="w-full rounded border border-green-500/30 bg-black/40 px-4 py-2 text-sm text-gray-100 font-mono focus:border-green-400 focus:outline-none resize-none"
                    />
                    <p className="mt-1 text-xs text-gray-500 font-mono">Minimum 25 characters</p>
                  </div>

                  <GlowingButton type="submit" disabled={isSubmitting} className="w-full justify-center">
                    {isSubmitting ? "Submitting..." : "Submit Request"}
                  </GlowingButton>
                </form>

                <div className="border-t border-green-500/20 pt-6">
                  <h3 className="text-lg font-semibold text-green-400 font-mono mb-3">What happens next?</h3>
                  <ol className="space-y-2 text-sm text-gray-300 font-mono">
                    <li>
                      <span className="text-green-400 mr-2">[1]</span>
                      Your request is posted to the admin dashboard
                    </li>
                    <li>
                      <span className="text-green-400 mr-2">[2]</span>
                      Admins review and may reach out for clarification
                    </li>
                    <li>
                      <span className="text-green-400 mr-2">[3]</span>
                      Once approved you will receive a DM from the relay admin npub
                    </li>
                    <li>
                      <span className="text-green-400 mr-2">[4]</span>
                      DM includes the relay address and next steps to log in
                    </li>
                  </ol>
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </section>
    </main>
  );
}
