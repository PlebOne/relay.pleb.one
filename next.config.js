import { withSentryConfig } from '@sentry/nextjs/config';

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['nostr-tools', '@noble/curves', '@noble/hashes', '@noble/ciphers', '@scure/base', '@scure/bip32', '@scure/bip39'],
};

// Source maps are only generated and uploaded when SENTRY_AUTH_TOKEN is set at
// build time (never committed). Without it the build is unchanged: no upload,
// no source maps, no network calls to Sentry.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;

export default withSentryConfig(nextConfig, {
  org: 'nine-point-labs',
  project: 'relay-pleb-one',
  authToken: sentryAuthToken,
  sourcemaps: {
    disable: !sentryAuthToken,
    deleteSourcemapsAfterUpload: true,
  },
  release: {
    name: process.env.SENTRY_RELEASE || undefined,
    create: Boolean(sentryAuthToken),
  },
  telemetry: false,
  silent: !process.env.CI,
});
