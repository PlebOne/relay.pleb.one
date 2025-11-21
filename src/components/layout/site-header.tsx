"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusIndicator, GlowingButton } from "@/components/ui/cypherpunk";

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <header className="sticky top-0 border-b border-green-500/30 bg-black/80 backdrop-blur-sm z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Status */}
          <div className="flex items-center space-x-4 overflow-hidden">
            <Link href="/" className="text-xl md:text-2xl font-bold text-green-400 lightning-animation truncate md:whitespace-nowrap">
              ⚡ relay.pleb.one
            </Link>
            <div className="hidden md:block">
              <StatusIndicator status="online" />
            </div>
            <div className="hidden lg:block text-sm text-gray-400 font-mono">
              Community Nostr Relay
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-6">
            <a href="/#features" className="text-green-400 hover:text-green-300 transition font-mono">
              [Features]
            </a>
            <a href="/#access" className="text-green-400 hover:text-green-300 transition font-mono">
              [Access]
            </a>
            <Link href="/request" className="text-green-400 hover:text-green-300 transition font-mono">
              [Request]
            </Link>
            <Link href="/support" className="text-green-400 hover:text-green-300 transition font-mono">
              [Support]
            </Link>
            <GlowingButton asChild className="px-4 py-2 text-sm">
              <Link href="/login">
                {'>> Login'}
              </Link>
            </GlowingButton>
          </nav>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden text-green-400 p-2 hover:bg-green-900/20 rounded transition-colors"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            {isOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Nav Overlay */}
      {isOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-black/95 border-b border-green-500/30 backdrop-blur-md p-4 flex flex-col space-y-4 shadow-xl animate-in slide-in-from-top-5 z-50 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between pb-4 border-b border-green-500/20">
             <StatusIndicator status="online" />
             <span className="text-xs text-gray-500 font-mono">Community Nostr Relay</span>
          </div>
          <a href="/#features" className="text-green-400 hover:text-green-300 transition font-mono py-2 block break-words" onClick={() => setIsOpen(false)}>
            [Features]
          </a>
          <a href="/#access" className="text-green-400 hover:text-green-300 transition font-mono py-2 block break-words" onClick={() => setIsOpen(false)}>
            [Access]
          </a>
          <Link href="/request" className="text-green-400 hover:text-green-300 transition font-mono py-2 block break-words" onClick={() => setIsOpen(false)}>
            [Request]
          </Link>
          <Link href="/support" className="text-green-400 hover:text-green-300 transition font-mono py-2 block break-words" onClick={() => setIsOpen(false)}>
            [Keep the Network Flowing]
          </Link>
          <div className="pt-2">
            <GlowingButton asChild className="w-full justify-center">
              <Link href="/login" onClick={() => setIsOpen(false)}>
                {'>> Login'}
              </Link>
            </GlowingButton>
          </div>
        </div>
      )}
    </header>
  );
}
