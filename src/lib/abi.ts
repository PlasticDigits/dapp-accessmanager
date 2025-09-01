import AccessManager from "@/abi/AccessManagerEnumerable.json";
import FactoryTokenCL8yBridged from "@/abi/FactoryTokenCL8yBridged.json";
import type { Abi } from "viem";

// Import artifacts for additional contracts (use .abi at runtime)
import ChainRegistryArtifact from "../../artifacts/out/ChainRegistry.sol/ChainRegistry.json";
import TokenRegistryArtifact from "../../artifacts/out/TokenRegistry.sol/TokenRegistry.json";
import MintBurnArtifact from "../../artifacts/out/MintBurn.sol/MintBurn.json";
import LockUnlockArtifact from "../../artifacts/out/LockUnlock.sol/LockUnlock.json";
import Cl8YBridgeArtifact from "../../artifacts/out/CL8YBridge.sol/Cl8YBridge.json";
import DatastoreSetAddressArtifact from "../../artifacts/out/DatastoreSetAddress.sol/DatastoreSetAddress.json";
import GuardBridgeArtifact from "../../artifacts/out/GuardBridge.sol/GuardBridge.json";
import BlacklistBasicArtifact from "../../artifacts/out/BlacklistBasic.sol/BlacklistBasic.json";
import TokenRateLimitArtifact from "../../artifacts/out/TokenRateLimit.sol/TokenRateLimit.json";
import BridgeRouterArtifact from "../../artifacts/out/BridgeRouter.sol/BridgeRouter.json";
import Create3DeployerArtifact from "../../artifacts/out/Create3Deployer.sol/Create3Deployer.json";
import TokenCl8yBridgedArtifact from "../../artifacts/out/TokenCl8yBridged.sol/TokenCl8yBridged.json";

export const ABI = {
  AccessManager: AccessManager as unknown as Abi,
  FactoryTokenCL8yBridged: FactoryTokenCL8yBridged as unknown as Abi,
  ChainRegistry: (ChainRegistryArtifact as unknown as { abi: Abi }).abi,
  TokenRegistry: (TokenRegistryArtifact as unknown as { abi: Abi }).abi,
  MintBurn: (MintBurnArtifact as unknown as { abi: Abi }).abi,
  LockUnlock: (LockUnlockArtifact as unknown as { abi: Abi }).abi,
  CL8YBridge: (Cl8YBridgeArtifact as unknown as { abi: Abi }).abi,
  DatastoreSetAddress: (DatastoreSetAddressArtifact as unknown as { abi: Abi })
    .abi,
  GuardBridge: (GuardBridgeArtifact as unknown as { abi: Abi }).abi,
  BlacklistBasic: (BlacklistBasicArtifact as unknown as { abi: Abi }).abi,
  TokenRateLimit: (TokenRateLimitArtifact as unknown as { abi: Abi }).abi,
  BridgeRouter: (BridgeRouterArtifact as unknown as { abi: Abi }).abi,
  Create3Deployer: (Create3DeployerArtifact as unknown as { abi: Abi }).abi,
  TokenCl8yBridged: (TokenCl8yBridgedArtifact as unknown as { abi: Abi }).abi,
} as const;
