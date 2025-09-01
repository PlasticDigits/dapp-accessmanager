"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import type { Address, Hex, Abi, AbiFunction } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, CheckCircle, XCircle } from "lucide-react";
import { ABI } from "@/lib/abi";
import {
  FACTORY_TOKEN_CL8Y_BRIDGED_ADDRESS,
  TOKEN_REGISTRY_ADDRESS,
  ROLE,
  MINT_BURN_ADDRESS,
} from "@/lib/contracts";
import { getAddressExplorerUrl, filterChainsByEnv, evmChainIdToKey } from "@/lib/chains";
import { isAddress } from "viem";

export default function TokensPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  // Addresses
  const factory = useMemo(
    () => FACTORY_TOKEN_CL8Y_BRIDGED_ADDRESS[chainId] as Address | undefined,
    [chainId]
  );
  const tokenRegistry = useMemo(
    () => TOKEN_REGISTRY_ADDRESS[chainId] as Address | undefined,
    [chainId]
  );

  // ========== Creator: Discover list fns ==========
  const factoryAbi = useMemo(() => ABI.FactoryTokenCL8yBridged as unknown as Abi, []);
  const factoryAbiFunctions = useMemo(
    () => (factoryAbi as Abi).filter((i): i is AbiFunction => i.type === "function"),
    [factoryAbi]
  );
  const factoryListFn = useMemo(() => {
    const prefer = ["getAllTokens", "getTokens"] as const;
    for (const name of prefer) {
      if (factoryAbiFunctions.find((f) => f.name === name)) return name as string;
    }
    const found = factoryAbiFunctions.find(
      (f) =>
        f.stateMutability === "view" &&
        (f.inputs ?? []).length === 0 &&
        (f.outputs ?? []).length === 1 &&
        (f.outputs?.[0]?.type ?? "") === "address[]"
    );
    return found?.name;
  }, [factoryAbiFunctions]);

  const hasIsTokenCreated = useMemo(
    () => Boolean(factoryAbiFunctions.find((f) => f.name === "isTokenCreated")),
    [factoryAbiFunctions]
  );

  // ========== Registry: Discover list fns ==========
  const tokenRegistryAbi = useMemo(() => ABI.TokenRegistry as unknown as Abi, []);
  const tokenRegistryFns = useMemo(
    () => (tokenRegistryAbi as Abi).filter((i): i is AbiFunction => i.type === "function"),
    [tokenRegistryAbi]
  );
  const tokenRegListFn = useMemo(() => {
    const prefer = ["getAllTokens", "getTokens"] as const;
    for (const name of prefer) {
      if (tokenRegistryFns.find((f) => f.name === name)) return name as string;
    }
    const found = tokenRegistryFns.find(
      (f) =>
        f.stateMutability === "view" &&
        (f.inputs ?? []).length === 0 &&
        (f.outputs ?? []).length === 1 &&
        (f.outputs?.[0]?.type ?? "") === "address[]"
    );
    return found?.name;
  }, [tokenRegistryFns]);

  // ========== Queries ==========
  const createdTokensQuery = useQuery({
    queryKey: ["factory-created-tokens", chainId, factory, factoryListFn],
    enabled: Boolean(publicClient && factory && factoryListFn),
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!publicClient || !factory || !factoryListFn) return [] as Address[];
      const items = (await publicClient.readContract({
        abi: ABI.FactoryTokenCL8yBridged,
        address: factory,
        functionName: factoryListFn as string,
        args: [],
      })) as Address[];
      return items ?? [];
    },
  });

  const registryTokensQuery = useQuery({
    queryKey: ["registry-tokens", chainId, tokenRegistry, tokenRegListFn],
    enabled: Boolean(publicClient && tokenRegistry && tokenRegListFn),
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!publicClient || !tokenRegistry || !tokenRegListFn) return [] as Address[];
      const items = (await publicClient.readContract({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: tokenRegListFn as string,
        args: [],
      })) as Address[];
      return items ?? [];
    },
  });

  const registrySet = useMemo(() => {
    const set = new Set<string>();
    for (const t of (registryTokensQuery.data ?? []) as Address[]) set.add((t as string).toLowerCase());
    return set;
  }, [registryTokensQuery.data]);

  const createdChecks = useQueries({
    queries: (createdTokensQuery.data ?? []).map((t) => ({
      queryKey: ["factory-created-check", chainId, factory, t],
      enabled: Boolean(publicClient && factory && hasIsTokenCreated),
      staleTime: 60_000,
      queryFn: async (): Promise<boolean | undefined> => {
        if (!publicClient || !factory || !hasIsTokenCreated) return undefined;
        const v = (await publicClient.readContract({
          abi: ABI.FactoryTokenCL8yBridged,
          address: factory,
          functionName: "isTokenCreated",
          args: [t as Address],
        })) as boolean;
        return Boolean(v);
      },
    })),
  });

  // Token metadata helper
  function sanitizeTokenText(value: unknown, maxLen = 64): string {
    try {
      const text = String(value ?? "").trim();
      return text.length > maxLen ? text.slice(0, maxLen) : text;
    } catch {
      return "";
    }
  }
  function toSafeLogoSrc(raw: unknown): string | undefined {
    try {
      const s = String(raw ?? "").trim();
      if (!s) return undefined;
      if (s.startsWith("ipfs://")) {
        const path = s.replace(/^ipfs:\/\//, "");
        return `https://ipfs.io/ipfs/${encodeURI(path)}`;
      }
      const url = new URL(s);
      if (url.protocol === "https:") return url.toString();
      return undefined;
    } catch {
      return undefined;
    }
  }

  const tokenMetaCreatedQueries = useQueries({
    queries: (createdTokensQuery.data ?? []).map((t) => ({
      queryKey: ["token-meta-created", chainId, t],
      enabled: Boolean(publicClient && t),
      staleTime: 60_000,
      queryFn: async () => {
        if (!publicClient) return undefined as | { name: string; symbol: string; logo?: string } | undefined;
        const [name, symbol, logo] = await Promise.all([
          publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "name", args: [] }) as Promise<string>,
          publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "symbol", args: [] }) as Promise<string>,
          publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "logoLink", args: [] }) as Promise<string>,
        ]);
        return { name, symbol, logo };
      },
    })),
  });

  const tokenMetaRegisteredQueries = useQueries({
    queries: (registryTokensQuery.data ?? []).map((t) => ({
      queryKey: ["reg-token-meta", chainId, t],
      enabled: Boolean(publicClient && t),
      staleTime: 60_000,
      queryFn: async () => {
        if (!publicClient) return undefined as | { name: string; symbol: string; logo?: string } | undefined;
        const [name, symbol, logo] = await Promise.all([
          publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "name", args: [] }) as Promise<string>,
          publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "symbol", args: [] }) as Promise<string>,
          publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "logoLink", args: [] }) as Promise<string>,
        ]);
        return { name, symbol, logo };
      },
    })),
  });

  // Access Manager and mint permission checks (Created tokens)
  const tokenAccessManagers = useQueries({
    queries: (createdTokensQuery.data ?? []).map((t) => ({
      queryKey: ["token-am", chainId, t],
      enabled: Boolean(publicClient && t),
      staleTime: 60_000,
      queryFn: async (): Promise<Address | undefined> => {
        if (!publicClient) return undefined;
        try {
          const am = (await publicClient.readContract({
            abi: ABI.TokenCl8yBridged,
            address: t as Address,
            functionName: "accessManager",
            args: [],
          })) as Address;
          return am;
        } catch {
          try {
            const am2 = (await publicClient.readContract({
              abi: ABI.TokenCl8yBridged,
              address: t as Address,
              functionName: "authority",
              args: [],
            })) as Address;
            return am2;
          } catch {
            return undefined;
          }
        }
      },
    })),
  });

  const mintRoleChecks = useQueries({
    queries: (createdTokensQuery.data ?? []).map((t, idx) => ({
      queryKey: ["token-mintrole", chainId, t, tokenAccessManagers[idx]?.data],
      enabled: Boolean(publicClient && tokenAccessManagers[idx]?.data && MINT_BURN_ADDRESS[chainId]),
      staleTime: 60_000,
      queryFn: async (): Promise<boolean> => {
        if (!publicClient) return false;
        const am = tokenAccessManagers[idx]?.data as Address | undefined;
        const mintBurn = MINT_BURN_ADDRESS[chainId] as Address | undefined;
        if (!am || !mintBurn) return false;
        const res = (await publicClient.readContract({
          abi: ABI.AccessManager,
          address: am,
          functionName: "hasRole",
          args: [ROLE.MINTLOCK, mintBurn],
        })) as [boolean, bigint];
        return Boolean(res?.[0]);
      },
    })),
  });

  const adminChecksForTokenAM = useQueries({
    queries: (createdTokensQuery.data ?? []).map((t, idx) => ({
      queryKey: ["token-admin", chainId, t, tokenAccessManagers[idx]?.data, address],
      enabled: Boolean(publicClient && address && tokenAccessManagers[idx]?.data),
      staleTime: 60_000,
      queryFn: async (): Promise<boolean> => {
        if (!publicClient || !address) return false;
        const am = tokenAccessManagers[idx]?.data as Address | undefined;
        if (!am) return false;
        const res = (await publicClient.readContract({
          abi: ABI.AccessManager,
          address: am,
          functionName: "hasRole",
          args: [ROLE.ADMIN, address as Address],
        })) as [boolean, bigint];
        return Boolean(res?.[0]);
      },
    })),
  });

  // ========== Creator: actions ==========
  const [baseName, setBaseName] = useState("");
  const [baseSymbol, setBaseSymbol] = useState("");
  const [logoLink, setLogoLink] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | undefined>(undefined);

  async function handleCreateToken() {
    if (!publicClient || !factory || !address) return;
    if (!baseName.trim() || !baseSymbol.trim()) return;
    setSubmitBusy(true);
    setSubmitErr(undefined);
    try {
      await publicClient.simulateContract({
        abi: ABI.FactoryTokenCL8yBridged,
        address: factory,
        functionName: "createToken",
        args: [baseName, baseSymbol, logoLink],
        account: address,
      });
      const hash = await writeContractAsync({
        abi: ABI.FactoryTokenCL8yBridged,
        address: factory,
        functionName: "createToken",
        args: [baseName, baseSymbol, logoLink],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setBaseName("");
      setBaseSymbol("");
      setLogoLink("");
      await queryClient.invalidateQueries({ queryKey: ["factory-created-tokens", chainId, factory] });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Create failed";
      setSubmitErr(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
    } finally {
      setSubmitBusy(false);
    }
  }

  const [setMintBusy, setSetMintBusy] = useState<Record<string, boolean>>({});
  const [setMintErrors, setSetMintErrors] = useState<Record<string, string | undefined>>({});
  const [registerBusy, setRegisterBusy] = useState<Record<string, boolean>>({});
  const [registerErrors, setRegisterErrors] = useState<Record<string, string | undefined>>({});

  async function handleSetMintRole(idx: number) {
    const am = tokenAccessManagers[idx]?.data as Address | undefined;
    const mintBurn = MINT_BURN_ADDRESS[chainId] as Address | undefined;
    if (!publicClient || !am || !mintBurn) return;
    const key = (createdTokensQuery.data?.[idx] as string | undefined)?.toLowerCase() ?? String(idx);
    setSetMintBusy((p) => ({ ...p, [key]: true }));
    setSetMintErrors((p) => ({ ...p, [key]: undefined }));
    try {
      await publicClient.simulateContract({
        abi: ABI.AccessManager,
        address: am,
        functionName: "grantRole",
        args: [ROLE.MINTLOCK, mintBurn as Address, 0n],
        account: address,
      });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Simulation failed";
      setSetMintErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
      setSetMintBusy((p) => ({ ...p, [key]: false }));
      return;
    }
    try {
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: am,
        functionName: "grantRole",
        args: [ROLE.MINTLOCK, mintBurn as Address, 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const tokenAddr = (createdTokensQuery.data?.[idx] ?? undefined) as Address | undefined;
      await queryClient.invalidateQueries({ queryKey: ["token-mintrole", chainId, tokenAddr, am] });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Grant failed";
      setSetMintErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      setSetMintBusy((p) => ({ ...p, [key]: false }));
    }
  }

  async function handleRegisterToken(addr: Address) {
    if (!publicClient || !tokenRegistry || !address) return;
    const key = (addr as string).toLowerCase();
    setRegisterBusy((p) => ({ ...p, [key]: true }));
    setRegisterErrors((p) => ({ ...p, [key]: undefined }));
    try {
      await publicClient.simulateContract({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: "addToken",
        args: [addr, 0],
        account: address,
      });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Simulation failed";
      setRegisterErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
      setRegisterBusy((p) => ({ ...p, [key]: false }));
      return;
    }
    try {
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: "addToken",
        args: [addr, 0],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["registry-tokens", chainId, tokenRegistry] });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Register failed";
      setRegisterErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      setRegisterBusy((p) => ({ ...p, [key]: false }));
    }
  }

  // ========== Token Registry actions ==========
  const [tokenAddr, setTokenAddr] = useState<string>("");
  const [bridgeTypeLocal, setBridgeTypeLocal] = useState<string>("0");
  const [isTokenSubmitting, setIsTokenSubmitting] = useState(false);
  const [destChainKey, setDestChainKey] = useState<string>("");
  const [destChainTokenAddrBytes32, setDestChainTokenAddrBytes32] = useState<string>("");
  const [destChainTokenDecimals, setDestChainTokenDecimals] = useState<string>("");
  const [isTokenDestSubmitting, setIsTokenDestSubmitting] = useState(false);

  const [tokenDestAddOpen, setTokenDestAddOpen] = useState<Record<string, boolean>>({});
  // Per token+chain inline inputs
  const [destPerChainInputs, setDestPerChainInputs] = useState<Record<string, { mode: "same" | "custom"; addr: string; decimals: string }>>({});
  const [tokenRemoveBusy, setTokenRemoveBusy] = useState<Record<string, boolean>>({});
  const [tokenDestRemoveBusy, setTokenDestRemoveBusy] = useState<Record<string, boolean>>({});

  // TokenRegistry ABI helpers
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

  // Registered tokens meta and destinations
  const tokensQuery = useQuery({
    queryKey: ["registered-tokens", chainId, tokenRegistry, tokenListFn],
    enabled: Boolean(publicClient && tokenRegistry && tokenListFn),
    staleTime: 60_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<readonly Address[]> => {
      if (!publicClient || !tokenRegistry || !tokenListFn) return [] as const;
      const items = await publicClient.readContract({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: tokenListFn as string,
        args: [],
      });
      return items as readonly Address[];
    },
  });

  const tokenDestQueries = useQueries({
    queries: (tokensQuery.data ?? []).map((t) => ({
      queryKey: ["token-dest-keys", chainId, tokenRegistry, t],
      enabled: Boolean(publicClient && tokenRegistry && tokenDestKeysFn),
      staleTime: 60_000,
      refetchInterval: 30_000,
      queryFn: async (): Promise<readonly Hex[]> => {
        if (!publicClient || !tokenRegistry || !tokenDestKeysFn) return [] as const;
        const keys = await publicClient.readContract({
          abi: ABI.TokenRegistry,
          address: tokenRegistry,
          functionName: "getTokenDestChainKeys",
          args: [t],
        });
        return keys as readonly Hex[];
      },
    })),
  });

  const tokenMetaQueries = tokenMetaRegisteredQueries;

  // Helper: EVM address -> bytes32 (left-padded)
  function addressToBytes32(addr: string): Hex {
    const a = (addr || "").toLowerCase();
    if (!a.startsWith("0x") || a.length !== 42) return "0x" as Hex;
    return ("0x" + "0".repeat(24) + a.slice(2)) as Hex;
  }

  async function handleAddToken() {
    if (!address || !tokenRegistry) return;
    if (!isAddress(tokenAddr)) return;
    try {
      setIsTokenSubmitting(true);
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: "addToken",
        args: [tokenAddr as Address, Number(bridgeTypeLocal)],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["registered-tokens", chainId, tokenRegistry] });
    } finally {
      setIsTokenSubmitting(false);
    }
  }

  async function handleAddTokenDestChainKey() {
    if (!address || !tokenRegistry) return;
    if (!isAddress(tokenAddr)) return;
    const decimalsNum = Number(destChainTokenDecimals);
    if (!Number.isFinite(decimalsNum) || decimalsNum < 0) return;
    if (!destChainKey || !destChainTokenAddrBytes32) return;
    try {
      setIsTokenDestSubmitting(true);
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: "addTokenDestChainKey",
        args: [tokenAddr as Address, destChainKey as Hex, destChainTokenAddrBytes32 as Hex, BigInt(decimalsNum)],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["token-dest-keys", chainId, tokenRegistry, tokenAddr as Address] });
    } finally {
      setIsTokenDestSubmitting(false);
    }
  }

  async function removeTokenInline(token: Address) {
    if (!address || !tokenRegistry || !tokenRemoveFn) return;
    const key = (token as string).toLowerCase();
    setTokenRemoveBusy((p) => ({ ...p, [key]: true }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: "removeToken",
        args: [token],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["registered-tokens", chainId, tokenRegistry] });
    } finally {
      setTokenRemoveBusy((p) => ({ ...p, [key]: false }));
    }
  }

  async function removeTokenDestInline(token: Address, chainKey: Hex) {
    if (!address || !tokenRegistry || !tokenDestRemoveFn) return;
    const key = `${(token as string).toLowerCase()}-${(chainKey as string).toLowerCase()}`;
    setTokenDestRemoveBusy((p) => ({ ...p, [key]: true }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: "removeTokenDestChainKey",
        args: [token, chainKey],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["token-dest-keys", chainId, tokenRegistry, token] });
    } finally {
      setTokenDestRemoveBusy((p) => ({ ...p, [key]: false }));
    }
  }

  async function addTokenDestForChain(token: Address, targetChainId: number) {
    if (!address || !tokenRegistry) return;
    const lower = (token as string).toLowerCase();
    const key = `${lower}-${targetChainId}`;
    const inputs = destPerChainInputs[key] || { mode: "same", addr: "", decimals: "" };
    const d = Number(inputs.decimals || "");
    if (!Number.isFinite(d) || d < 0) return;
    const chainKey = evmChainIdToKey(targetChainId) as Hex;
    const addrBytes32 = inputs.mode === "same" ? addressToBytes32(token as string) : addressToBytes32(inputs.addr);
    if ((addrBytes32 as string).length !== 66) return;
    setTokenDestRemoveBusy((p) => ({ ...p, [`add-${key}`]: true }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.TokenRegistry,
        address: tokenRegistry,
        functionName: "addTokenDestChainKey",
        args: [token, chainKey, addrBytes32, BigInt(d)],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["token-dest-keys", chainId, tokenRegistry, token] });
      setDestPerChainInputs((p) => ({ ...p, [key]: { mode: "same", addr: "", decimals: "" } }));
    } finally {
      setTokenDestRemoveBusy((p) => ({ ...p, [`add-${key}`]: false }));
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 sm:py-6 grid gap-4 sm:gap-6">
      {/* Token Creator */}
      <Card>
        <CardHeader>
          <CardTitle>Token Creator</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {!factory ? (
            <div className="text-sm text-muted-foreground">Factory not configured for this chain.</div>
          ) : (
            <>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Base Name</Label>
                <Input value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder="My Token" />
              </div>
              <div className="grid gap-1.5">
                <Label>Base Symbol</Label>
                <Input value={baseSymbol} onChange={(e) => setBaseSymbol(e.target.value)} placeholder="MTK" />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Logo Link (optional)</Label>
                <Input value={logoLink} onChange={(e) => setLogoLink(e.target.value)} placeholder="https://..." />
              </div>
              <div className="flex flex-wrap items-end gap-2 md:col-span-4">
                <Button onClick={handleCreateToken} disabled={!address || !baseName || !baseSymbol || submitBusy}>
                  {submitBusy ? "Creating…" : "Create Token"}
                </Button>
                <div className="text-sm text-muted-foreground truncate max-w-full">Target: {factory}</div>
                {submitErr && <div className="text-xs text-red-600">{submitErr}</div>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Created Tokens */}
      <Card>
        <CardHeader>
          <CardTitle>Created Tokens</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {!factory ? (
            <div className="text-sm text-muted-foreground">Unavailable on this chain.</div>
          ) : createdTokensQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading tokens…</div>
          ) : (createdTokensQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No tokens created yet.</div>
          ) : (
            <div className="grid gap-2">
              {(createdTokensQuery.data ?? []).map((t, idx) => {
                const lower = (t as string).toLowerCase();
                const isReg = registrySet.has(lower);
                const createdOk = createdChecks[idx]?.data;
                const href = getAddressExplorerUrl(chainId, t as Address);
                const meta = tokenMetaCreatedQueries[idx]?.data as | { name: string; symbol: string; logo?: string } | undefined;
                const safeName = sanitizeTokenText(meta?.name ?? "");
                const safeSymbol = sanitizeTokenText(meta?.symbol ?? "");
                const safeLogo = toSafeLogoSrc(meta?.logo);
                const am = tokenAccessManagers[idx]?.data as Address | undefined;
                const mintOk = Boolean(mintRoleChecks[idx]?.data);
                const isAdminForToken = Boolean(adminChecksForTokenAM[idx]?.data);
                return (
                  <div key={lower} className="border rounded p-2 grid gap-2 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        {safeLogo ? (
                          <img
                            src={safeLogo}
                            alt={safeName || safeSymbol || (t as string)}
                            referrerPolicy="no-referrer"
                            decoding="async"
                            loading="lazy"
                            className="h-12 w-12 rounded-full object-contain bg-black"
                            onError={(e) => {
                              const el = e.currentTarget as HTMLImageElement;
                              el.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-black" />
                        )}
                      </a>
                      <div className="flex flex-col min-w-0">
                        <div className="font-medium truncate">
                          {safeName || "Unnamed"} {safeSymbol && <span className="text-muted-foreground">({safeSymbol})</span>}
                        </div>
                        <a className="underline break-all text-xs text-muted-foreground" href={href} target="_blank" rel="noopener noreferrer">
                          {t as string}
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isReg && (
                        <>
                          <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-muted-foreground">Not Registered</span>
                          <Button size="sm" onClick={() => handleRegisterToken(t as Address)} disabled={!address || Boolean(registerBusy[lower]) || !tokenRegistry}>
                            {registerBusy[lower] ? "Registering…" : "Register (MintBurn)"}
                          </Button>
                        </>
                      )}
                      {isReg && (
                        <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-green-600 border-green-600">Registered</span>
                      )}
                      {createdOk !== undefined && (
                        <span className={"inline-flex items-center rounded-md border px-2 py-0.5 " + (createdOk ? "text-green-600 border-green-600" : "text-muted-foreground")}>
                          {createdOk ? "Factory Confirmed" : "Unknown"}
                        </span>
                      )}
                      {mintOk ? (
                        <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-green-600 border-green-600">MintBurn Ready</span>
                      ) : (
                        <>
                          <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-red-600 border-red-600">✗ Requires mint permissions for bridging</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetMintRole(idx)}
                            disabled={!address || !isAdminForToken || Boolean(setMintBusy[lower]) || !am}
                            title={!address ? "Connect wallet" : !isAdminForToken ? "Not admin" : undefined}
                          >
                            {setMintBusy[lower] ? "Setting…" : "SET"}
                          </Button>
                        </>
                      )}
                      {registerErrors[lower] && <div className="text-xs text-red-600">{registerErrors[lower]}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Token Registry */}
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
            <Label>Bridge Type</Label>
            <Select value={bridgeTypeLocal} onChange={(e) => setBridgeTypeLocal(e.target.value)}>
              <option value="0">MintBurn</option>
              <option value="1">LockUnlock</option>
            </Select>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <Button onClick={handleAddToken} disabled={!address || !tokenRegistry || isTokenSubmitting}>
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
          <div className="flex flex-wrap items-end gap-2 md:col-span-4">
            <Button onClick={handleAddTokenDestChainKey} disabled={!address || !tokenRegistry || isTokenDestSubmitting}>
              {isTokenDestSubmitting ? "Submitting..." : "Add Token Dest Chain Key"}
            </Button>
            <div className="text-sm text-muted-foreground truncate max-w-full">Target: {tokenRegistry ?? "N/A"}</div>
          </div>
        </CardContent>
      </Card>

      {/* Registered Tokens */}
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
            const meta = tokenMetaQueries[idx]?.data as | { name: string; symbol: string; logo?: string } | undefined;
            const safeName = sanitizeTokenText(meta?.name ?? "");
            const safeSymbol = sanitizeTokenText(meta?.symbol ?? "");
            const safeLogo = toSafeLogoSrc(meta?.logo);
            const ordered = filterChainsByEnv(chainId).filter((c) => c.id !== chainId);
            return (
              <div key={t as string} className="border rounded-md p-2 grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {safeLogo ? (
                      <img
                        src={safeLogo}
                        alt={safeName || safeSymbol || (t as string)}
                        referrerPolicy="no-referrer"
                        decoding="async"
                        loading="lazy"
                        className="h-10 w-10 rounded-full object-contain bg-black shrink-0"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-black shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <div className="font-medium truncate">
                        {safeName || "Unnamed"} {safeSymbol && <span className="text-muted-foreground">({safeSymbol})</span>}
                      </div>
                      <a className="underline break-all text-xs text-muted-foreground" href={href} target="_blank" rel="noopener noreferrer">
                        {t as string}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" />
                </div>
                
                <div className="grid gap-2">
                  {ordered.map((c) => {
                      const chainKey = evmChainIdToKey(c.id).toLowerCase();
                      const isReg = dests.some((dk) => (dk as string).toLowerCase() === chainKey);
                      const inputKey = `${lower}-${c.id}`;
                      const input = destPerChainInputs[inputKey] || { mode: "same", addr: "", decimals: "" };
                      const addBusy = Boolean(tokenDestRemoveBusy[`add-${inputKey}`]);
                      return (
                        <div key={c.id} className="grid gap-2">
                          <div className="flex items-center gap-2">
                            {isReg ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                            <div className="text-sm flex items-center gap-2">
                              {c.label} ({c.id})
                              {isReg && (
                                <a
                                  href={getAddressExplorerUrl(c.id, t as Address)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline text-xs text-muted-foreground"
                                  title="Open in explorer"
                                >
                                  scan
                                </a>
                              )}
                              {isReg && (
                                <button
                                  type="button"
                                  aria-label="Unregister destination"
                                  title="Unregister"
                                  className="inline-flex items-center text-xs hover:text-red-600"
                                  onClick={() => removeTokenDestInline(t as Address, evmChainIdToKey(c.id) as Hex)}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          {!isReg && (
                            <div className="grid gap-2 md:grid-cols-4 items-end">
                              <div className="grid gap-1.5">
                                <Label>Address Mode</Label>
                                <Select
                                  value={input.mode}
                                  onChange={(e) =>
                                    setDestPerChainInputs((p) => ({ ...p, [inputKey]: { ...(p[inputKey] ?? { addr: "", decimals: "" }), mode: e.target.value as "same" | "custom" } }))
                                  }
                                >
                                  <option value="same">Use this token address</option>
                                  <option value="custom">Custom address</option>
                                </Select>
                              </div>
                              <div className="grid gap-1.5">
                                <Label>Decimals</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={input.decimals}
                                  onChange={(e) => setDestPerChainInputs((p) => ({ ...p, [inputKey]: { ...(p[inputKey] ?? { mode: "same", addr: "" }), decimals: e.target.value } }))}
                                  placeholder="18"
                                />
                              </div>
                              <div className="grid gap-1.5">
                                <Label>Dest Address</Label>
                                <Input
                                  placeholder={input.mode === "same" ? (t as string) : "0x..."}
                                  value={input.mode === "same" ? (t as string) : input.addr}
                                  disabled={input.mode === "same"}
                                  onChange={(e) => setDestPerChainInputs((p) => ({ ...p, [inputKey]: { ...(p[inputKey] ?? { mode: "same", decimals: "" }), addr: e.target.value } }))}
                                />
                              </div>
                              <div className="flex items-end">
                                <Button onClick={() => addTokenDestForChain(t as Address, c.id)} disabled={addBusy}>
                                  {addBusy ? "Registering..." : "Register"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {/* Unknown registered chains not in current environment list */}
                  {(() => {
                    const knownKeys = new Set(ordered.map((c) => evmChainIdToKey(c.id).toLowerCase()));
                    const unknown = (dests as readonly Hex[]).filter((dk) => !knownKeys.has((dk as string).toLowerCase()));
                    if (unknown.length === 0) return null;
                    return (
                      <div className="grid gap-2">
                        {unknown.map((dk) => {
                          const dkStr = (dk as string);
                          const rmKey = `${lower}-${dkStr.toLowerCase()}`;
                          const rmBusy = Boolean(tokenDestRemoveBusy[rmKey]);
                          return (
                            <div key={dkStr} className="flex items-center justify-between gap-2">
                              <div className="text-sm font-mono break-all">{dkStr}</div>
                              <button
                                type="button"
                                aria-label="Unregister destination"
                                title="Unregister"
                                className="inline-flex items-center text-xs hover:text-red-600"
                                onClick={() => removeTokenDestInline(t as Address, dk as Hex)}
                                disabled={rmBusy}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}


