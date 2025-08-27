"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import type { Address, Hex, Abi, AbiFunction } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ABI } from "@/lib/abi";
import { CHAIN_REGISTRY_ADDRESS, TOKEN_REGISTRY_ADDRESS } from "@/lib/contracts";
import { isAddress } from "viem";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { X, Plus } from "lucide-react";
import { getAddressExplorerUrl } from "@/lib/chains";

export default function RegistryPage() {
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

  // TokenRegistry panel state
  const tokenRegistryAddress = TOKEN_REGISTRY_ADDRESS[chainId] as Address | undefined;
  const [tokenAddr, setTokenAddr] = useState<string>("");
  const [bridgeTypeLocal, setBridgeTypeLocal] = useState<string>("0");
  const [isTokenSubmitting, setIsTokenSubmitting] = useState(false);
  const [destChainKey, setDestChainKey] = useState<string>("");
  const [destChainTokenAddrBytes32, setDestChainTokenAddrBytes32] = useState<string>("");
  const [destChainTokenDecimals, setDestChainTokenDecimals] = useState<string>("");
  const [isTokenDestSubmitting, setIsTokenDestSubmitting] = useState(false);

  // Inline UI state for list actions
  const [removeBusy, setRemoveBusy] = useState<Record<string, boolean>>({});
  const [tokenDestAddOpen, setTokenDestAddOpen] = useState<Record<string, boolean>>({});
  const [tokenDestInputs, setTokenDestInputs] = useState<Record<string, { key: string; addr: string; decimals: string }>>({});
  const [tokenRemoveBusy, setTokenRemoveBusy] = useState<Record<string, boolean>>({});
  const [tokenDestRemoveBusy, setTokenDestRemoveBusy] = useState<Record<string, boolean>>({});

  // Discover TokenRegistry ABI functions dynamically
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
  const tokenRemoveFn = useMemo(
    () => tokenAbiFunctions.find((f) => f.name === "removeToken"),
    [tokenAbiFunctions]
  );
  const tokenDestKeysFn = useMemo(
    () => tokenAbiFunctions.find((f) => f.name === "getTokenDestChainKeys"),
    [tokenAbiFunctions]
  );
  const tokenDestRemoveFn = useMemo(
    () => tokenAbiFunctions.find((f) => f.name === "removeTokenDestChainKey"),
    [tokenAbiFunctions]
  );

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

  // Enumerate Tokens (best-effort via ABI)
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

  // Per-token dest chain keys (if function available)
  const tokenDestQueries = useQueries({
    queries: (tokensQuery.data ?? []).map((t) => ({
      queryKey: ["token-dest-keys", chainId, tokenRegistryAddress, t],
      enabled: Boolean(publicClient && tokenRegistryAddress && tokenDestKeysFn),
      staleTime: 60_000,
      refetchInterval: 30_000,
      queryFn: async (): Promise<readonly Hex[]> => {
        if (!publicClient || !tokenRegistryAddress || !tokenDestKeysFn) return [] as const;
        const keys = await publicClient.readContract({
          abi: ABI.TokenRegistry,
          address: tokenRegistryAddress,
          functionName: "getTokenDestChainKeys",
          args: [t],
        });
        return keys as readonly Hex[];
      },
    })),
  });

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

  async function handleAddToken() {
    if (!address || !tokenRegistryAddress) return;
    if (!isAddress(tokenAddr)) return;
    try {
      setIsTokenSubmitting(true);
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistryAddress,
        functionName: "addToken",
        args: [tokenAddr as Address, Number(bridgeTypeLocal)],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["registered-tokens", chainId, tokenRegistryAddress] });
    } finally {
      setIsTokenSubmitting(false);
    }
  }

  async function handleAddTokenDestChainKey() {
    if (!address || !tokenRegistryAddress) return;
    if (!isAddress(tokenAddr)) return;
    const decimalsNum = Number(destChainTokenDecimals);
    if (!Number.isFinite(decimalsNum) || decimalsNum < 0) return;
    if (!destChainKey || !destChainTokenAddrBytes32) return;
    try {
      setIsTokenDestSubmitting(true);
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistryAddress,
        functionName: "addTokenDestChainKey",
        args: [
          tokenAddr as Address,
          destChainKey as Hex,
          destChainTokenAddrBytes32 as Hex,
          BigInt(decimalsNum),
        ],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["token-dest-keys", chainId, tokenRegistryAddress, tokenAddr as Address] });
    } finally {
      setIsTokenDestSubmitting(false);
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

  async function removeTokenInline(token: Address) {
    if (!address || !tokenRegistryAddress || !tokenRemoveFn) return;
    const key = (token as string).toLowerCase();
    setTokenRemoveBusy((p) => ({ ...p, [key]: true }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistryAddress,
        functionName: "removeToken",
        args: [token],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["registered-tokens", chainId, tokenRegistryAddress] });
    } finally {
      setTokenRemoveBusy((p) => ({ ...p, [key]: false }));
    }
  }

  async function removeTokenDestInline(token: Address, chainKey: Hex) {
    if (!address || !tokenRegistryAddress || !tokenDestRemoveFn) return;
    const key = `${(token as string).toLowerCase()}-${(chainKey as string).toLowerCase()}`;
    setTokenDestRemoveBusy((p) => ({ ...p, [key]: true }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistryAddress,
        functionName: "removeTokenDestChainKey",
        args: [token, chainKey],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["token-dest-keys", chainId, tokenRegistryAddress, token] });
    } finally {
      setTokenDestRemoveBusy((p) => ({ ...p, [key]: false }));
    }
  }

  async function addTokenDestInline(token: Address) {
    if (!address || !tokenRegistryAddress) return;
    const k = (token as string).toLowerCase();
    const inputs = tokenDestInputs[k] || { key: "", addr: "", decimals: "" };
    const d = Number(inputs.decimals);
    if (!inputs.key || !inputs.addr || !Number.isFinite(d) || d < 0) return;
    setTokenDestRemoveBusy((p) => ({ ...p, [`add-${k}`]: true }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistryAddress,
        functionName: "addTokenDestChainKey",
        args: [token, inputs.key as Hex, inputs.addr as Hex, BigInt(d)],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["token-dest-keys", chainId, tokenRegistryAddress, token] });
      setTokenDestInputs((p) => ({ ...p, [k]: { key: "", addr: "", decimals: "" } }));
      setTokenDestAddOpen((p) => ({ ...p, [k]: false }));
    } finally {
      setTokenDestRemoveBusy((p) => ({ ...p, [`add-${k}`]: false }));
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Chain Registry</CardTitle>
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
          <div className="flex items-end gap-2 md:col-span-4">
            <Button onClick={handleChainRegistrySubmit} disabled={!address || !chainRegistryAddress || isChainSubmitting}>
              {isChainSubmitting ? "Submitting..." : "Submit"}
            </Button>
            <div className="text-sm text-muted-foreground truncate">
              Target: {chainRegistryAddress ?? "N/A"}
            </div>
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
            return (
              <span key={ck as string} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                <span className="font-mono text-xs break-all">{ck as string}</span>
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
          <CardTitle>Token Registry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Token Address</Label>
            <Input placeholder="0x..." value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>BridgeTypeLocal (uint8)</Label>
            <Input type="number" min={0} max={255} value={bridgeTypeLocal} onChange={(e) => setBridgeTypeLocal(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleAddToken} disabled={!address || !tokenRegistryAddress || isTokenSubmitting}>
              {isTokenSubmitting ? "Adding..." : "Add Token"}
            </Button>
          </div>

          <div className="border-t md:col-span-4 my-2" />

          <div className="grid gap-1.5 md:col-span-2">
            <Label>Dest Chain Key (bytes32)</Label>
            <Input placeholder="0x..." value={destChainKey} onChange={(e) => setDestChainKey(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Dest Token Address (bytes32)</Label>
            <Input placeholder="0x..." value={destChainTokenAddrBytes32} onChange={(e) => setDestChainTokenAddrBytes32(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Dest Token Decimals (uint)</Label>
            <Input type="number" min={0} value={destChainTokenDecimals} onChange={(e) => setDestChainTokenDecimals(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 md:col-span-4">
            <Button onClick={handleAddTokenDestChainKey} disabled={!address || !tokenRegistryAddress || isTokenDestSubmitting}>
              {isTokenDestSubmitting ? "Submitting..." : "Add Token Dest Chain Key"}
            </Button>
            <div className="text-sm text-muted-foreground truncate">
              Target: {tokenRegistryAddress ?? "N/A"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered Tokens</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(!tokensQuery.data || tokensQuery.data.length === 0) && (
            <div className="text-sm text-muted-foreground">No tokens registered</div>
          )}
          {(tokensQuery.data ?? []).map((t, idx) => {
            const lower = (t as string).toLowerCase();
            const busy = Boolean(tokenRemoveBusy[lower]);
            const href = getAddressExplorerUrl(chainId, t as Address);
            const dests = (tokenDestQueries[idx]?.data ?? []) as readonly Hex[];
            return (
              <div key={t as string} className="border rounded-md p-2">
                <div className="flex items-center justify-between gap-2">
                  <a className="underline break-all" href={href} target="_blank" rel="noopener noreferrer">
                    {t as string}
                  </a>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-accent"
                      onClick={() => setTokenDestAddOpen((p) => ({ ...p, [lower]: !p[lower] }))}
                      title="Add destination"
                      disabled={!tokenRegistryAddress}
                    >
                      <Plus className="w-4 h-4" /> Add
                    </button>
                    <button
                      type="button"
                      aria-label="Remove token"
                      className="inline-flex items-center text-xs hover:text-red-600"
                      onClick={() => removeTokenInline(t as Address)}
                      disabled={busy || !tokenRegistryAddress || !tokenRemoveFn}
                      title={tokenRemoveFn ? "Remove" : "Remove not available in ABI"}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {tokenDestAddOpen[lower] && (
                  <div className="mt-2 grid gap-2 md:grid-cols-4">
                    <div className="grid gap-1.5">
                      <Label>Dest Chain Key (bytes32)</Label>
                      <Input
                        placeholder="0x..."
                        value={tokenDestInputs[lower]?.key ?? ""}
                        onChange={(e) =>
                          setTokenDestInputs((p) => ({ ...p, [lower]: { ...(p[lower] ?? { key: "", addr: "", decimals: "" }), key: e.target.value } }))
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Dest Token Address (bytes32)</Label>
                      <Input
                        placeholder="0x..."
                        value={tokenDestInputs[lower]?.addr ?? ""}
                        onChange={(e) =>
                          setTokenDestInputs((p) => ({ ...p, [lower]: { ...(p[lower] ?? { key: "", addr: "", decimals: "" }), addr: e.target.value } }))
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Decimals (uint)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={tokenDestInputs[lower]?.decimals ?? ""}
                        onChange={(e) =>
                          setTokenDestInputs((p) => ({ ...p, [lower]: { ...(p[lower] ?? { key: "", addr: "", decimals: "" }), decimals: e.target.value } }))
                        }
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button onClick={() => addTokenDestInline(t as Address)} disabled={Boolean(tokenDestRemoveBusy[`add-${lower}`])}>
                        {tokenDestRemoveBusy[`add-${lower}`] ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  </div>
                )}
                {dests.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dests.map((dk) => {
                      const dkKey = `${lower}-${(dk as string).toLowerCase()}`;
                      const rmBusy = Boolean(tokenDestRemoveBusy[dkKey]);
                      return (
                        <span key={dk as string} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                          <span className="font-mono text-xs break-all">{dk as string}</span>
                          <button
                            type="button"
                            aria-label="Remove dest"
                            className="ml-1 inline-flex items-center text-xs hover:text-red-600"
                            onClick={() => removeTokenDestInline(t as Address, dk as Hex)}
                            disabled={rmBusy || !tokenDestRemoveFn}
                            title={tokenDestRemoveFn ? "Remove" : "Remove not available in ABI"}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}


