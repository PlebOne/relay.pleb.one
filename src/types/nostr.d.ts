// NIP-07 Window extension type
// This should be the single source of truth for the Window.nostr type

// EventTemplate-like structure for signEvent input
interface NostrEventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey?: string; // Some extensions accept pubkey in template, but it's optional
}

// Fully signed event returned by signEvent
interface NostrSignedEvent {
  id: string;
  pubkey: string;
  sig: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      // signEvent takes an EventTemplate (without id, pubkey, sig) and returns a fully signed Event
      signEvent(event: NostrEventTemplate): Promise<NostrSignedEvent>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
      nip44?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

export {};
