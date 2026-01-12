import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { nip19 } from "nostr-tools";
import { verifyEvent, getPublicKey, type Event } from "nostr-tools/pure";
import { env } from "@/env";
import { db } from "@/server/db";

// Increased to 10 minutes to account for clock drift between client and server
const MAX_EVENT_AGE_SECONDS = 60 * 10;

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      npub?: string;
      pubkey?: string;
      isAdmin: boolean;
      whitelistStatus: "PENDING" | "ACTIVE" | "PAUSED" | "REVOKED" | "VANISHED";
      inviteQuota: number;
      invitesUsed: number;
      invitePrivilegesSuspended: boolean;
      // ...other properties
    } & DefaultSession["user"];
  }

  interface User {
    npub?: string;
    pubkey?: string;
    isAdmin: boolean;
    whitelistStatus: "PENDING" | "ACTIVE" | "PAUSED" | "REVOKED" | "VANISHED";
    inviteQuota: number;
    invitesUsed: number;
    invitePrivilegesSuspended: boolean;
    // ...other properties
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  debug: process.env.NODE_ENV === "development",
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.npub = user.npub;
        token.pubkey = user.pubkey;
        token.isAdmin = user.isAdmin;
        token.whitelistStatus = user.whitelistStatus;
        token.inviteQuota = user.inviteQuota;
        token.invitesUsed = user.invitesUsed;
        token.invitePrivilegesSuspended = user.invitePrivilegesSuspended;
      }
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id as string,
        npub: token.npub as string,
        pubkey: token.pubkey as string,
        isAdmin: token.isAdmin as boolean,
        whitelistStatus: token.whitelistStatus as "PENDING" | "ACTIVE" | "PAUSED" | "REVOKED",
        inviteQuota: token.inviteQuota as number,
        invitesUsed: token.invitesUsed as number,
        invitePrivilegesSuspended: token.invitePrivilegesSuspended as boolean,
      },
    }),
  },
  providers: [
    CredentialsProvider({
      id: "nip07",
      name: "Nostr Extension",
      credentials: {
        pubkey: { label: "Public Key", type: "text" },
        event: { label: "Signed Event", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.pubkey || !credentials?.event) {
          console.error("NIP-07 auth: Missing pubkey or event");
          return null;
        }

        try {
          let authEvent: Event;
          try {
            authEvent = JSON.parse(credentials.event) as Event;
          } catch (parseError) {
            console.error("NIP-07 auth: Failed to parse event JSON", parseError);
            return null;
          }

          // Validate event has all required fields
          if (!authEvent.id || !authEvent.sig || !authEvent.pubkey || 
              !authEvent.kind || authEvent.created_at === undefined) {
            console.error("NIP-07 auth: Event missing required fields", {
              hasId: !!authEvent.id,
              hasSig: !!authEvent.sig,
              hasPubkey: !!authEvent.pubkey,
              hasKind: !!authEvent.kind,
              hasCreatedAt: authEvent.created_at !== undefined,
            });
            return null;
          }

          if (authEvent.kind !== 22242) {
            console.error("NIP-07 auth: Invalid event kind", authEvent.kind);
            return null;
          }

          if (authEvent.pubkey !== credentials.pubkey) {
            console.error("NIP-07 auth: Pubkey mismatch", {
              eventPubkey: authEvent.pubkey,
              credentialsPubkey: credentials.pubkey,
            });
            return null;
          }

          const timestamp = Math.floor(Date.now() / 1000);
          const eventAge = Math.abs(timestamp - authEvent.created_at);
          if (eventAge > MAX_EVENT_AGE_SECONDS) {
            console.error("NIP-07 auth: Event too old or from the future", {
              serverTime: timestamp,
              eventTime: authEvent.created_at,
              ageDiff: eventAge,
              maxAge: MAX_EVENT_AGE_SECONDS,
            });
            return null;
          }

          // Verify the cryptographic signature
          let isValid: boolean;
          try {
            isValid = verifyEvent(authEvent);
          } catch (verifyError) {
            console.error("NIP-07 auth: Signature verification threw error", verifyError);
            return null;
          }

          if (!isValid) {
            console.error("NIP-07 auth: Invalid event signature", {
              eventId: authEvent.id,
              pubkey: authEvent.pubkey,
            });
            return null;
          }

          let user = await db.user.findUnique({
            where: { pubkey: credentials.pubkey },
          });

          if (!user) {
            const npub = nip19.npubEncode(credentials.pubkey);
            
            // Check if this is the first user ever
            const userCount = await db.user.count();
            const isFirstUser = userCount === 0;
            const isConfiguredAdmin = npub === env.ADMIN_NPUB;
            const isAdmin = isFirstUser || isConfiguredAdmin;
            
            user = await db.user.create({
              data: {
                pubkey: credentials.pubkey,
                npub,
                isAdmin,
                whitelistStatus: isAdmin ? "ACTIVE" : "PENDING",
                inviteQuota: isAdmin ? 999 : 5,
              },
            });
          }

          return {
            id: user.id,
            pubkey: user.pubkey,
            npub: user.npub,
            isAdmin: user.isAdmin,
            whitelistStatus: user.whitelistStatus,
            inviteQuota: user.inviteQuota,
            invitesUsed: user.invitesUsed,
            invitePrivilegesSuspended: user.invitePrivilegesSuspended,
          };
        } catch (error) {
          console.error("NIP-07 auth error:", error);
          return null;
        }
      },
    }),
    CredentialsProvider({
      id: "npub-password",
      name: "npub + password",
      credentials: {
        npub: { label: "npub", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.npub || !credentials?.password) {
          return null;
        }

        const npub = credentials.npub.trim();

        const user = await db.user.findUnique({
          where: { npub },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          pubkey: user.pubkey,
          npub: user.npub,
          isAdmin: user.isAdmin,
          whitelistStatus: user.whitelistStatus,
          inviteQuota: user.inviteQuota,
          invitesUsed: user.invitesUsed,
          invitePrivilegesSuspended: user.invitePrivilegesSuspended,
        };
      },
    }),
    CredentialsProvider({
      id: "nsec",
      name: "Nostr Private Key (nsec)",
      credentials: {
        nsec: { label: "nsec", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.nsec) {
          return null;
        }

        try {
          const decoded = nip19.decode(credentials.nsec.trim());
          if (decoded.type !== "nsec") {
            return null;
          }

          const privateKey = decoded.data;
          // privateKey from nip19.decode is already a Uint8Array
          const pubkey = getPublicKey(privateKey);

          let user = await db.user.findUnique({
            where: { pubkey },
          });

          if (!user) {
            const npub = nip19.npubEncode(pubkey);
            
            // Check if this is the first user ever
            const userCount = await db.user.count();
            const isFirstUser = userCount === 0;
            const isConfiguredAdmin = npub === env.ADMIN_NPUB;
            const isAdmin = isFirstUser || isConfiguredAdmin;
            
            user = await db.user.create({
              data: {
                pubkey,
                npub,
                isAdmin,
                whitelistStatus: isAdmin ? "ACTIVE" : "PENDING",
                inviteQuota: isAdmin ? 999 : 5,
              },
            });
          }

          return {
            id: user.id,
            pubkey: user.pubkey,
            npub: user.npub,
            isAdmin: user.isAdmin,
            whitelistStatus: user.whitelistStatus,
            inviteQuota: user.inviteQuota,
            invitesUsed: user.invitesUsed,
            invitePrivilegesSuspended: user.invitePrivilegesSuspended,
          };
        } catch (error) {
          console.error("nsec auth error:", error);
          return null;
        }
      },
    }),
    CredentialsProvider({
      id: "hex-key",
      name: "Hex Private Key",
      credentials: {
        hexKey: { label: "Hex Private Key", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.hexKey) {
          return null;
        }

        try {
          const privateKey = credentials.hexKey.trim();
          
          // Validate hex format (64 chars)
          if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
            return null;
          }

          // Convert hex string to Uint8Array for getPublicKey
          const privateKeyBytes = new Uint8Array(
            privateKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
          );
          const pubkey = getPublicKey(privateKeyBytes);

          let user = await db.user.findUnique({
            where: { pubkey },
          });

          if (!user) {
            const npub = nip19.npubEncode(pubkey);
            
            // Check if this is the first user ever
            const userCount = await db.user.count();
            const isFirstUser = userCount === 0;
            const isConfiguredAdmin = npub === env.ADMIN_NPUB;
            const isAdmin = isFirstUser || isConfiguredAdmin;
            
            user = await db.user.create({
              data: {
                pubkey,
                npub,
                isAdmin,
                whitelistStatus: isAdmin ? "ACTIVE" : "PENDING",
                inviteQuota: isAdmin ? 999 : 5,
              },
            });
          }

          return {
            id: user.id,
            pubkey: user.pubkey,
            npub: user.npub,
            isAdmin: user.isAdmin,
            whitelistStatus: user.whitelistStatus,
            inviteQuota: user.inviteQuota,
            invitesUsed: user.invitesUsed,
            invitePrivilegesSuspended: user.invitePrivilegesSuspended,
          };
        } catch (error) {
          console.error("hex key auth error:", error);
          return null;
        }
      },
    }),
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};