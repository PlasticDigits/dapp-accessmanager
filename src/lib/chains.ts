import { http, type Chain } from "viem";
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
