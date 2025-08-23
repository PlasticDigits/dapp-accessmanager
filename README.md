CL8Y Guardian Protocol Admin DApp using Next.js, shadcn/ui, RainbowKit, wagmi/viem.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

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

#### Static Site (recommended)

- Build command: `npm ci && npm run build`
- Publish directory: `out`
- Set only `NEXT_PUBLIC_*` env vars (used at build time)

#### Node Web Service (SSR)

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- No publish directory

### License

- Licensed under AGPL-3.0-only. See `LICENSE`.
