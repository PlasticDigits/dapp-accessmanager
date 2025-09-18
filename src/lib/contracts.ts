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
  [bsc.id]: "0xe31d91D158D54738427EC16fDD6dacCA2dC5E746",
  [bscTestnet.id]: "0xe31d91D158D54738427EC16fDD6dacCA2dC5E746",
  [opBNBTestnet.id]: "0xe31d91D158D54738427EC16fDD6dacCA2dC5E746",
} as const;

export function getAccessManagerAddress(chainId: number): Address {
  // Source from the global configuration map only (no env at runtime)
  return ACCESS_MANAGER_ADDRESSES[chainId] as Address;
}

export const FACTORY_TOKEN_CL8Y_BRIDGED_ADDRESS: Partial<
  Record<number, Address>
> = {
  [bsc.id]: "0x79D1427aC6B34Ac32871cf584F361477f2216483",
  [bscTestnet.id]: "0x79D1427aC6B34Ac32871cf584F361477f2216483",
  [opBNBTestnet.id]: "0x79D1427aC6B34Ac32871cf584F361477f2216483",
};

export const CHAIN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xb6dEE348f23a0603a668C78c71E2a2E5bab57b04",
  [bscTestnet.id]: "0xb6dEE348f23a0603a668C78c71E2a2E5bab57b04",
  [opBNBTestnet.id]: "0xb6dEE348f23a0603a668C78c71E2a2E5bab57b04",
};

export const TOKEN_REGISTRY_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xb00e2176507f719C00a54dCC4d3BB9855C0DB416",
  [bscTestnet.id]: "0xb00e2176507f719C00a54dCC4d3BB9855C0DB416",
  [opBNBTestnet.id]: "0xb00e2176507f719C00a54dCC4d3BB9855C0DB416",
};

export const MINT_BURN_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x7E9D705eF28DFe8E8A974bAc15373921b7ecfFcB",
  [bscTestnet.id]: "0x7E9D705eF28DFe8E8A974bAc15373921b7ecfFcB",
  [opBNBTestnet.id]: "0x7E9D705eF28DFe8E8A974bAc15373921b7ecfFcB",
};

export const LOCK_UNLOCK_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xCdD664503df40f31B3b7c357D12A91669c391E8c",
  [bscTestnet.id]: "0xCdD664503df40f31B3b7c357D12A91669c391E8c",
  [opBNBTestnet.id]: "0xCdD664503df40f31B3b7c357D12A91669c391E8c",
};

export const CL8Y_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xf1Ba04febE0193697ca2A59f58A8E75F1Ca58D6a",
  [bscTestnet.id]: "0xf1Ba04febE0193697ca2A59f58A8E75F1Ca58D6a",
  [opBNBTestnet.id]: "0xf1Ba04febE0193697ca2A59f58A8E75F1Ca58D6a",
};

export const DATASTORE_SET_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x9673CC1689c30fDc16669772d214581C7404446A",
  [bscTestnet.id]: "0x9673CC1689c30fDc16669772d214581C7404446A",
  [opBNBTestnet.id]: "0x9673CC1689c30fDc16669772d214581C7404446A",
};

export const GUARD_BRIDGE_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0x0bC66768f1270ad707F55042eb20aDc5283Ee74C",
  [bscTestnet.id]: "0x0bC66768f1270ad707F55042eb20aDc5283Ee74C",
  [opBNBTestnet.id]: "0x0bC66768f1270ad707F55042eb20aDc5283Ee74C",
};

export const BLACKLIST_BASIC_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xE6255c16B61D03E0cD093A2b7944b2d63B6e1825",
  [bscTestnet.id]: "0xE6255c16B61D03E0cD093A2b7944b2d63B6e1825",
  [opBNBTestnet.id]: "0xE6255c16B61D03E0cD093A2b7944b2d63B6e1825",
};

export const TOKEN_RATE_LIMIT_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xF8C12808298A85FBd2F1089e5bc239C405855686",
  [bscTestnet.id]: "0xF8C12808298A85FBd2F1089e5bc239C405855686",
  [opBNBTestnet.id]: "0xF8C12808298A85FBd2F1089e5bc239C405855686",
};

export const BRIDGE_ROUTER_ADDRESS: Partial<Record<number, Address>> = {
  [bsc.id]: "0xf75ad45fC50330c3687fFd7D676f9642aAE54a0f",
  [bscTestnet.id]: "0xf75ad45fC50330c3687fFd7D676f9642aAE54a0f",
  [opBNBTestnet.id]: "0xf75ad45fC50330c3687fFd7D676f9642aAE54a0f",
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
