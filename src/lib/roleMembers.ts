import { ABI } from "@/lib/abi";
import { getAccessManagerAddress } from "@/lib/contracts";
import type { Address } from "viem";
import type { PublicClient } from "viem";

export interface RoleMemberEntry {
  account: Address;
}

function getStartBlock(chainId: number): bigint | undefined {
  const key = `NEXT_PUBLIC_START_BLOCK_${chainId}`;
  const raw = process.env[key];
  if (!raw) return undefined;
  const n = BigInt(raw);
  return n > 0n ? n : undefined;
}

export async function fetchRoleMembers(
  publicClient: PublicClient,
  chainId: number,
  roleId: bigint
): Promise<RoleMemberEntry[]> {
  const address = getAccessManagerAddress(chainId);

  // Prefer the direct enumerable call if available
  try {
    const items = (await publicClient.readContract({
      abi: ABI.AccessManager as any,
      address,
      functionName: "getActiveRoleMembers",
      args: [roleId],
    })) as Address[];
    return items.map((account) => ({ account }));
  } catch (err) {
    // Fallback to pagination if full list not supported by chain/node limits
    const count = (await publicClient.readContract({
      abi: ABI.AccessManager as any,
      address,
      functionName: "getActiveRoleMemberCount",
      args: [roleId],
    })) as bigint;

    const pageSize = 500n;
    const pages: Promise<Address[]>[] = [];
    for (let index = 0n; index < count; index += pageSize) {
      const take = count - index > pageSize ? pageSize : count - index;
      pages.push(
        publicClient.readContract({
          abi: ABI.AccessManager as any,
          address,
          functionName: "getActiveRoleMembersFrom",
          args: [roleId, index, take],
        }) as Promise<Address[]>
      );
    }

    const results = (await Promise.all(pages)).flat();
    return results.map((account) => ({ account }));
  }
}
