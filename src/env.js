import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) => process.env.VERCEL_URL ?? str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string() : z.string().url(),
    ),
    
    // Relay Configuration
    RELAY_NAME: z.string().default("relay.pleb.one"),
    RELAY_DESCRIPTION: z.string().default("A premium Nostr relay"),
    RELAY_PUBKEY: z.string().optional(),
    RELAY_CONTACT: z.string().optional(),
    RELAY_PORT: z.coerce.number().default(3001),
    
    // Admin Configuration
    ADMIN_NPUB: z.string().default("npub13hyx3qsqk3r7ctjqrr49uskut4yqjsxt8uvu4rekr55p08wyhf0qq90nt7"),
    ADMIN_DM_NSEC: z.string().optional(),
    
    // Rate Limiting
    MAX_EVENTS_PER_MINUTE: z.coerce.number().default(60),
    MAX_SUBSCRIPTIONS_PER_CONNECTION: z.coerce.number().default(20),
    MAX_EVENT_SIZE: z.coerce.number().default(65536), // 64KB
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_RELAY_URL: z.string().url().default("ws://localhost:3001"),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_RELAY_NAME: z.string().default("relay.pleb.one"),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    
    RELAY_NAME: process.env.RELAY_NAME,
    RELAY_DESCRIPTION: process.env.RELAY_DESCRIPTION,
    RELAY_PUBKEY: process.env.RELAY_PUBKEY,
    RELAY_CONTACT: process.env.RELAY_CONTACT,
    RELAY_PORT: process.env.RELAY_PORT,
    
    ADMIN_NPUB: process.env.ADMIN_NPUB,
    ADMIN_DM_NSEC: process.env.ADMIN_DM_NSEC,
    
    MAX_EVENTS_PER_MINUTE: process.env.MAX_EVENTS_PER_MINUTE,
    MAX_SUBSCRIPTIONS_PER_CONNECTION: process.env.MAX_SUBSCRIPTIONS_PER_CONNECTION,
    MAX_EVENT_SIZE: process.env.MAX_EVENT_SIZE,
    
    NEXT_PUBLIC_RELAY_URL: process.env.NEXT_PUBLIC_RELAY_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_RELAY_NAME: process.env.NEXT_PUBLIC_RELAY_NAME,
  },
  /**
   * Run `build` or `dev` with SKIP_ENV_VALIDATION to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});