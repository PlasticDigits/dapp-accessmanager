"use client";

import { useMemo } from "react";
import { useChainId, usePublicClient } from "wagmi";
import type { Address, Hex, Abi } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { ABI } from "@/lib/abi";
import { CL8Y_BRIDGE_ADDRESS } from "@/lib/contracts";
import { getAddressExplorerUrl } from "@/lib/chains";

type Deposit = {
  destChainKey: Hex;
  destTokenAddress: Hex;
  destAccount: Hex;
  from: Address;
  amount: bigint;
  nonce: bigint;
};

type Withdraw = {
  srcChainKey: Hex;
  token: Address;
  to: Address;
  amount: bigint;
  nonce: bigint;
};

type WithdrawApproval = {
  fee: bigint;
  feeRecipient: Address;
  approvedAt: bigint;
  isApproved: boolean;
  deductFromAmount: boolean;
  cancelled: boolean;
  executed: boolean;
};

const PAGE_SIZE = 100n;
const MAX_ITEMS = 10000n;

export default function BridgePage() {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const bridge = useMemo(() => CL8Y_BRIDGE_ADDRESS[chainId] as Address | undefined, [chainId]);

  async function fetchAllHashes(fn: "getDepositHashes" | "getWithdrawHashes"): Promise<Hex[]> {
    if (!publicClient || !bridge) return [];
    const hashes: Hex[] = [];
    for (let index = 0n; index < MAX_ITEMS; index += PAGE_SIZE) {
      const batch = (await publicClient.readContract({
        abi: ABI.CL8YBridge,
        address: bridge,
        functionName: fn,
        args: [index, PAGE_SIZE],
      })) as readonly Hex[];
      if (!batch.length) break;
      hashes.push(...(batch as Hex[]));
      if (batch.length < Number(PAGE_SIZE)) break;
    }
    return hashes;
  }

  const depositHashesQuery = useQuery({
    queryKey: ["bridge", chainId, bridge, "deposit-hashes"],
    queryFn: () => fetchAllHashes("getDepositHashes"),
    enabled: Boolean(publicClient && bridge),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const withdrawHashesQuery = useQuery({
    queryKey: ["bridge", chainId, bridge, "withdraw-hashes"],
    queryFn: () => fetchAllHashes("getWithdrawHashes"),
    enabled: Boolean(publicClient && bridge),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const depositsQuery = useQuery({
    queryKey: ["bridge", chainId, bridge, "deposits", depositHashesQuery.data?.length],
    queryFn: async (): Promise<Array<{ hash: Hex; item: Deposit }>> => {
      if (!publicClient || !bridge) return [];
      const hashes = (depositHashesQuery.data ?? []) as readonly Hex[];
      if (!hashes.length) return [];
      const contracts = hashes.map((h) => ({
        abi: ABI.CL8YBridge as Abi,
        address: bridge as Address,
        functionName: "getDepositFromHash" as const,
        args: [h] as const,
      }));
      const res = await publicClient.multicall({ contracts });
      const items: Array<{ hash: Hex; item: Deposit }> = [];
      res.forEach((r, i) => {
        if (r.status === "success") {
          const tup = r.result as unknown as Deposit;
          items.push({ hash: hashes[i] as Hex, item: tup });
        }
      });
      return items;
    },
    enabled: Boolean(publicClient && bridge && (depositHashesQuery.data ?? []).length),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const withdrawsAndApprovalsQuery = useQuery({
    queryKey: ["bridge", chainId, bridge, "withdraws", withdrawHashesQuery.data?.length],
    queryFn: async (): Promise<Array<{ hash: Hex; withdraw?: Withdraw; approval?: WithdrawApproval }>> => {
      if (!publicClient || !bridge) return [];
      const hashes = (withdrawHashesQuery.data ?? []) as readonly Hex[];
      if (!hashes.length) return [];
      const contracts: Array<{ abi: Abi; address: Address; functionName: string; args: readonly unknown[] }> = [];
      for (const h of hashes) {
        contracts.push({ abi: ABI.CL8YBridge as Abi, address: bridge as Address, functionName: "getWithdrawFromHash", args: [h] });
      }
      for (const h of hashes) {
        contracts.push({ abi: ABI.CL8YBridge as Abi, address: bridge as Address, functionName: "getWithdrawApproval", args: [h] });
      }
      const res = await publicClient.multicall({ contracts });
      const out: Array<{ hash: Hex; withdraw?: Withdraw; approval?: WithdrawApproval }> = [];
      for (let i = 0; i < hashes.length; i++) {
        const withdrawRes = res[i];
        const approvalRes = res[i + hashes.length];
        const entry: { hash: Hex; withdraw?: Withdraw; approval?: WithdrawApproval } = { hash: hashes[i] as Hex };
        if (withdrawRes?.status === "success") entry.withdraw = withdrawRes.result as unknown as Withdraw;
        if (approvalRes?.status === "success") entry.approval = approvalRes.result as unknown as WithdrawApproval;
        out.push(entry);
      }
      return out;
    },
    enabled: Boolean(publicClient && bridge && (withdrawHashesQuery.data ?? []).length),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  function fmtBig(x?: bigint) {
    return typeof x === "bigint" ? x.toString() : String(x ?? "");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Deposits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {!bridge ? (
            <div className="text-muted-foreground">No CL8YBridge for this chain</div>
          ) : depositHashesQuery.isLoading ? (
            <div className="text-muted-foreground">Loading deposit hashes…</div>
          ) : (depositsQuery.data ?? []).length === 0 ? (
            <div className="text-muted-foreground">No deposits</div>
          ) : (
            <div className="grid gap-2">
              {(depositsQuery.data ?? []).map(({ hash, item }) => (
                <div key={hash} className="border rounded p-2 grid gap-1">
                  <div className="text-xs text-muted-foreground break-all">Hash: {hash}</div>
                  <div className="grid gap-1 md:grid-cols-3">
                    <div>From: <a className="underline" href={getAddressExplorerUrl(chainId, item.from)} target="_blank" rel="noopener noreferrer">{item.from}</a></div>
                    <div>Amount: {fmtBig(item.amount)}</div>
                    <div>Nonce: {fmtBig(item.nonce)}</div>
                    <div className="break-all">Dest Chain Key: {item.destChainKey}</div>
                    <div className="break-all">Dest Token Addr: {item.destTokenAddress}</div>
                    <div className="break-all">Dest Account: {item.destAccount}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdraw Approvals & Withdraws</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {!bridge ? (
            <div className="text-muted-foreground">No CL8YBridge for this chain</div>
          ) : withdrawHashesQuery.isLoading ? (
            <div className="text-muted-foreground">Loading withdraw hashes…</div>
          ) : (withdrawsAndApprovalsQuery.data ?? []).length === 0 ? (
            <div className="text-muted-foreground">No withdraws</div>
          ) : (
            <div className="grid gap-2">
              {(withdrawsAndApprovalsQuery.data ?? []).map(({ hash, withdraw, approval }) => (
                <div key={hash} className="border rounded p-2 grid gap-1">
                  <div className="text-xs text-muted-foreground break-all">Hash: {hash}</div>
                  {withdraw ? (
                    <div className="grid gap-1 md:grid-cols-3">
                      <div>To: <a className="underline" href={getAddressExplorerUrl(chainId, withdraw.to)} target="_blank" rel="noopener noreferrer">{withdraw.to}</a></div>
                      <div>Token: <a className="underline" href={getAddressExplorerUrl(chainId, withdraw.token)} target="_blank" rel="noopener noreferrer">{withdraw.token}</a></div>
                      <div>Amount: {fmtBig(withdraw.amount)}</div>
                      <div>Nonce: {fmtBig(withdraw.nonce)}</div>
                      <div className="break-all">Src Chain Key: {withdraw.srcChainKey}</div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">Withdraw details unavailable</div>
                  )}
                  {approval ? (
                    <div className="grid gap-1 md:grid-cols-4 mt-1">
                      <div>Approved: {approval.isApproved ? "Yes" : "No"}</div>
                      <div>Executed: {approval.executed ? "Yes" : "No"}</div>
                      <div>Cancelled: {approval.cancelled ? "Yes" : "No"}</div>
                      <div>Fee: {fmtBig(approval.fee)}</div>
                      <div>Fee Recipient: <a className="underline" href={getAddressExplorerUrl(chainId, approval.feeRecipient)} target="_blank" rel="noopener noreferrer">{approval.feeRecipient}</a></div>
                      <div>Approved At: {fmtBig(approval.approvedAt)}</div>
                      <div>Deduct From Amount: {approval.deductFromAmount ? "Yes" : "No"}</div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">Approval details unavailable</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



