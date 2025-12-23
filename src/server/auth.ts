import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { nip19 } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";
import { env } from "@/env";
import { db } from "@/server/db";

const MAX_EVENT_AGE_SECONDS = 60 * 5;

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
  adapter: PrismaAdapter(db),
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
          return null;
        }

        try {
          const authEvent = JSON.parse(credentials.event);

          if (authEvent.kind !== 22242) {
            return null;
          }

          if (authEvent.pubkey !== credentials.pubkey) {
            return null;
          }

          const timestamp = Math.floor(Date.now() / 1000);
          if (Math.abs(timestamp - authEvent.created_at) > MAX_EVENT_AGE_SECONDS) {
            return null;
          }

          const isValid = verifyEvent(authEvent);
          if (!isValid) {
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
          const pubkeyBytes = typeof privateKey === "string" 
            ? Buffer.from(privateKey, "hex")
            : privateKey;
          
          // Import getPublicKey from nostr-tools to derive public key
          const { getPublicKey } = await import("nostr-tools");
          const pubkey = getPublicKey(pubkeyBytes);

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

          const { getPublicKey } = await import("nostr-tools");
          const pubkey = getPublicKey(Buffer.from(privateKey, "hex"));

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