"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-background/80 border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-lg">
            CL8Y Guardian Protocol
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link href="/" className="underline">
              Home
            </Link>
            <Link href="/roles" className="underline">
              Roles
            </Link>
            <Link href="/registry" className="underline">
              Registry
            </Link>
            <Link href="/bridge" className="underline">
              Bridge
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ConnectButton showBalance={false} chainStatus={{ smallScreen: "icon", largeScreen: "full" }} />
        </div>
      </div>
    </header>
  );
}


