import type { Address } from "viem";
import { bscTestnet, opBNBTestnet } from "viem/chains";

export const ROLE = {
  ADMIN: BigInt(0),
  FACTORY_CREATOR: BigInt(1),
  BRIDGE_OPERATOR: BigInt(2),
  BRIDGE_CANCELLER: BigInt(3),
} as const;

export type RoleId = (typeof ROLE)[keyof typeof ROLE];

export const CREATE3_DEPLOYER_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xaE23BB518DB7565Fc32E32f0dD01d0D08a29e356",
  [opBNBTestnet.id]: "0xaE23BB518DB7565Fc32E32f0dD01d0D08a29e356",
};

export const ACCESS_MANAGER_ADDRESSES: Record<number, Address> = {
  [bscTestnet.id]: "0xe36D541D3B8509AD8B140Dd2e9864088970B2e6a",
  [opBNBTestnet.id]: "0xe36D541D3B8509AD8B140Dd2e9864088970B2e6a",
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
  [bscTestnet.id]: "0x1b810924F034Ec629D92dfdC60fB69E26Fd19ad6",
  [opBNBTestnet.id]: "0x1b810924F034Ec629D92dfdC60fB69E26Fd19ad6",
};

export const CHAIN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xbCA36349f57bE4f714a53D7B80C6b2Ee2FaD7D97",
  [opBNBTestnet.id]: "0xbCA36349f57bE4f714a53D7B80C6b2Ee2FaD7D97",
};

export const TOKEN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xEc7C74A161b7eE8744b1114DFd5dcd68c4c862Eb",
  [opBNBTestnet.id]: "0xEc7C74A161b7eE8744b1114DFd5dcd68c4c862Eb",
};

export const MINT_BURN_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xF1Fa3De220C493e562563dB2822148AB3B69B131",
  [opBNBTestnet.id]: "0xF1Fa3De220C493e562563dB2822148AB3B69B131",
};

export const LOCK_UNLOCK_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xd3A0819939Cd8882Ee7953F98C40A348033B24D0",
  [opBNBTestnet.id]: "0xd3A0819939Cd8882Ee7953F98C40A348033B24D0",
};

export const CL8Y_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xc4523866960085551DB6E3d26Da7234B448D1EC7",
  [opBNBTestnet.id]: "0xc4523866960085551DB6E3d26Da7234B448D1EC7",
};

export const DATASTORE_SET_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x3f8bD8DD6C3F2f1C90676559E901427DcF437649",
  [opBNBTestnet.id]: "0x3f8bD8DD6C3F2f1C90676559E901427DcF437649",
};

export const GUARD_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x2B8c5d49F15264C9cF85b3268996929BaD9bad09",
  [opBNBTestnet.id]: "0x2B8c5d49F15264C9cF85b3268996929BaD9bad09",
};

export const BLACKLIST_BASIC_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0x17c0275FBfC2df9c2a2C860b36639901e64B35Bd",
  [opBNBTestnet.id]: "0x17c0275FBfC2df9c2a2C860b36639901e64B35Bd",
};

export const TOKEN_RATE_LIMIT_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xda28F9F9687B10e3653B365563Ab47Ff12c8bD7B",
  [opBNBTestnet.id]: "0xda28F9F9687B10e3653B365563Ab47Ff12c8bD7B",
};

export const BRIDGE_ROUTER_ADDRESS: Partial<Record<number, Address>> = {
  [bscTestnet.id]: "0xB3D5a55ced4F432C9bCC9eeE2E73056471eE82a1",
  [opBNBTestnet.id]: "0xB3D5a55ced4F432C9bCC9eeE2E73056471eE82a1",
};

export function getKnownAddressLabel(
  chainId: number,
  address: Address
): string | undefined {
  const target = address.toLowerCase();
  const candidates: Array<[Partial<Record<number, Address>>, string]> = [
    [CREATE3_DEPLOYER_ADDRESS, "Create3 Deployer"],
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
    [BRIDGE_ROUTER_ADDRESS, "Bridge Router"],
  ];
  for (const [byChain, label] of candidates) {
    const known = byChain[chainId];
    if (known && known.toLowerCase() === target) return label;
  }
  return undefined;
}
