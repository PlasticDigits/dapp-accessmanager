"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import type { Address, Hex, Abi, AbiFunction } from "viem";
import { getAbiItem, getFunctionSelector, parseUnits } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ABI } from "@/lib/abi";
import {
  BRIDGE_ROUTER_ADDRESS,
  CHAIN_REGISTRY_ADDRESS,
  TOKEN_REGISTRY_ADDRESS,
  getAccessManagerAddress,
  CL8Y_BRIDGE_ADDRESS,
} from "@/lib/contracts";
import { getAddressExplorerUrl } from "@/lib/chains";
// Local import of IERC20 ABI
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import IERC20Artifact from "../../../artifacts/out/IERC20.sol/IERC20.json";

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
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const router = useMemo(() => BRIDGE_ROUTER_ADDRESS[chainId] as Address | undefined, [chainId]);
  const bridge = useMemo(() => CL8Y_BRIDGE_ADDRESS[chainId] as Address | undefined, [chainId]);
  const chainRegistryAddress = CHAIN_REGISTRY_ADDRESS[chainId] as Address | undefined;
  const tokenRegistryAddress = TOKEN_REGISTRY_ADDRESS[chainId] as Address | undefined;
  const accessManager = getAccessManagerAddress(chainId);

  const ERC20_ABI = (IERC20Artifact as unknown as { abi: Abi }).abi;

  type TokenListItem = {
    name: string;
    symbol: string;
    address: string;
    chainId: number;
    decimals: number;
    logoURI?: string;
  };

  // Load tokenlist from public
  const tokenlistQuery = useQuery({
    queryKey: ["tokenlist"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ tokens: TokenListItem[] }> => {
      const res = await fetch("/tokenlist.json", { cache: "force-cache" });
      if (!res.ok) throw new Error("Failed to load tokenlist");
      const data = await res.json();
      return { tokens: (data?.tokens ?? []) as TokenListItem[] };
    },
  });

  // Discover TokenRegistry ABI functions dynamically (similar to registry page)
  const tokenAbi = useMemo(() => ABI.TokenRegistry as unknown as Abi, []);
  const tokenAbiFunctions = useMemo(
    () => (tokenAbi as Abi).filter((i): i is AbiFunction => i.type === "function"),
    [tokenAbi]
  );
  const tokenListFn = useMemo(() => {
    const prefer = ["getAllTokens", "getTokens"] as const;
    for (const name of prefer) {
      if (tokenAbiFunctions.find((f) => f.name === name)) return name as string;
    }
    const found = tokenAbiFunctions.find(
      (f) =>
        f.stateMutability === "view" &&
        (f.inputs ?? []).length === 0 &&
        (f.outputs ?? []).length === 1 &&
        (f.outputs?.[0]?.type ?? "") === "address[]"
    );
    return found?.name;
  }, [tokenAbiFunctions]);

  // Fetch registered tokens and chain keys from registries
  const chainKeysQuery = useQuery({
    queryKey: ["chain-keys", chainId, chainRegistryAddress],
    enabled: Boolean(publicClient && chainRegistryAddress),
    staleTime: 60_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<readonly Hex[]> => {
      if (!publicClient || !chainRegistryAddress) return [] as const;
      try {
        const items = await publicClient.readContract({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "getChainKeys" as const,
          args: [],
        });
        return items as readonly Hex[];
      } catch {
        const count = (await publicClient.readContract({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "getChainKeyCount" as const,
          args: [],
        })) as bigint;
        const pageSize = 500n;
        const pages: Promise<readonly Hex[]>[] = [];
        for (let index = 0n; index < count; index += pageSize) {
          const take = count - index > pageSize ? pageSize : count - index;
          pages.push(
            publicClient.readContract({
              abi: ABI.ChainRegistry,
              address: chainRegistryAddress,
              functionName: "getChainKeysFrom" as const,
              args: [index, take],
            }) as Promise<readonly Hex[]>
          );
        }
        return (await Promise.all(pages)).flat();
      }
    },
  });

  const tokensQuery = useQuery({
    queryKey: ["registered-tokens", chainId, tokenRegistryAddress, tokenListFn],
    enabled: Boolean(publicClient && tokenRegistryAddress && tokenListFn),
    staleTime: 60_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<readonly Address[]> => {
      if (!publicClient || !tokenRegistryAddress || !tokenListFn) return [] as const;
      const items = await publicClient.readContract({
        abi: ABI.TokenRegistry,
        address: tokenRegistryAddress,
        functionName: tokenListFn as string,
        args: [],
      });
      return items as readonly Address[];
    },
  });

  // Form state
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [selectedChainKey, setSelectedChainKey] = useState<string>("");
  const [destAccount, setDestAccount] = useState<string>("");
  const [amountStr, setAmountStr] = useState<string>("");
  const [busyApprove, setBusyApprove] = useState(false);
  const [busyDeposit, setBusyDeposit] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const tokenMetaByAddr = useMemo(() => {
    const map: Record<string, TokenListItem> = {};
    for (const t of (tokenlistQuery.data?.tokens ?? [])) {
      if (t.chainId === chainId) map[(t.address as string).toLowerCase()] = t;
    }
    return map;
  }, [tokenlistQuery.data, chainId]);

  const selectedMeta = useMemo(() => tokenMetaByAddr[(selectedToken || "").toLowerCase()], [tokenMetaByAddr, selectedToken]);

  // Allowance query
  const allowanceQuery = useQuery({
    queryKey: ["allowance", chainId, address, router, selectedToken],
    enabled: Boolean(publicClient && address && router && selectedToken),
    staleTime: 15_000,
    queryFn: async (): Promise<bigint> => {
      if (!publicClient || !address || !router || !selectedToken) return 0n;
      const v = (await publicClient.readContract({
        abi: ERC20_ABI,
        address: selectedToken as Address,
        functionName: "allowance",
        args: [address as Address, router as Address],
      })) as bigint;
      return v ?? 0n;
    },
  });

  function toBytes32FromAddress(addr: string): Hex | undefined {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return undefined;
    const hex = addr.slice(2);
    return ("0x" + hex.padStart(64, "0")) as Hex;
  }

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

  // Current block timestamp (for countdowns)
  const nowQuery = useQuery({
    queryKey: ["block-now", chainId],
    enabled: Boolean(publicClient),
    refetchInterval: 10_000,
    queryFn: async (): Promise<bigint> => {
      const b = await publicClient!.getBlock({});
      return (b.timestamp ?? 0n) as bigint;
    },
  });

  // AccessManager canCall delay for withdraw
  const withdrawAbiItem = useMemo(() => getAbiItem({ abi: ABI.BridgeRouter as Abi, name: "withdraw" }), []);
  const withdrawAbiFn = useMemo(() => {
    const item = withdrawAbiItem as unknown as { type?: string } | undefined;
    return item && item.type === "function" ? (withdrawAbiItem as unknown as AbiFunction) : undefined;
  }, [withdrawAbiItem]);
  const withdrawSelector = useMemo(() => (withdrawAbiFn ? (getFunctionSelector(withdrawAbiFn) as Hex) : ("0x00000000" as Hex)), [withdrawAbiFn]);
  const withdrawDelayQuery = useQuery({
    queryKey: ["withdraw-delay", chainId, address],
    enabled: Boolean(publicClient && address),
    staleTime: 60_000,
    queryFn: async (): Promise<bigint> => {
      const res = (await publicClient!.readContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "canCall" as const,
        args: [address as Address, (router ?? "0x0000000000000000000000000000000000000000") as Address, withdrawSelector as Hex],
      })) as [boolean, bigint];
      return res?.[1] ?? 0n;
    },
  });

  async function handleApprove() {
    if (!publicClient || !router || !address || !selectedToken || !selectedMeta) return;
    let amount: bigint;
    try {
      amount = parseUnits((amountStr || "0").trim(), selectedMeta.decimals);
    } catch {
      setFormError("Enter a valid amount");
      return;
    }
    setBusyApprove(true);
    setFormError(undefined);
    try {
      // simulate
      await publicClient.simulateContract({
        abi: ERC20_ABI,
        address: selectedToken as Address,
        functionName: "approve",
        args: [router as Address, amount],
        account: address,
      });
      const hash = await writeContractAsync({
        abi: ERC20_ABI,
        address: selectedToken as Address,
        functionName: "approve",
        args: [router as Address, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["allowance", chainId, address, router, selectedToken] });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Approve failed";
      setFormError(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
    } finally {
      setBusyApprove(false);
    }
  }

  async function handleDeposit() {
    if (!publicClient || !router || !address || !selectedToken || !selectedMeta) return;
    if (!selectedChainKey) {
      setFormError("Select destination chain");
      return;
    }
    let amount: bigint;
    try {
      amount = parseUnits((amountStr || "0").trim(), selectedMeta.decimals);
    } catch {
      setFormError("Enter a valid amount");
      return;
    }
    const destAcc = toBytes32FromAddress(destAccount) ?? ((destAccount || "") as Hex);
    if (!/^0x[0-9a-fA-F]{64}$/.test(destAcc as string)) {
      setFormError("Enter 0x32-byte dest account or EVM address");
      return;
    }
    setBusyDeposit(true);
    setFormError(undefined);
    try {
      await publicClient.simulateContract({
        abi: ABI.BridgeRouter,
        address: router as Address,
        functionName: "deposit" as const,
        args: [selectedToken as Address, amount, selectedChainKey as Hex, destAcc as Hex],
        account: address,
      });
      const hash = await writeContractAsync({
        abi: ABI.BridgeRouter,
        address: router as Address,
        functionName: "deposit" as const,
        args: [selectedToken as Address, amount, selectedChainKey as Hex, destAcc as Hex],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setAmountStr("");
      await queryClient.invalidateQueries({ queryKey: ["bridge", chainId, router] });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Deposit failed";
      setFormError(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
    } finally {
      setBusyDeposit(false);
    }
  }

  async function handleWithdrawCall(w: Withdraw) {
    if (!publicClient || !router || !address) return;
    try {
      await publicClient.simulateContract({
        abi: ABI.BridgeRouter,
        address: router as Address,
        functionName: "withdraw" as const,
        args: [w.srcChainKey, w.token, w.to, w.amount, w.nonce],
        account: address,
      });
      const hash = await writeContractAsync({
        abi: ABI.BridgeRouter,
        address: router as Address,
        functionName: "withdraw" as const,
        args: [w.srcChainKey, w.token, w.to, w.amount, w.nonce],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["bridge", chainId, router] });
    } catch {
      // noop; errors shown inline in UI via disabled conditions
    }
  }

  function fmtBig(x?: bigint) {
    return typeof x === "bigint" ? x.toString() : String(x ?? "");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New Deposit</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {!router ? (
            <div className="text-sm text-muted-foreground">Bridge Router not configured for this chain.</div>
          ) : (
            <>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Token</Label>
                <Select value={selectedToken} onChange={(e) => setSelectedToken(e.target.value)}>
                  <option value="">Select token…</option>
                  {(tokensQuery.data ?? []).map((t) => {
                    const lower = (t as string).toLowerCase();
                    const meta = tokenMetaByAddr[lower];
                    const label = meta ? `${meta.symbol} — ${meta.name}` : (t as string);
                    return (
                      <option key={lower} value={t as string}>{label}</option>
                    );
                  })}
                </Select>
                {selectedToken && !selectedMeta && (
                  <div className="text-xs text-muted-foreground">No tokenlist metadata found. Using raw address.</div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label>Amount{selectedMeta ? ` (${selectedMeta.symbol})` : ""}</Label>
                <Input placeholder="0.0" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
                <div className="text-xs text-muted-foreground">Decimals: {selectedMeta?.decimals ?? "?"}</div>
              </div>
              <div className="grid gap-1.5">
                <Label>Destination Chain</Label>
                <Select value={selectedChainKey} onChange={(e) => setSelectedChainKey(e.target.value)}>
                  <option value="">Select chain…</option>
                  {(chainKeysQuery.data ?? []).map((ck) => (
                    <option key={ck as string} value={ck as string}>{ck as string}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Destination Account (EVM address or bytes32)</Label>
                <Input placeholder="0x..." value={destAccount} onChange={(e) => setDestAccount(e.target.value)} />
              </div>
              <div className="flex items-end gap-2 md:col-span-4">
                <Button onClick={handleApprove} disabled={!address || !selectedToken || busyApprove}>
                  {busyApprove ? "Approving…" : "Approve"}
                </Button>
                <Button onClick={handleDeposit} disabled={!address || !selectedToken || !selectedChainKey || busyDeposit}>
                  {busyDeposit ? "Depositing…" : "Deposit"}
                </Button>
                {allowanceQuery.data !== undefined && selectedMeta && amountStr && (
                  <div className="text-xs text-muted-foreground">
                    Allowance: {fmtBig(allowanceQuery.data)}
                  </div>
                )}
                {formError && <div className="text-xs text-red-600">{formError}</div>}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deposits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {!router ? (
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
          {!router ? (
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
                      {withdraw && (
                        <div className="mt-1">
                          {(() => {
                            const delay = withdrawDelayQuery.data ?? 0n;
                            const now = nowQuery.data ?? 0n;
                            const allowedAt = (approval.approvedAt ?? 0n) + delay;
                            const remaining = allowedAt > now ? Number(allowedAt - now) : 0;
                            const canClick = approval.isApproved && !approval.executed && !approval.cancelled && remaining === 0 && Boolean(address);
                            return (
                              <Button
                                size="sm"
                                className="h-7 px-2"
                                disabled={!canClick}
                                onClick={() => handleWithdrawCall(withdraw)}
                                title={remaining > 0 ? `Wait ${remaining}s` : undefined}
                              >
                                {remaining > 0 ? `Withdraw in ${remaining}s` : "Withdraw"}
                              </Button>
                            );
                          })()}
                        </div>
                      )}
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



