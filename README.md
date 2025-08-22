AccessManager Admin DApp using Next.js, shadcn/ui, RainbowKit, wagmi/viem.

Getting Started

```bash
npm ci
cp .env.example .env.local # fill RPC URLs
npm run dev
```

Env (.env.local)

```
NEXT_PUBLIC_RPC_BSC=
NEXT_PUBLIC_RPC_BSC_TESTNET=
NEXT_PUBLIC_RPC_OPBNB=
NEXT_PUBLIC_RPC_OPBNB_TESTNET=
NEXT_PUBLIC_DEFAULT_CHAIN_ID=56
# Optional: per-chain AccessManager override
# NEXT_PUBLIC_ACCESS_MANAGER_ADDRESS_56=
# Optional: from-block for log scans
# NEXT_PUBLIC_START_BLOCK_56=
```

Deploy on Render

- Use the included `render.yaml`
- Set env vars in Render dashboard (RPC URLs, defaults)
