"use client";

import { useState, useEffect } from "react";
import { api } from "@/trpc/react";
import { GlowingButton } from "@/components/ui/cypherpunk";
import { DEFAULT_NIP05_DOMAIN, NIP05_DOMAINS, isNip05Domain, type Nip05Domain } from "@/lib/nip05-domains";

export function Nip05Panel() {
  const { data: settings, isLoading } = api.user.getNip05Settings.useQuery();
  const updateMutation = api.user.updateNip05.useMutation({
    onSuccess: () => {
      setSuccessMessage("NIP-05 settings updated successfully!");
      setTimeout(() => setSuccessMessage(null), 5000);
    },
    onError: (error) => {
      setErrorMessage(error.message);
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<Nip05Domain>(DEFAULT_NIP05_DOMAIN);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setName(settings.name ?? "");
      setDomain(isNip05Domain(settings.domain) ? settings.domain : DEFAULT_NIP05_DOMAIN);
    }
  }, [settings]);

  const handleSave = () => {
    if (enabled && !name) {
      setErrorMessage("Please enter a handle");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    updateMutation.mutate({
      name: name || undefined,
      enabled,
      domain,
    });
  };

  const handleNameChange = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setName(normalized);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-black/70 p-6 shadow-lg shadow-green-500/10">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-green-500/30 bg-black/70 p-6 shadow-lg shadow-green-500/10">
      <h2 className="text-xl font-bold text-green-400 mb-4">Verified Identity (NIP-05)</h2>
      
      <p className="text-sm text-gray-300 mb-6">
        Get a verified checkmark on Nostr with your own <span className="text-green-400 font-mono">name@{domain}</span> identity.
      </p>

      <div className="space-y-6">
        {/* Enable Checkbox */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 rounded border-green-500/30 bg-black/50 text-green-500 focus:ring-2 focus:ring-green-500"
          />
          <span className="text-sm text-gray-300">Enable NIP-05 verification</span>
        </label>

        {/* Handle Input */}
        {enabled && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-green-400">
              Choose Your Handle
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="yourname"
                maxLength={30}
                className="flex-1 rounded-lg border border-green-500/30 bg-black/50 px-4 py-2 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
              <span className="text-gray-400 font-mono">@{domain}</span>
            </div>
            <p className="text-xs text-gray-500">
              Lowercase letters, numbers, and underscores only
            </p>
          </div>
        )}

        {/* Domain Select */}
        {enabled && (
          <div className="space-y-2">
            <label htmlFor="nip05-domain" className="block text-sm font-medium text-green-400">
              Choose Your Domain
            </label>
            <select
              id="nip05-domain"
              value={domain}
              onChange={(e) => {
                if (isNip05Domain(e.target.value)) setDomain(e.target.value);
              }}
              className="w-full rounded-lg border border-green-500/30 bg-black/50 px-4 py-2 font-mono text-white focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            >
              {NIP05_DOMAINS.map((d) => (
                <option key={d} value={d} className="bg-black">
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Preview */}
        {enabled && name && (
          <div className="rounded-lg border border-green-500/20 bg-green-950/20 p-4">
            <p className="text-sm text-gray-400 mb-1">Your NIP-05 address will be:</p>
            <p className="text-lg font-mono text-green-400">{name}@{domain}</p>
          </div>
        )}

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="rounded-lg border border-green-500/50 bg-green-950/30 p-4">
            <p className="text-sm text-green-400">✓ {successMessage}</p>
            <p className="text-xs text-gray-400 mt-2">
              Now update your NIP-05 field in your Nostr client to <span className="font-mono">{name}@{domain}</span> to see your checkmark!
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-red-500/50 bg-red-950/30 p-4">
            <p className="text-sm text-red-400">✗ {errorMessage}</p>
          </div>
        )}

        {/* Save Button */}
        <GlowingButton
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full"
        >
          {updateMutation.isPending ? "Saving..." : "Save Settings"}
        </GlowingButton>

        {/* Help Text */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>• This creates a verified Nostr identifier linked to your public key</p>
          <p>• Most Nostr clients will display a checkmark next to your name</p>
          <p>• You can change your handle or domain at any time</p>
          <p>• Old name@pleb.one addresses no longer verify. If your profile still uses one, update it once to name@{domain}</p>
        </div>
      </div>
    </div>
  );
}
