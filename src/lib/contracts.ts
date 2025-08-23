import type { Address } from "viem";
import { bscTestnet, opBNBTestnet } from "viem/chains";

export const ROLE = {
  ADMIN: BigInt(0),
  FACTORY_CREATOR: BigInt(1),
  BRIDGE_OPERATOR: BigInt(2),
  BRIDGE_CANCELLER: BigInt(3),
  BRIDGE_ROUTER: BigInt(4),
  CL8Y_BRIDGE: BigInt(5),
  PAUSER: BigInt(6),
  BLACKLISTER: BigInt(7),
  REGISTRAR: BigInt(8),
  GUARDIAN_MODULE_MANAGER: BigInt(9),
} as const;

export type RoleId = (typeof ROLE)[keyof typeof ROLE];

export type RoleKey = keyof typeof ROLE;

export type RoleMeta = {
  key: RoleKey;
  id: RoleId;
  label: string;
  description: string;
};

export const ROLES: readonly RoleMeta[] = [
  {
    key: "ADMIN",
    id: ROLE.ADMIN,
    label: "ADMIN",
    description:
      "Full administrative authority over AccessManager roles, schedules, and managed targets.",
  },
  {
    key: "FACTORY_CREATOR",
    id: ROLE.FACTORY_CREATOR,
    label: "FACTORY_CREATOR",
    description:
      "Temporary role used only during deployment/initialization of factories. Revoke after use.",
  },
  {
    key: "BRIDGE_OPERATOR",
    id: ROLE.BRIDGE_OPERATOR,
    label: "BRIDGE_OPERATOR",
    description:
      "Authorized to perform bridge operations via AccessManager-approved function selectors.",
  },
  {
    key: "BRIDGE_CANCELLER",
    id: ROLE.BRIDGE_CANCELLER,
    label: "BRIDGE_CANCELLER",
    description:
      "Authorized to cancel scheduled or in-flight bridge operations when necessary.",
  },
  {
    key: "BRIDGE_ROUTER",
    id: ROLE.BRIDGE_ROUTER,
    label: "BRIDGE_ROUTER",
    description:
      "Held by the BridgeRouter contract. Requires permissions to call deposit/withdraw on the CL8YBridge.",
  },
  {
    key: "CL8Y_BRIDGE",
    id: ROLE.CL8Y_BRIDGE,
    label: "CL8Y_BRIDGE",
    description:
      "Held by the CL8YBridge contract. Requires permissions on MintBurn for mint/burn and LockUnlock for lock/unlock.",
  },
  {
    key: "PAUSER",
    id: ROLE.PAUSER,
    label: "PAUSER",
    description: "Can pause/unpause protected contracts to mitigate incidents.",
  },
  {
    key: "BLACKLISTER",
    id: ROLE.BLACKLISTER,
    label: "BLACKLISTER",
    description:
      "Manages blacklist entries to restrict malicious or sanctioned addresses.",
  },
  {
    key: "REGISTRAR",
    id: ROLE.REGISTRAR,
    label: "REGISTRAR",
    description: "Manages Chain/Token Registry entries and related metadata.",
  },
  {
    key: "GUARDIAN_MODULE_MANAGER",
    id: ROLE.GUARDIAN_MODULE_MANAGER,
    label: "GUARDIAN_MODULE_MANAGER",
    description: "Add/Remove the GuardBridge modules.",
  },
] as const;

export function getRoleMetaById(roleId: RoleId): RoleMeta | undefined {
  return ROLES.find((r) => r.id === roleId);
}

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

export type KnownContractKey =
  | "AccessManager"
  | "FactoryTokenCL8yBridged"
  | "ChainRegistry"
  | "TokenRegistry"
  | "MintBurn"
  | "LockUnlock"
  | "CL8YBridge"
  | "DatastoreSetAddress"
  | "GuardBridge"
  | "BlacklistBasic"
  | "TokenRateLimit"
  | "BridgeRouter"
  | "Create3Deployer";

export type KnownContractMeta = {
  label: string;
  description: string;
  addressMap: Partial<Record<number, Address>>;
};

export const KNOWN_CONTRACTS: Record<KnownContractKey, KnownContractMeta> = {
  AccessManager: {
    label: "Access Manager",
    description:
      "Central role-based access control for managed targets and scheduled execution.",
    addressMap: ACCESS_MANAGER_ADDRESSES,
  },
  FactoryTokenCL8yBridged: {
    label: "Factory Token CL8y Bridged",
    description:
      "Factory for deploying bridged ERC20 token instances used by the CL8Y bridge.",
    addressMap: FACTORY_TOKEN_CL8Y_BRIDGED_ADDRESS,
  },
  ChainRegistry: {
    label: "Chain Registry",
    description:
      "Registry of supported destination chain keys and identifiers across ecosystems.",
    addressMap: CHAIN_REGISTRY_ADDRESS,
  },
  TokenRegistry: {
    label: "Token Registry",
    description:
      "Registry mapping tokens to bridge types and per-destination chain metadata.",
    addressMap: TOKEN_REGISTRY_ADDRESS,
  },
  MintBurn: {
    label: "Mint Burn",
    description:
      "Mint/burn implementation for bridged tokens on destination chains.",
    addressMap: MINT_BURN_ADDRESS,
  },
  LockUnlock: {
    label: "Lock Unlock",
    description:
      "Escrow that locks tokens on source chain and unlocks on return.",
    addressMap: LOCK_UNLOCK_ADDRESS,
  },
  CL8YBridge: {
    label: "CL8Y Bridge",
    description:
      "Core bridge contract coordinating cross-chain transfers and validations.",
    addressMap: CL8Y_BRIDGE_ADDRESS,
  },
  DatastoreSetAddress: {
    label: "Datastore Set Address",
    description:
      "Admin-managed datastore for core contract addresses and constants.",
    addressMap: DATASTORE_SET_ADDRESS,
  },
  GuardBridge: {
    label: "Guard Bridge",
    description:
      "Guardian-controlled safety module for pausing or canceling bridge operations.",
    addressMap: GUARD_BRIDGE_ADDRESS,
  },
  BlacklistBasic: {
    label: "Blacklist Basic",
    description:
      "Basic blacklist module preventing interactions from restricted addresses.",
    addressMap: BLACKLIST_BASIC_ADDRESS,
  },
  TokenRateLimit: {
    label: "Token Rate Limit",
    description:
      "Per-token throughput limiting to throttle transfers over time.",
    addressMap: TOKEN_RATE_LIMIT_ADDRESS,
  },
  BridgeRouter: {
    label: "Bridge Router",
    description:
      "Entry-point router dispatching user actions to specific bridge modules.",
    addressMap: BRIDGE_ROUTER_ADDRESS,
  },
  Create3Deployer: {
    label: "Create3 Deployer",
    description:
      "Utility for deterministic deployments using the CREATE3 pattern.",
    addressMap: CREATE3_DEPLOYER_ADDRESS,
  },
} as const;

export function getKnownAddressLabel(
  chainId: number,
  address: Address
): string | undefined {
  const target = address.toLowerCase();
  for (const key of Object.keys(KNOWN_CONTRACTS) as KnownContractKey[]) {
    const meta = KNOWN_CONTRACTS[key];
    const known = meta.addressMap[chainId];
    if (known && known.toLowerCase() === target) return meta.label;
  }
  return undefined;
}
