import AccessManager from "@/abi/AccessManagerEnumerable.json";
import FactoryTokenCL8yBridged from "@/abi/FactoryTokenCL8yBridged.json";
import type { Abi } from "viem";

export const ABI = {
  AccessManager: AccessManager as unknown as Abi,
  FactoryTokenCL8yBridged: FactoryTokenCL8yBridged as unknown as Abi,
} as const;
