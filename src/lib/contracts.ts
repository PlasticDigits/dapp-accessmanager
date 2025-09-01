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
  [bsc.id]: "0x21ff2F046C58e423570f42f160BeC14967D69798",
  [bscTestnet.id]: "0x21ff2F046C58e423570f42f160BeC14967D69798",
  [opBNBTestnet.id]: "0x21ff2F046C58e423570f42f160BeC14967D69798",
};

export const ACCESS_MANAGER_ADDRESSES: Record<number, Address> = {
  [bsc.id]: "0xA1012cf7d54650A01608161E7C70400dE7A3B476",
  [bscTestnet.id]: "0xA1012cf7d54650A01608161E7C70400dE7A3B476",
  [opBNBTestnet.id]: "0xA1012cf7d54650A01608161E7C70400dE7A3B476",
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
  [bsc.id]: "0x05e08a938b3812DC8B7B4b16f898512ac99752CD",
  [bscTestnet.id]: "0x05e08a938b3812DC8B7B4b16f898512ac99752CD",
  [opBNBTestnet.id]: "0x05e08a938b3812DC8B7B4b16f898512ac99752CD",
};

export const CHAIN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x0B43A43A64284f49A9FDa3282C1a5f2eb74620D8",
  [bscTestnet.id]: "0x0B43A43A64284f49A9FDa3282C1a5f2eb74620D8",
  [opBNBTestnet.id]: "0x0B43A43A64284f49A9FDa3282C1a5f2eb74620D8",
};

export const TOKEN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x23F054503f163Fc5196E1D7E29B3cCDe73282101",
  [bscTestnet.id]: "0x23F054503f163Fc5196E1D7E29B3cCDe73282101",
  [opBNBTestnet.id]: "0x23F054503f163Fc5196E1D7E29B3cCDe73282101",
};

export const MINT_BURN_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x6721D7d9f4b2d75b205B0E19450D30b7284A4E15",
  [bscTestnet.id]: "0x6721D7d9f4b2d75b205B0E19450D30b7284A4E15",
  [opBNBTestnet.id]: "0x6721D7d9f4b2d75b205B0E19450D30b7284A4E15",
};

export const LOCK_UNLOCK_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x6132fcb458b8570B69052463f2F9d09B340A6bA0",
  [bscTestnet.id]: "0x6132fcb458b8570B69052463f2F9d09B340A6bA0",
  [opBNBTestnet.id]: "0x6132fcb458b8570B69052463f2F9d09B340A6bA0",
};

export const CL8Y_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x9981937e53758C46464fF89B35dF9A46175A7212",
  [bscTestnet.id]: "0x9981937e53758C46464fF89B35dF9A46175A7212",
  [opBNBTestnet.id]: "0x9981937e53758C46464fF89B35dF9A46175A7212",
};

export const DATASTORE_SET_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x246956595e15Cc5bcf0113F5a6Ce77868F03A303",
  [bscTestnet.id]: "0x246956595e15Cc5bcf0113F5a6Ce77868F03A303",
  [opBNBTestnet.id]: "0x246956595e15Cc5bcf0113F5a6Ce77868F03A303",
};

export const GUARD_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xD51218d8047018CAd98E30e63f69BCab2E41c26E",
  [bscTestnet.id]: "0xD51218d8047018CAd98E30e63f69BCab2E41c26E",
  [opBNBTestnet.id]: "0xD51218d8047018CAd98E30e63f69BCab2E41c26E",
};

export const BLACKLIST_BASIC_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x5fb049936C0376bB917D4eF1164f192f93631223",
  [bscTestnet.id]: "0x5fb049936C0376bB917D4eF1164f192f93631223",
  [opBNBTestnet.id]: "0x5fb049936C0376bB917D4eF1164f192f93631223",
};

export const TOKEN_RATE_LIMIT_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x4e333747237E42E28d0499989b21A2bc0f8a0066",
  [bscTestnet.id]: "0x4e333747237E42E28d0499989b21A2bc0f8a0066",
  [opBNBTestnet.id]: "0x4e333747237E42E28d0499989b21A2bc0f8a0066",
};

export const BRIDGE_ROUTER_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x52cDA4D1D1cC1B1499E25f75933D8A83a9c111c0",
  [bscTestnet.id]: "0x52cDA4D1D1cC1B1499E25f75933D8A83a9c111c0",
  [opBNBTestnet.id]: "0x52cDA4D1D1cC1B1499E25f75933D8A83a9c111c0",
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
