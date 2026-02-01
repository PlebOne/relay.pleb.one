"use client";

import { useState } from "react";
import Link from "next/link";
import { TerminalWindow, GlowingButton } from "@/components/ui/cypherpunk";
import { safeJsonParse } from "@/lib/fetch-utils";

export default function ReportPage() {
  const [submitterNpub, setSubmitterNpub] = useState("");
  const [targetNpub, setTargetNpub] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      const response = await fetch("/api/public/report-blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submitterNpub: submitterNpub || undefined,
          targetNpub,
          reason,
          evidence,
        }),
      });

      const { data, error } = await safeJsonParse<{ error?: string }>(response);

      if (error || !response.ok) {
        throw new Error(error || data?.error || "Failed to submit report");
      }

      setSubmitStatus("success");
      // Reset form
      setSubmitterNpub("");
      setTargetNpub("");
      setReason("");
      setEvidence("");
    } catch (error) {
      setSubmitStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900 relative overflow-hidden">
      {/* Header */}
      <header className="border-b border-green-500/30 bg-black/80 backdrop-blur-sm relative z-10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-green-400">
              ⚡ relay.pleb.one
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/" className="text-green-400 hover:text-green-300 transition font-mono">
                [Home]
              </Link>
              <Link href={{ pathname: "/request" }} className="text-green-400 hover:text-green-300 transition font-mono">
                [Request]
              </Link>
              <Link href="/login" className="text-green-400 hover:text-green-300 transition font-mono">
                [Login]
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <section className="py-20 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <TerminalWindow title="blacklist-report.sh">
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-bold mb-4 text-green-400 font-mono">
                    Report User for Review
                  </h1>
                  <p className="text-gray-300 font-mono text-sm mb-6">
                    Submit a user for investigation. Admins will review all reports and take appropriate action.
                    This does NOT automatically blacklist users.
                  </p>
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded p-4 mb-6">
                    <p className="text-yellow-400 text-sm font-mono">
                      ⚠️ <strong>Note:</strong> False reports or abuse of this system may result in your own account
                      being flagged. Please only submit legitimate concerns with evidence.
                    </p>
                  </div>
                </div>

                {submitStatus === "success" && (
                  <div className="bg-green-900/20 border border-green-500/30 rounded p-4">
                    <p className="text-green-400 font-mono text-sm">
                      ✓ Report submitted successfully! Admins will review it shortly.
                    </p>
                  </div>
                )}

                {submitStatus === "error" && (
                  <div className="bg-red-900/20 border border-red-500/30 rounded p-4">
                    <p className="text-red-400 font-mono text-sm">
                      ✗ Error: {errorMessage}
                    </p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Your npub (optional) */}
                  <div>
                    <label className="block text-green-400 font-mono text-sm mb-2">
                      Your npub (optional - for follow-up)
                    </label>
                    <input
                      type="text"
                      value={submitterNpub}
                      onChange={(e) => setSubmitterNpub(e.target.value)}
                      placeholder="npub1..."
                      className="w-full bg-black/50 border border-green-500/30 rounded px-4 py-2 text-gray-300 font-mono text-sm focus:outline-none focus:border-green-500"
                    />
                    <p className="text-gray-500 text-xs font-mono mt-1">
                      Leave blank to submit anonymously
                    </p>
                  </div>

                  {/* Target npub (required) */}
                  <div>
                    <label className="block text-green-400 font-mono text-sm mb-2">
                      User to report (npub) *
                    </label>
                    <input
                      type="text"
                      value={targetNpub}
                      onChange={(e) => setTargetNpub(e.target.value)}
                      placeholder="npub1..."
                      required
                      className="w-full bg-black/50 border border-green-500/30 rounded px-4 py-2 text-gray-300 font-mono text-sm focus:outline-none focus:border-green-500"
                    />
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-green-400 font-mono text-sm mb-2">
                      Reason for report *
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g., Spam, Harassment, Illegal content..."
                      required
                      maxLength={200}
                      className="w-full bg-black/50 border border-green-500/30 rounded px-4 py-2 text-gray-300 font-mono text-sm focus:outline-none focus:border-green-500"
                    />
                  </div>

                  {/* Evidence/Details */}
                  <div>
                    <label className="block text-green-400 font-mono text-sm mb-2">
                      Evidence / Additional details *
                    </label>
                    <textarea
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                      placeholder="Provide links to problematic posts, screenshots, or detailed description..."
                      required
                      rows={6}
                      maxLength={2000}
                      className="w-full bg-black/50 border border-green-500/30 rounded px-4 py-2 text-gray-300 font-mono text-sm focus:outline-none focus:border-green-500 resize-none"
                    />
                    <p className="text-gray-500 text-xs font-mono mt-1">
                      {evidence.length}/2000 characters
                    </p>
                  </div>

                  {/* Submit Button */}
                  <div className="flex gap-4">
                    <GlowingButton
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Report"}
                    </GlowingButton>
                    <Link href="/" className="flex-1">
                      <GlowingButton variant="secondary" className="w-full">
                        Cancel
                      </GlowingButton>
                    </Link>
                  </div>
                </form>

                <div className="border-t border-green-500/20 pt-6 mt-8">
                  <h3 className="text-lg font-semibold text-green-400 font-mono mb-3">
                    What happens next?
                  </h3>
                  <ul className="space-y-2 text-gray-300 font-mono text-sm">
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">[1]</span>
                      <span>Your report is added to the admin message board</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">[2]</span>
                      <span>Admins review the evidence and investigate</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">[3]</span>
                      <span>If warranted, the user may be blacklisted</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">[4]</span>
                      <span>If you provided your npub, you may receive a follow-up</span>
                    </li>
                  </ul>
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </section>
    </main>
  );
}
