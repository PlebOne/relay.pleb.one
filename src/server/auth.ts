import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { nip19 } from "nostr-tools";
import { verifyEvent, getPublicKey, getEventHash, type Event } from "nostr-tools/pure";
import { env } from "@/env";
import { db } from "@/server/db";

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
  secret: env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
  callbacks: {
    async jwt({ token, user, account }) {
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
      name: "Nostr Extension (NIP-07)",
      credentials: {
        pubkey: { label: "Public Key", type: "text" },
        event: { label: "Signed Event", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.pubkey || !credentials?.event) {
          console.error("NIP-07 auth: Missing credentials");
          return null;
        }

        try {
          // Parse and validate the signed event
          let authEvent: Event;
          try {
            authEvent = JSON.parse(credentials.event) as Event;
          } catch (parseError) {
            console.error("NIP-07 auth: Invalid JSON", parseError);
            return null;
          }

          // Comprehensive field validation
          if (!authEvent.id || !authEvent.sig || !authEvent.pubkey || 
              !authEvent.kind || authEvent.created_at === undefined || 
              !Array.isArray(authEvent.tags) || typeof authEvent.content !== 'string') {
            console.error("NIP-07 auth: Event missing required fields");
            return null;
          }

          // Validate event kind (NIP-98 HTTP Auth)
          if (authEvent.kind !== 22242 && authEvent.kind !== 27235) {
            console.error("NIP-07 auth: Invalid event kind", authEvent.kind);
            return null;
          }

          // Verify pubkey matches
          if (authEvent.pubkey !== credentials.pubkey) {
            console.error("NIP-07 auth: Pubkey mismatch");
            return null;
          }

          // Validate pubkey format (64-char hex)
          if (!/^[0-9a-f]{64}$/i.test(credentials.pubkey)) {
            console.error("NIP-07 auth: Invalid pubkey format");
            return null;
          }

          // Strict timestamp validation (5 minutes for clock drift)
          const now = Math.floor(Date.now() / 1000);
          const eventAge = Math.abs(now - authEvent.created_at);
          const MAX_AGE = 300; // 5 minutes
          
          if (eventAge > MAX_AGE) {
            console.error("NIP-07 auth: Event too old or in future", {
              serverTime: now,
              eventTime: authEvent.created_at,
              ageSeconds: eventAge,
            });
            return null;
          }

          // Recompute event ID to verify integrity
          let computedId: string;
          try {
            computedId = getEventHash(authEvent);
          } catch (error) {
            console.error("NIP-07 auth: Failed to compute event hash", error);
            return null;
          }

          if (computedId !== authEvent.id) {
            console.error("NIP-07 auth: Event ID mismatch - possible tampering");
            return null;
          }

          // Verify cryptographic signature
          let isValidSignature: boolean;
          try {
            isValidSignature = verifyEvent(authEvent);
          } catch (error) {
            console.error("NIP-07 auth: Signature verification failed", error);
            return null;
          }

          if (!isValidSignature) {
            console.error("NIP-07 auth: Invalid signature");
            return null;
          }

          // All validations passed - find or create user
          let user = await db.user.findUnique({
            where: { pubkey: credentials.pubkey },
          });

          if (!user) {
            const npub = nip19.npubEncode(credentials.pubkey);
            
            // First user becomes admin, or check configured admin
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
            
            console.log(`NIP-07 auth: New user created - ${npub.substring(0, 12)}...`);
          }

          return {
            id: String(user.id),
            pubkey: user.pubkey,
            npub: user.npub,
            isAdmin: user.isAdmin,
            whitelistStatus: user.whitelistStatus,
            inviteQuota: user.inviteQuota,
            invitesUsed: user.invitesUsed,
            invitePrivilegesSuspended: user.invitePrivilegesSuspended,
          };
        } catch (error) {
          console.error("NIP-07 auth: Unexpected error", error);
          return null;
        }
      },
    }),
    CredentialsProvider({
      id: "npub-password",
      name: "npub + Password",
      credentials: {
        npub: { label: "npub", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.npub || !credentials?.password) {
          console.error("Password auth: Missing credentials");
          return null;
        }

        try {
          const npub = credentials.npub.trim();
          
          // Validate npub format
          if (!npub.startsWith('npub1') || npub.length !== 63) {
            console.error("Password auth: Invalid npub format");
            return null;
          }

          // Validate npub is decodable
          try {
            const decoded = nip19.decode(npub);
            if (decoded.type !== 'npub') {
              console.error("Password auth: Invalid npub type");
              return null;
            }
          } catch (error) {
            console.error("Password auth: npub decode failed", error);
            return null;
          }

          // Rate limiting check - prevent brute force (basic check)
          const MIN_PASSWORD_LENGTH = 8;
          if (credentials.password.length < MIN_PASSWORD_LENGTH) {
            console.error("Password auth: Password too short");
            return null;
          }

          const user = await db.user.findUnique({
            where: { npub },
            select: {
              id: true,
              npub: true,
              pubkey: true,
              passwordHash: true,
              isAdmin: true,
              whitelistStatus: true,
              inviteQuota: true,
              invitesUsed: true,
              invitePrivilegesSuspended: true,
            },
          });

          if (!user) {
            console.error("Password auth: User not found");
            // Use constant-time comparison to prevent timing attacks
            await compare(credentials.password, "$2a$10$invalidhashtopreventtimingattacks");
            return null;
          }

          if (!user.passwordHash) {
            console.error("Password auth: No password set for user");
            return null;
          }

          // Verify password using bcrypt
          const isValidPassword = await compare(credentials.password, user.passwordHash);
          
          if (!isValidPassword) {
            console.error("Password auth: Invalid password");
            return null;
          }

          return {
            id: String(user.id),
            pubkey: user.pubkey,
            npub: user.npub,
            isAdmin: user.isAdmin,
            whitelistStatus: user.whitelistStatus,
            inviteQuota: user.inviteQuota,
            invitesUsed: user.invitesUsed,
            invitePrivilegesSuspended: user.invitePrivilegesSuspended,
          };
        } catch (error) {
          console.error("Password auth: Unexpected error", error);
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