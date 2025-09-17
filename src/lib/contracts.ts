import type { Address } from "viem";
import { bsc, bscTestnet, opBNBTestnet } from "viem/chains";

export const ROLE = {
  ADMIN: BigInt(0),
  FACTORY_CREATOR: BigInt(1),
  WITHDRAW_APPROVE: BigInt(2),
  WITHDRAW_CANCEL: BigInt(3),
  BRIDGE_TRANSFER: BigInt(4),
  MINTLOCK: BigInt(5),
  PAUSER: BigInt(6),
  CONFIG: BigInt(7),
  REGISTRAR: BigInt(8),
  WITHDRAW_REENABLE: BigInt(9),
  TOKEN_CREATOR: BigInt(10),
  MINTER: BigInt(11),
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
    key: "WITHDRAW_APPROVE",
    id: ROLE.WITHDRAW_APPROVE,
    label: "WITHDRAW_APPROVE",
    description:
      "Authorized to approve withdraws for claiming on the CL8Y Bridge.",
  },
  {
    key: "WITHDRAW_CANCEL",
    id: ROLE.WITHDRAW_CANCEL,
    label: "WITHDRAW_CANCEL",
    description:
      "Authorized to cancel pending withdraws - approved, but not claimed on the CL8Y Bridge",
  },
  {
    key: "BRIDGE_TRANSFER",
    id: ROLE.BRIDGE_TRANSFER,
    label: "BRIDGE_TRANSFER",
    description:
      "Withdraw/deposit permissions from CL8Y Bridge. Needed by the Bridge Router contract.",
  },
  {
    key: "MINTLOCK",
    id: ROLE.MINTLOCK,
    label: "MINTLOCK",
    description:
      "Can call mint/burn on MintBurn and lock/unlock on LockUnlock. Required by CL8Y Bridge contract.",
  },
  {
    key: "MINTER",
    id: ROLE.MINTER,
    label: "MINTER",
    description:
      "Can call mint on factory-created TokenCl8yBridged instances (bridge mint only).",
  },
  {
    key: "PAUSER",
    id: ROLE.PAUSER,
    label: "PAUSER",
    description: "Can pause/unpause protected contracts to mitigate incidents.",
  },
  {
    key: "CONFIG",
    id: ROLE.CONFIG,
    label: "CONFIG",
    description:
      "Add/remove modules and manage them for the GuardBridge, such as Blacklist and RateLimit.",
  },
  {
    key: "REGISTRAR",
    id: ROLE.REGISTRAR,
    label: "REGISTRAR",
    description: "Manages Chain/Token Registry entries and related metadata.",
  },
  {
    key: "WITHDRAW_REENABLE",
    id: ROLE.WITHDRAW_REENABLE,
    label: "WITHDRAW_REENABLE",
    description: "Reenable canceled withdraws",
  },
  {
    key: "TOKEN_CREATOR",
    id: ROLE.TOKEN_CREATOR,
    label: "TOKEN_CREATOR",
    description:
      "Authorized to create new tokens on the Factory Token CL8y Bridged (createToken).",
  },
] as const;

export function getRoleMetaById(roleId: RoleId): RoleMeta | undefined {
  return ROLES.find((r) => r.id === roleId);
}

export const CREATE3_DEPLOYER_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xf5F0da758637c19ADa0B0a521aDdF73A88061C7F",
  [bscTestnet.id]: "0xf5F0da758637c19ADa0B0a521aDdF73A88061C7F",
  [opBNBTestnet.id]: "0xf5F0da758637c19ADa0B0a521aDdF73A88061C7F",
};

