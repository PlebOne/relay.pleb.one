import type { EventTemplate } from "nostr-tools";

// NIP-07 Window extension type
// This should be the single source of truth for the Window.nostr type
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: EventTemplate): Promise<{
        id: string;
        pubkey: string;
        sig: string;
        kind: number;
        tags: string[][];
        content: string;
        created_at: number;
      }>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

export {};
