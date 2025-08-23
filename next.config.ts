import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const envAllowed = (process.env.NEXT_PUBLIC_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export default function config(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    output: "export",
    images: {
      unoptimized: true,
    },
    turbopack: {
      root: __dirname,
    },
    ...(isDev
      ? {
          allowedDevOrigins: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            ...envAllowed,
          ],
        }
      : {}),
  };
}