export const ACCESS_MANAGER_ADDRESSES: Record<number, Address> = {
  [bsc.id]: "0x4573242bf542ED708e6D55385be4f4CFacEBef4D",
  [bscTestnet.id]: "0x4573242bf542ED708e6D55385be4f4CFacEBef4D",
  [opBNBTestnet.id]: "0x4573242bf542ED708e6D55385be4f4CFacEBef4D",
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
  [bsc.id]: "0xFf5a409d82aC4925A0DE9F2f1fbA0fa75918C7C0",
  [bscTestnet.id]: "0xFf5a409d82aC4925A0DE9F2f1fbA0fa75918C7C0",
  [opBNBTestnet.id]: "0xFf5a409d82aC4925A0DE9F2f1fbA0fa75918C7C0",
};

export const CHAIN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x5171f51454e0B818b9D8EbfEde36E3dDcBe0C94A",
  [bscTestnet.id]: "0x5171f51454e0B818b9D8EbfEde36E3dDcBe0C94A",
  [opBNBTestnet.id]: "0x5171f51454e0B818b9D8EbfEde36E3dDcBe0C94A",
};

export const TOKEN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x3ab9df4B6585D2289FBC905a93790C23E52De30A",
  [bscTestnet.id]: "0x3ab9df4B6585D2289FBC905a93790C23E52De30A",
  [opBNBTestnet.id]: "0x3ab9df4B6585D2289FBC905a93790C23E52De30A",
};

export const MINT_BURN_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x48F18D1e6dc86DF642aC1547f4F404F8f121520c",
  [bscTestnet.id]: "0x48F18D1e6dc86DF642aC1547f4F404F8f121520c",
  [opBNBTestnet.id]: "0x48F18D1e6dc86DF642aC1547f4F404F8f121520c",
};

export const LOCK_UNLOCK_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x470CC6eA7EfAd150Ee0e29C45aBd66FE7e3A02db",
  [bscTestnet.id]: "0x470CC6eA7EfAd150Ee0e29C45aBd66FE7e3A02db",
  [opBNBTestnet.id]: "0x470CC6eA7EfAd150Ee0e29C45aBd66FE7e3A02db",
};

export const CL8Y_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x5cd4f9caBdbc0Cbe29E926d7068048479db3fE81",
  [bscTestnet.id]: "0x5cd4f9caBdbc0Cbe29E926d7068048479db3fE81",
  [opBNBTestnet.id]: "0x5cd4f9caBdbc0Cbe29E926d7068048479db3fE81",
};

export const DATASTORE_SET_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xA28CeCAE2a829B4f9BEAC4d9E20697247C151E5F",
  [bscTestnet.id]: "0xA28CeCAE2a829B4f9BEAC4d9E20697247C151E5F",
  [opBNBTestnet.id]: "0xA28CeCAE2a829B4f9BEAC4d9E20697247C151E5F",
};

export const GUARD_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xcEe50bE74D2BB6AD8Df9D2734dC022cAF664416C",
  [bscTestnet.id]: "0xcEe50bE74D2BB6AD8Df9D2734dC022cAF664416C",
  [opBNBTestnet.id]: "0xcEe50bE74D2BB6AD8Df9D2734dC022cAF664416C",
};

export const BLACKLIST_BASIC_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xE0269a536bEa2729067f30DD618B009d9E4bC713",
  [bscTestnet.id]: "0xE0269a536bEa2729067f30DD618B009d9E4bC713",
  [opBNBTestnet.id]: "0xE0269a536bEa2729067f30DD618B009d9E4bC713",
};

export const TOKEN_RATE_LIMIT_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x9CCFd491b1216a4b1C00c84266b2cac4c9558c48",
  [bscTestnet.id]: "0x9CCFd491b1216a4b1C00c84266b2cac4c9558c48",
  [opBNBTestnet.id]: "0x9CCFd491b1216a4b1C00c84266b2cac4c9558c48",
};

export const BRIDGE_ROUTER_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x52Cb5DFCf0E0d086deeFe22430207C86d9701737",
  [bscTestnet.id]: "0x52Cb5DFCf0E0d086deeFe22430207C86d9701737",
  [opBNBTestnet.id]: "0x52Cb5DFCf0E0d086deeFe22430207C86d9701737",
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
