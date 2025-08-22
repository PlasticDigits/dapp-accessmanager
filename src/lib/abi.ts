import AccessManager from "@/abi/AccessManagerEnumerable.json";
import FactoryTokenCL8yBridged from "@/abi/FactoryTokenCL8yBridged.json";

export const ABI = {
  AccessManager: AccessManager as unknown as readonly any[],
  FactoryTokenCL8yBridged: FactoryTokenCL8yBridged as unknown as readonly any[],
} as const;
