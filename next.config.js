/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['nostr-tools', '@noble/curves', '@noble/hashes', '@noble/ciphers', '@scure/base', '@scure/bip32', '@scure/bip39'],
  webpack: (config, { isServer }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    if (isServer) {
      // Ensure nostr-tools is treated as external on the server
      config.externals.push('nostr-tools', '@noble/curves', '@noble/hashes');
    }
    return config;
  },
};

export default nextConfig;