import type { Address } from "viem";
import { bscTestnet, opBNBTestnet } from "viem/chains";

export const ROLE = {
  ADMIN: BigInt(0),
  FACTORY_CREATOR: BigInt(1),
  BRIDGE_OPERATOR: BigInt(2),
  BRIDGE_CANCELLER: BigInt(3),
} as const;

export type RoleId = (typeof ROLE)[keyof typeof ROLE];

export const ACCESS_MANAGER_ADDRESSES: Record<number, Address> = {
  [bscTestnet.id]: "0xC86844f2c260a4c2047e9b55c615ac844412079B",
  [opBNBTestnet.id]: "0xC86844f2c260a4c2047e9b55c615ac844412079B",
} as const;

export function getAccessManagerAddress(chainId: number): Address {
  const envKey = `NEXT_PUBLIC_ACCESS_MANAGER_ADDRESS_${chainId}`;
  const fromEnv = process.env[envKey] as Address | undefined;
  return (
    fromEnv && fromEnv.length > 0 ? fromEnv : ACCESS_MANAGER_ADDRESSES[chainId]
  ) as Address;
}

export const FACTORY_TOKEN_CL8Y_BRIDGED_ADDRESS: Partial<
  Record<number, Address>
> = {
  [bscTestnet.id]: "0x06D43D56db1d9A50796B0386B724b8EE467b4ca1",
  [opBNBTestnet.id]: "0x06D43D56db1d9A50796B0386B724b8EE467b4ca1",
};

export const CHAIN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x6A6120402C89e1a88707684e26E50A6CBCe81e92",
  [opBNBTestnet.id]: "0x6A6120402C89e1a88707684e26E50A6CBCe81e92",
};

export const TOKEN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x1f2a8647830c2AA9827C6a43533C4c35088Fc926",
  [opBNBTestnet.id]: "0x1f2a8647830c2AA9827C6a43533C4c35088Fc926",
};

export const MINT_BURN_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x60D1d3BDD3999D318c953ABfFbF7793182775c1e",
  [opBNBTestnet.id]: "0x60D1d3BDD3999D318c953ABfFbF7793182775c1e",
};

export const LOCK_UNLOCK_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x843cd5E5449dd98A00F3C7cbd02CEDF618d6017b",
  [opBNBTestnet.id]: "0x843cd5E5449dd98A00F3C7cbd02CEDF618d6017b",
};

export const CL8Y_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x02E44B3e9d1cE8e7F33bfC26135216Bd6b6aF1Cf",
  [opBNBTestnet.id]: "0x02E44B3e9d1cE8e7F33bfC26135216Bd6b6aF1Cf",
};

export const DATASTORE_SET_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x77145569735Cf9B6cF43930Dd8c1875196e7e5ac",
  [opBNBTestnet.id]: "0x77145569735Cf9B6cF43930Dd8c1875196e7e5ac",
};

export const GUARD_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x7DEe783CbF61Dc6f2714B7766C943Ae608572A5C",
  [opBNBTestnet.id]: "0x7DEe783CbF61Dc6f2714B7766C943Ae608572A5C",
};

export const BLACKLIST_BASIC_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xF6163564C39cde32db28B3153B868c20674A072f",
  [opBNBTestnet.id]: "0xF6163564C39cde32db28B3153B868c20674A072f",
};

export const TOKEN_RATE_LIMIT_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x52bFD64960dF9015C203b4C1530Db789783D403e",
  [opBNBTestnet.id]: "0x52bFD64960dF9015C203b4C1530Db789783D403e",
};

export const BRIDGE_ROUTER_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x757D6483a7CB8E77E154253fdA2C76D10b78C591",
  [opBNBTestnet.id]: "0x757D6483a7CB8E77E154253fdA2C76D10b78C591",
};

export function getKnownAddressLabel(
  chainId: number,
  address: Address
): string | undefined {
  const target = address.toLowerCase();
  const candidates: Array<[Partial<Record<number, Address>>, string]> = [
    [ACCESS_MANAGER_ADDRESSES, "Access Manager"],
    [FACTORY_TOKEN_CL8Y_BRIDGED_ADDRESS, "Factory Token CL8y Bridged"],
    [CHAIN_REGISTRY_ADDRESS, "Chain Registry"],
    [TOKEN_REGISTRY_ADDRESS, "Token Registry"],
    [MINT_BURN_ADDRESS, "Mint Burn"],
    [LOCK_UNLOCK_ADDRESS, "Lock Unlock"],
    [CL8Y_BRIDGE_ADDRESS, "CL8Y Bridge"],
    [DATASTORE_SET_ADDRESS, "Datastore Set Address"],
    [GUARD_BRIDGE_ADDRESS, "Guard Bridge"],
    [BLACKLIST_BASIC_ADDRESS, "Blacklist Basic"],
    [TOKEN_RATE_LIMIT_ADDRESS, "Token Rate Limit"],
    [BRIDGE_ROUTER_ADDRESS, "Bridge Router Address"],
  ];
  for (const [byChain, label] of candidates) {
    const known = byChain[chainId];
    if (known && known.toLowerCase() === target) return label;
  }
  return undefined;
}
