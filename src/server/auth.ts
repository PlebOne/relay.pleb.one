import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { nip19, verifyEvent } from "nostr-tools";
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
      whitelistStatus: "PENDING" | "ACTIVE" | "PAUSED" | "REVOKED";
      inviteQuota: number;
      invitesUsed: number;
      // ...other properties
    } & DefaultSession["user"];
  }

  interface User {
    npub?: string;
    pubkey?: string;
    isAdmin: boolean;
    whitelistStatus: "PENDING" | "ACTIVE" | "PAUSED" | "REVOKED";
    inviteQuota: number;
    invitesUsed: number;
    // ...other properties
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
        npub: user.npub,
        pubkey: user.pubkey,
        isAdmin: user.isAdmin || user.npub === env.ADMIN_NPUB,
        whitelistStatus: user.whitelistStatus,
        inviteQuota: user.inviteQuota,
        invitesUsed: user.invitesUsed,
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
            const isAdmin = npub === env.ADMIN_NPUB;
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
        };
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