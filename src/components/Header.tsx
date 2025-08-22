"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-background/60 bg-background/80 border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          Access Manager Admin
        </Link>
        <div className="flex items-center gap-2">
          <ConnectButton showBalance={false} chainStatus={{ smallScreen: "icon", largeScreen: "full" }} />
        </div>
      </div>
    </header>
  );
}


