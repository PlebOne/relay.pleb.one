import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";
import { TRPCReactProvider } from "@/trpc/providers";

export const metadata: Metadata = {
  title: "relay.pleb.one - Community Nostr Relay",
  description: "A community Nostr relay with whitelist-gated access and rust-powered backend",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  },
  manifest: "/site.webmanifest",
  themeColor: "#000000",
  openGraph: {
    title: "relay.pleb.one - Community Nostr Relay",
    description: "A community Nostr relay with whitelist-gated access and rust-powered backend",
    url: "https://relay.pleb.one",
    siteName: "relay.pleb.one",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "relay.pleb.one - Community Nostr Relay",
    description: "A community Nostr relay with whitelist-gated access and rust-powered backend",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body className="bg-black text-green-400 font-mono">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}