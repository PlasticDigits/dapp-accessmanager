"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import type { Address, Hex } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ABI } from "@/lib/abi";
import { CHAIN_REGISTRY_ADDRESS } from "@/lib/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  getFriendlyNameForChainKey,
  getPeerEvmChainIds,
  CHAIN_FRIENDLY_NAME,
  evmChainIdToKey,
} from "@/lib/chains";

export default function ChainsPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  // ChainRegistry panel state
  const chainRegistryAddress = CHAIN_REGISTRY_ADDRESS[chainId] as Address | undefined;
  type ChainMethod = "EVM" | "SOL" | "COSMW" | "OTHER" | "RAW" | "REMOVE";
  const [chainMethod, setChainMethod] = useState<ChainMethod>("EVM");
  const [chainEvmId, setChainEvmId] = useState<string>("");
  const [chainSolanaId, setChainSolanaId] = useState<string>("");
  const [chainCosmwId, setChainCosmwId] = useState<string>("");
  const [chainOtherType, setChainOtherType] = useState<string>("");
  const [chainOtherRaw32, setChainOtherRaw32] = useState<string>("");
  const [chainKey32, setChainKey32] = useState<string>("");
  const [isChainSubmitting, setIsChainSubmitting] = useState(false);

  // Inline UI state for list actions
  const [removeBusy, setRemoveBusy] = useState<Record<string, boolean>>({});

  // Enumerate Chain Keys
  async function fetchChainKeys(): Promise<readonly Hex[]> {
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
  }

  const chainKeysQuery = useQuery({
    queryKey: ["chain-keys", chainId, chainRegistryAddress],
    queryFn: fetchChainKeys,
    enabled: Boolean(publicClient && chainRegistryAddress),
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  // EVM peer setup helper
  const peerEvmIds = useMemo(() => getPeerEvmChainIds(chainId), [chainId]);
  const missingEvmPeers = useMemo(() => {
    const set = new Set((chainKeysQuery.data ?? []).map((k) => (k as string).toLowerCase()));
    return peerEvmIds.filter((id) => {
      const keyHex = evmChainIdToKey(id).toLowerCase();
      return !set.has(keyHex);
    });
  }, [peerEvmIds, chainKeysQuery.data]);

  const [evmSetupBusy, setEvmSetupBusy] = useState(false);
  const [evmSetupError, setEvmSetupError] = useState<string | undefined>();

  async function handleSetupEvmPeers() {
    if (!address || !chainRegistryAddress || missingEvmPeers.length === 0) return;
    setEvmSetupBusy(true);
    setEvmSetupError(undefined);
    try {
      // Simulate each call (best-effort)
      for (const id of missingEvmPeers) {
        await publicClient!.simulateContract({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "addEVMChainKey",
          args: [BigInt(id)],
          account: address,
        });
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Simulation failed";
      setEvmSetupError(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
      setEvmSetupBusy(false);
      return;
    }
    try {
      // Execute sequentially to keep gas predictable
      for (const id of missingEvmPeers) {
        const hash = await writeContractAsync({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "addEVMChainKey",
          args: [BigInt(id)],
        });
        await publicClient!.waitForTransactionReceipt({ hash });
      }
      await queryClient.invalidateQueries({ queryKey: ["chain-keys", chainId, chainRegistryAddress] });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Setup failed";
      setEvmSetupError(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
    } finally {
      setEvmSetupBusy(false);
    }
  }

  async function handleChainRegistrySubmit() {
    if (!address || !chainRegistryAddress) return;
    try {
      setIsChainSubmitting(true);
      let hash: Hex;
      if (chainMethod === "EVM") {
        const id = Number(chainEvmId);
        if (!Number.isFinite(id) || id < 0) return;
        hash = await writeContractAsync({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "addEVMChainKey",
          args: [BigInt(id)],
        });
      } else if (chainMethod === "SOL") {
        if (!chainSolanaId) return;
        hash = await writeContractAsync({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "addSOLChainKey",
          args: [chainSolanaId],
        });
      } else if (chainMethod === "COSMW") {
        if (!chainCosmwId) return;
        hash = await writeContractAsync({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "addCOSMWChainKey",
          args: [chainCosmwId],
        });
      } else if (chainMethod === "OTHER") {
        if (!chainOtherType || !chainOtherRaw32) return;
        hash = await writeContractAsync({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "addOtherChainType",
          args: [chainOtherType, chainOtherRaw32 as Hex],
        });
      } else if (chainMethod === "RAW") {
        if (!chainKey32) return;
        hash = await writeContractAsync({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "addChainKey",
          args: [chainKey32 as Hex],
        });
      } else {
        if (!chainKey32) return;
        hash = await writeContractAsync({
          abi: ABI.ChainRegistry,
          address: chainRegistryAddress,
          functionName: "removeChainKey",
          args: [chainKey32 as Hex],
        });
      }
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["chain-keys", chainId, chainRegistryAddress] });
    } finally {
      setIsChainSubmitting(false);
    }
  }

  async function removeChainKeyInline(chainKey: Hex) {
    if (!address || !chainRegistryAddress) return;
    const key = (chainKey as string).toLowerCase();
    setRemoveBusy((p) => ({ ...p, [key]: true }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.ChainRegistry,
        address: chainRegistryAddress,
        functionName: "removeChainKey",
        args: [chainKey],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["chain-keys", chainId, chainRegistryAddress] });
    } finally {
      setRemoveBusy((p) => ({ ...p, [key]: false }));
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 sm:py-6 grid gap-4 sm:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Setup EVM Chains</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="text-sm text-muted-foreground">Missing peers detected for this environment:</div>
          {missingEvmPeers.length === 0 ? (
            <div className="text-sm text-muted-foreground">All EVM peers are registered.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {missingEvmPeers.map((id) => (
                <span key={`peer-${id}`} className="inline-flex items-center rounded-md border px-2 py-1 text-sm">
                  {CHAIN_FRIENDLY_NAME[id] ?? String(id)} ({id})
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button onClick={handleSetupEvmPeers} disabled={!address || !chainRegistryAddress || evmSetupBusy || missingEvmPeers.length === 0}>
              {evmSetupBusy ? "Setting up…" : "Add all missing EVM chains"}
            </Button>
            {evmSetupError && <div className="text-xs text-red-600">{evmSetupError}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered Chains</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(!chainKeysQuery.data || chainKeysQuery.data.length === 0) && (
            <div className="text-sm text-muted-foreground">No chains registered</div>
          )}
          {(chainKeysQuery.data ?? []).map((ck) => {
            const key = (ck as string).toLowerCase();
            const busy = Boolean(removeBusy[key]);
            const friendly = getFriendlyNameForChainKey(ck as Hex);
            return (
              <span key={ck as string} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                {friendly ? (
                  <span className="text-xs">{friendly}</span>
                ) : (
                  <span className="font-mono text-xs break-all">{ck as string}</span>
                )}
                <button
                  type="button"
                  aria-label="Remove chain"
                  className="ml-1 inline-flex items-center text-xs hover:text-red-600"
                  onClick={() => removeChainKeyInline(ck as Hex)}
                  disabled={busy || !chainRegistryAddress}
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chain Registry (Manual)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>Method</Label>
            <Select value={chainMethod} onChange={(e) => setChainMethod(e.target.value as ChainMethod)}>
              <option value="EVM">addEVMChainKey</option>
              <option value="SOL">addSOLChainKey</option>
              <option value="COSMW">addCOSMWChainKey</option>
              <option value="OTHER">addOtherChainType</option>
              <option value="RAW">addChainKey (bytes32)</option>
              <option value="REMOVE">removeChainKey (bytes32)</option>
            </Select>
          </div>
          {chainMethod === "EVM" && (
            <div className="grid gap-1.5">
              <Label>EVM Chain ID (uint)</Label>
              <Input type="number" min={0} value={chainEvmId} onChange={(e) => setChainEvmId(e.target.value)} />
            </div>
          )}
          {chainMethod === "SOL" && (
            <div className="grid gap-1.5">
              <Label>Solana Chain ID (string)</Label>
              <Input value={chainSolanaId} onChange={(e) => setChainSolanaId(e.target.value)} />
            </div>
          )}
          {chainMethod === "COSMW" && (
            <div className="grid gap-1.5">
              <Label>COSMW Chain ID (string)</Label>
              <Input value={chainCosmwId} onChange={(e) => setChainCosmwId(e.target.value)} />
            </div>
          )}
          {chainMethod === "OTHER" && (
            <>
              <div className="grid gap-1.5">
                <Label>Chain Type (string)</Label>
                <Input value={chainOtherType} onChange={(e) => setChainOtherType(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Raw Chain Key (bytes32)</Label>
                <Input placeholder="0x..." value={chainOtherRaw32} onChange={(e) => setChainOtherRaw32(e.target.value)} />
              </div>
            </>
          )}
          {(chainMethod === "RAW" || chainMethod === "REMOVE") && (
            <div className="grid gap-1.5">
              <Label>Chain Key (bytes32)</Label>
              <Input placeholder="0x..." value={chainKey32} onChange={(e) => setChainKey32(e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 md:col-span-4">
            <Button onClick={handleChainRegistrySubmit} disabled={!address || !chainRegistryAddress || isChainSubmitting}>
              {isChainSubmitting ? "Submitting..." : "Submit"}
            </Button>
            <div className="text-sm text-muted-foreground truncate max-w-full">
              Target: {chainRegistryAddress ?? "N/A"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


