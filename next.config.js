/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['nostr-tools', '@noble/curves', '@noble/hashes', '@noble/ciphers', '@scure/base', '@scure/bip32', '@scure/bip39'],
};

export default nextConfig;
