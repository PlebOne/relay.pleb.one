import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "relay.pleb.one - Premium Nostr Relay",
  description: "A premium paid Nostr relay with Blossom server integration",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body className="bg-black text-green-400 font-mono">
        {children}
      </body>
    </html>
  );
}