import { ABI } from "@/lib/abi";
import { getAccessManagerAddress } from "@/lib/contracts";
import type { Address } from "viem";
import type { PublicClient } from "viem";

export interface RoleMemberEntry {
  account: Address;
}

// Reserved for future indexed queries; currently unused
// function getStartBlock(chainId: number): bigint | undefined {
//   const key = `NEXT_PUBLIC_START_BLOCK_${chainId}`;
//   const raw = process.env[key];
//   if (!raw) return undefined;
//   const n = BigInt(raw);
//   return n > 0n ? n : undefined;
// }

export async function fetchRoleMembers(
  publicClient: PublicClient,
  chainId: number,
  roleId: bigint
): Promise<RoleMemberEntry[]> {
  const address = getAccessManagerAddress(chainId);

  // Prefer the direct enumerable call if available
  try {
    const items = await publicClient.readContract({
      abi: ABI.AccessManager,
      address,
      functionName: "getActiveRoleMembers",
      args: [roleId],
    });
    return (items as Address[]).map((account) => ({ account }));
  } catch {
    // Fallback to pagination if full list not supported by chain/node limits
    const count = await publicClient.readContract({
      abi: ABI.AccessManager,
      address,
      functionName: "getActiveRoleMemberCount",
      args: [roleId],
    });

    const memberCount = count as bigint;
    const pageSize = 500n;
    const pages: Promise<readonly Address[]>[] = [];
    for (let index = 0n; index < memberCount; index += pageSize) {
      const take =
        memberCount - index > pageSize ? pageSize : memberCount - index;
      pages.push(
        publicClient.readContract({
          abi: ABI.AccessManager,
          address,
          functionName: "getActiveRoleMembersFrom",
          args: [roleId, index, take],
        }) as Promise<readonly Address[]>
      );
    }

    const results = (await Promise.all(pages)).flat();
    return results.map((account) => ({ account }));
  }
}
