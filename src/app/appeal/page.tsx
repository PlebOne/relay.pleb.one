"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { GlowingButton } from "@/components/ui/cypherpunk";

export default function AppealPage() {
  const { data: session, status } = useSession();
  const [formData, setFormData] = useState({
    subject: "",
    content: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.npub) {
      setResult({ success: false, message: "You must be logged in to submit an appeal" });
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/public/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npub: session.user.npub,
          subject: formData.subject,
          content: formData.content,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: "Appeal submitted successfully. An admin will review your case.",
        });
        setFormData({ subject: "", content: "" });
      } else {
        setResult({
          success: false,
          message: data.error || "Failed to submit appeal",
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: "Network error. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-2xl text-center text-green-400">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-green-500/40 bg-black/70 p-8 text-center shadow-xl shadow-green-500/10">
          <h1 className="mb-4 text-3xl font-bold text-green-400">Login Required</h1>
          <p className="mb-6 text-gray-300">You must be logged in to submit an appeal.</p>
          <Link href="/login">
            <GlowingButton>Login with Nostr</GlowingButton>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-green-400">Submit an Appeal</h1>
          <p className="text-gray-400">
            If you believe your account was incorrectly blacklisted or suspended, submit an appeal below.
          </p>
        </div>

        <div className="rounded-2xl border border-green-500/40 bg-black/70 p-8 shadow-xl shadow-green-500/10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-green-400">
                Your Nostr Identity
              </label>
              <input
                type="text"
                value={session.user.npub || ""}
                disabled
                className="w-full rounded-md border border-green-500/30 bg-black/50 px-4 py-3 text-gray-300 outline-none"
              />
            </div>

            <div>
              <label htmlFor="subject" className="mb-2 block text-sm font-semibold text-green-400">
                Subject <span className="text-red-400">*</span>
              </label>
              <input
                id="subject"
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
                maxLength={200}
                placeholder="Brief description of your appeal"
                className="w-full rounded-md border border-green-500/30 bg-black/50 px-4 py-3 text-white outline-none focus:border-green-400"
              />
            </div>

            <div>
              <label htmlFor="content" className="mb-2 block text-sm font-semibold text-green-400">
                Appeal Details <span className="text-red-400">*</span>
              </label>
              <textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                required
                maxLength={2000}
                rows={8}
                placeholder="Explain why you believe the action was incorrect..."
                className="w-full rounded-md border border-green-500/30 bg-black/50 px-4 py-3 text-white outline-none focus:border-green-400"
              />
              <p className="mt-1 text-xs text-gray-500">{formData.content.length}/2000 characters</p>
            </div>

            {result && (
              <div
                className={`rounded-lg border p-4 ${
                  result.success
                    ? "border-green-500/40 bg-green-900/20 text-green-300"
                    : "border-red-500/40 bg-red-900/20 text-red-300"
                }`}
              >
                {result.message}
              </div>
            )}

            <div className="flex gap-4">
              <GlowingButton type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Submitting..." : "Submit Appeal"}
              </GlowingButton>
              <Link href="/dashboard" className="flex-1">
                <GlowingButton variant="secondary" className="w-full">
                  Cancel
                </GlowingButton>
              </Link>
            </div>
          </form>

          <div className="mt-8 rounded-lg border border-yellow-500/30 bg-yellow-900/10 p-4 text-sm text-yellow-200">
            <h3 className="mb-2 font-semibold">What happens next?</h3>
            <ul className="list-inside list-disc space-y-1 text-yellow-300/80">
              <li>Your appeal will be reviewed by an administrator</li>
              <li>You will receive a response via Nostr DM</li>
              <li>Review typically takes 1-3 business days</li>
              <li>Submitting multiple appeals may delay the process</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
