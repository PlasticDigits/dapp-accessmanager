import {
  http,
  type Chain,
  type Address,
  encodeAbiParameters,
  keccak256,
  toHex,
} from "viem";
import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains";

export const SUPPORTED_CHAINS: readonly [Chain, Chain, Chain, Chain] = [
  bsc,
  bscTestnet,
  opBNB,
  opBNBTestnet,
] as const;

export const CHAIN_FRIENDLY_NAME: Partial<Record<number, string>> = {
  [bsc.id]: "BNB Smart Chain (BSC)",
  [bscTestnet.id]: "BSC Testnet",
  [opBNB.id]: "opBNB",
  [opBNBTestnet.id]: "opBNB Testnet",
};

// Chain-specific mapping of id -> isTestnet
export const CHAIN_IS_TESTNET: Partial<Record<number, boolean>> = {
  [bsc.id]: false,
  [bscTestnet.id]: true,
  [opBNB.id]: false,
  [opBNBTestnet.id]: true,
};

export function isChainTestnet(currentChainId: number): boolean {
  const override = CHAIN_IS_TESTNET[currentChainId];
  if (override !== undefined) return override;
  const meta = SUPPORTED_CHAINS.find((c) => c.id === currentChainId);
  return Boolean(meta?.testnet);
}

export function filterChainsByEnv(
  currentChainId: number
): { id: number; label: string }[] {
  const isTestnet = isChainTestnet(currentChainId);
  return SUPPORTED_CHAINS.filter((c) =>
    isTestnet ? c.testnet : !c.testnet
  ).map((c) => ({ id: c.id, label: CHAIN_FRIENDLY_NAME[c.id] ?? c.name }));
}

export function getPeerEvmChainIds(currentChainId: number): number[] {
  const isTestnet = isChainTestnet(currentChainId);
  const peers = SUPPORTED_CHAINS.filter((c) =>
    isTestnet ? c.testnet : !c.testnet
  ).map((c) => c.id);
  return peers.filter((id) => id !== currentChainId);
}

type RpcMap = Partial<Record<number, string>>;

export function makeTransportsFromConfig(): Record<
  number,
  ReturnType<typeof http>
> {
  const transports: Record<number, ReturnType<typeof http>> = {};
  for (const chain of SUPPORTED_CHAINS) {
    const url = (chain.rpcUrls?.default?.http?.[0] ??
      chain.rpcUrls?.public?.http?.[0]) as string | undefined;
    transports[chain.id] = http(url);
  }
  return transports;
}

export function getDefaultChainId(): number {
  const env = process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
  const parsed = env ? Number(env) : undefined;
  const isSupported = SUPPORTED_CHAINS.some((c) => c.id === parsed);
  return isSupported ? (parsed as number) : bsc.id;
}

// Block explorer hosts per supported chain
export const EXPLORER_HOST_BY_CHAIN_ID: Partial<Record<number, string>> = {
  [bsc.id]: "bscscan.com",
  [bscTestnet.id]: "testnet.bscscan.com",
  [opBNB.id]: "opbnb.bscscan.com",
  [opBNBTestnet.id]: "opbnb-testnet.bscscan.com",
};

export function getAddressExplorerUrl(
  chainId: number,
  address: Address
): string {
  const host = EXPLORER_HOST_BY_CHAIN_ID[chainId] ?? "bscscan.com";
  return `https://${host}/address/${address}`;
}

// Utilities to map between EVM chain ids and registry chain keys (bytes32)
export function evmChainIdToKey(id: number): `0x${string}` {
  const raw32 = toHex(BigInt(id), { size: 32 }) as `0x${string}`;
  const encoded = encodeAbiParameters(
    [{ type: "string" }, { type: "bytes32" }],
    ["EVM", raw32]
  );
  return keccak256(encoded);
}
export function getFriendlyNameForChainKey(
  chainKey: `0x${string}`
): string | undefined {
  const keyLower = (chainKey as string).toLowerCase();
  for (const c of SUPPORTED_CHAINS) {
    if (evmChainIdToKey(c.id).toLowerCase() === keyLower) {
      return CHAIN_FRIENDLY_NAME[c.id] ?? c.name;
    }
  }
  return undefined;
}
