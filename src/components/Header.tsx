"use client";

import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { Menu } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-background/80 border-b">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="font-semibold text-lg truncate max-w-[60vw] md:max-w-none">
            CL8Y Guardian Protocol
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link href="/" className="underline">
              Home
            </Link>
            <Link href="/roles" className="underline">
              Roles
            </Link>
            <Link href="/chains" className="underline">
              Chains
            </Link>
            <Link href="/tokens" className="underline">
              Tokens
            </Link>
            <Link href="/bridge" className="underline">
              Bridge
            </Link>
          </nav>
        </div>
        <MobileMenu />
      </div>
    </header>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setOpen(false); // close on md+
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="relative flex items-center gap-2 shrink-0" ref={ref}>
      <div className="hidden md:block">
        <ConnectButton showBalance={false} chainStatus={{ smallScreen: "icon", largeScreen: "full" }} />
      </div>
      <button
        type="button"
        aria-label="Open menu"
        className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
        onClick={() => setOpen((p) => !p)}
      >
        <Menu className="h-5 w-5" />
      </button>
      <div
        className={`md:hidden absolute right-0 top-full mt-2 w-52 rounded-md border bg-card shadow-sm ${open ? "block" : "hidden"}`}
      >
        <div className="p-2 grid gap-1 text-sm">
          <Link href="/" className="px-2 py-1 rounded hover:bg-accent" onClick={() => setOpen(false)}>
            Home
          </Link>
          <Link href="/roles" className="px-2 py-1 rounded hover:bg-accent" onClick={() => setOpen(false)}>
            Roles
          </Link>
          <Link href="/chains" className="px-2 py-1 rounded hover:bg-accent" onClick={() => setOpen(false)}>
            Chains
          </Link>
          <Link href="/tokens" className="px-2 py-1 rounded hover:bg-accent" onClick={() => setOpen(false)}>
            Tokens
          </Link>
          <Link href="/bridge" className="px-2 py-1 rounded hover:bg-accent" onClick={() => setOpen(false)}>
            Bridge
          </Link>
          <div className="border-t my-1" />
          <div className="px-2 py-1">
            <ConnectButton showBalance={false} chainStatus={{ smallScreen: "icon", largeScreen: "full" }} />
          </div>
        </div>
      </div>
    </div>
  );
}


