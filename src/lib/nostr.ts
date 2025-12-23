import { SimplePool } from "nostr-tools/pool";

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
];

const pool = new SimplePool();

export async function fetchProfileMetadata(pubkey: string) {
  try {
    const event = await pool.get(DEFAULT_RELAYS, {
      kinds: [0],
      authors: [pubkey],
    });

    if (!event) return null;

    try {
      const content = JSON.parse(event.content);
      return {
        name: content.name as string | undefined,
        displayName: content.display_name as string | undefined,
        about: content.about as string | undefined,
        picture: content.picture as string | undefined,
        nip05: content.nip05 as string | undefined,
      };
    } catch (e) {
      console.error("Failed to parse metadata content", e);
      return null;
    }
  } catch (error) {
    console.error("Error fetching profile metadata:", error);
    return null;
  }
}
