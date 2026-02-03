import { SimplePool, nip04, finalizeEvent, getPublicKey, generateSecretKey, type Event, type Filter } from 'nostr-tools';

const RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
];

interface Nip46Request {
  id: string;
  method: string;
  params: string[];
}

interface Nip46Response {
  id: string;
  result?: string;
  error?: string;
}

export class Nip46Client {
  private pool: SimplePool;
  private clientSecretKey: Uint8Array;
  private clientPubkey: string;
  private remotePubkey: string;
  private secret?: string;
  private subscription?: { close: () => void };
  private pendingRequests: Map<string, {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(remotePubkey: string, secret?: string) {
    this.pool = new SimplePool();
    this.clientSecretKey = generateSecretKey();
    this.clientPubkey = getPublicKey(this.clientSecretKey);
    this.remotePubkey = remotePubkey;
    this.secret = secret;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error('Connection timeout'));
      }, 30000);

      const filter: Filter = {
        kinds: [24133],
        '#p': [this.clientPubkey],
        since: Math.floor(Date.now() / 1000) - 60,
      };

      const sub = this.pool.subscribeMany(
        RELAY_URLS,
        filter,
        {
          onevent: (event: Event) => {
            this.handleResponse(event).catch((error) => {
              console.error('Error handling response:', error);
            });
          },
          oneose: () => {
            clearTimeout(timeout);
            resolve();
          },
        }
      );

      this.subscription = { close: () => sub.close() };
    });
  }

  private async handleResponse(event: Event): Promise<void> {
    try {
      const decrypted = await nip04.decrypt(
        this.clientSecretKey,
        this.remotePubkey,
        event.content
      );

      const response: Nip46Response = JSON.parse(decrypted);

      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        if (response.error) {
          pending.reject(new Error(response.error));
        } else if (response.result) {
          pending.resolve(response.result);
        }
        this.pendingRequests.delete(response.id);
      }
    } catch (error) {
      console.error('Error decrypting response:', error);
    }
  }

  private async sendRequest(method: string, params: string[] = []): Promise<string> {
    const requestId = Math.random().toString(36).substring(2);
    
    const request: Nip46Request = {
      id: requestId,
      method,
      params: this.secret ? [this.secret, ...params] : params,
    };

    const encrypted = await nip04.encrypt(
      this.clientSecretKey,
      this.remotePubkey,
      JSON.stringify(request)
    );

    const event = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', this.remotePubkey]],
        content: encrypted,
      },
      this.clientSecretKey
    );

    const publishPromises = RELAY_URLS.map((url) => this.pool.publish([url], event));
    await Promise.race(publishPromises);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, {
        resolve: (value: string) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  async getPublicKey(): Promise<string> {
    return await this.sendRequest('get_public_key');
  }

  async signEvent(event: Partial<Event>): Promise<Event> {
    const eventJson = JSON.stringify(event);
    const signedEventJson = await this.sendRequest('sign_event', [eventJson]);
    return JSON.parse(signedEventJson);
  }

  cleanup(): void {
    if (this.subscription) {
      this.subscription.close();
    }
    this.pool.close(RELAY_URLS);
    this.pendingRequests.clear();
  }
}

export function parseBunkerUrl(bunkerUrl: string): { pubkey: string; relays?: string[]; secret?: string } {
  try {
    const url = new URL(bunkerUrl);
    
    if (url.protocol !== 'bunker:') {
      throw new Error('Invalid bunker URL protocol');
    }

    const pubkey = url.hostname || url.pathname.replace('//', '');
    
    if (!pubkey || !/^[0-9a-f]{64}$/i.test(pubkey)) {
      throw new Error('Invalid pubkey in bunker URL');
    }

    const relays: string[] = [];
    const secret = url.searchParams.get('secret') || undefined;

    url.searchParams.forEach((value, key) => {
      if (key === 'relay') {
        relays.push(value);
      }
    });

    return { pubkey, relays: relays.length > 0 ? relays : undefined, secret };
  } catch (error) {
    throw new Error(`Failed to parse bunker URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
