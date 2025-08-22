import { http, type Chain, type Address } from "viem";
import { bsc, bscTestnet, opBNB, opBNBTestnet } from "viem/chains";

export const SUPPORTED_CHAINS: readonly [Chain, Chain, Chain, Chain] = [
  bsc,
  bscTestnet,
  opBNB,
  opBNBTestnet,
] as const;

type RpcMap = Partial<Record<number, string>>;

export function makeTransportsFromEnv(): Record<
  number,
  ReturnType<typeof http>
> {
  const rpcUrlByChainId: RpcMap = {
    [bsc.id]: process.env.NEXT_PUBLIC_RPC_BSC,
    [bscTestnet.id]: process.env.NEXT_PUBLIC_RPC_BSC_TESTNET,
    [opBNB.id]: process.env.NEXT_PUBLIC_RPC_OPBNB,
    [opBNBTestnet.id]: process.env.NEXT_PUBLIC_RPC_OPBNB_TESTNET,
  };

  const transports: Record<number, ReturnType<typeof http>> = {};
  for (const chain of SUPPORTED_CHAINS) {
    const url = rpcUrlByChainId[chain.id];
    transports[chain.id] = http(url && url.length > 0 ? url : undefined);
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
