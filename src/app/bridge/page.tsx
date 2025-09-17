"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { useSwitchChain } from "wagmi";
import type { Address, Hex, Abi, AbiFunction } from "viem";
import { getAbiItem, getFunctionSelector, parseUnits, maxUint256, createPublicClient, http } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { ABI } from "@/lib/abi";
import {
  BRIDGE_ROUTER_ADDRESS,
  CHAIN_REGISTRY_ADDRESS,
  TOKEN_REGISTRY_ADDRESS,
  getAccessManagerAddress,
  CL8Y_BRIDGE_ADDRESS,
  MINT_BURN_ADDRESS,
  LOCK_UNLOCK_ADDRESS,
} from "@/lib/contracts";
import { getAddressExplorerUrl, filterChainsByEnv, evmChainIdToKey, SUPPORTED_CHAINS, makeTransportsFromConfig, getFriendlyNameForChainKey } from "@/lib/chains";
// Local import of IERC20 ABI
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import IERC20Artifact from "../../../artifacts/out/IERC20.sol/IERC20.json";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import IERC20ErrorsArtifact from "../../../artifacts/out/draft-IERC6093.sol/IERC20Errors.json";

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
  destAccount: Hex;
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const DEBUG_BRIDGE = true;
  const router = useMemo(() => BRIDGE_ROUTER_ADDRESS[chainId] as Address | undefined, [chainId]);
  const bridge = useMemo(() => CL8Y_BRIDGE_ADDRESS[chainId] as Address | undefined, [chainId]);
  const chainRegistryAddress = CHAIN_REGISTRY_ADDRESS[chainId] as Address | undefined;
  const tokenRegistryAddress = TOKEN_REGISTRY_ADDRESS[chainId] as Address | undefined;
  const accessManager = getAccessManagerAddress(chainId);

  const ERC20_ABI = (IERC20Artifact as unknown as { abi: Abi }).abi;
  // Use a merged ABI for router calls so nested bridge errors decode correctly
  const ROUTER_CALL_ABI = useMemo(() => {
    try {
      const r = ABI.BridgeRouter as unknown as Abi;
      const b = ABI.CL8YBridge as unknown as Abi;
      const e = (IERC20ErrorsArtifact as unknown as { abi: Abi }).abi;
      return ([...r, ...b, ...e] as unknown) as Abi;
    } catch {
      return (ABI.BridgeRouter as unknown) as Abi;
    }
  }, []);

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

  // On-chain token metadata for registered tokens (fallback if not in tokenlist)
  const tokenMetaOnchainQueries = useQueries({
    queries: (tokensQuery.data ?? []).map((t) => ({
      queryKey: ["bridge-token-meta", chainId, t],
      enabled: Boolean(publicClient && t),
      staleTime: 60_000,
      queryFn: async (): Promise<{ name?: string; symbol?: string; logoURI?: string; decimals?: number } | undefined> => {
        if (!publicClient) return undefined;
        try {
          const [name, symbol, logo, decimals] = await Promise.all([
            publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "name", args: [] }) as Promise<string>,
            publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "symbol", args: [] }) as Promise<string>,
            publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "logoLink", args: [] }) as Promise<string>,
            publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "decimals", args: [] }) as Promise<number>,
          ]);
          return { name, symbol, logoURI: logo, decimals };
        } catch {
          try {
            const [name, symbol, decimals] = await Promise.all([
              publicClient.readContract({ abi: ERC20_ABI, address: t as Address, functionName: "name", args: [] }) as Promise<string>,
              publicClient.readContract({ abi: ERC20_ABI, address: t as Address, functionName: "symbol", args: [] }) as Promise<string>,
              publicClient.readContract({ abi: ERC20_ABI, address: t as Address, functionName: "decimals", args: [] }) as Promise<number>,
            ]);
            return { name, symbol, decimals };
          } catch {
            return undefined;
          }
        }
      },
    })),
  });

  const chainMetaByAddr = useMemo(() => {
    const map: Record<string, { name?: string; symbol?: string; logoURI?: string; decimals?: number }> = {};
    (tokensQuery.data ?? []).forEach((t, idx) => {
      const addr = (t as string).toLowerCase();
      const d = tokenMetaOnchainQueries[idx]?.data;
      if (d) map[addr] = d;
    });
    return map;
  }, [tokensQuery.data, tokenMetaOnchainQueries]);

  // Form state
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [selectedChainKey, setSelectedChainKey] = useState<string>("");
  const [destAccount, setDestAccount] = useState<string>("");
  const [amountStr, setAmountStr] = useState<string>("");
  const [busyApprove, setBusyApprove] = useState(false);
  const [busyDeposit, setBusyDeposit] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [withdrawViewChainId, setWithdrawViewChainId] = useState<number>(chainId);
  const [depositViewChainId, setDepositViewChainId] = useState<number>(chainId);
  useEffect(() => { setWithdrawViewChainId(chainId); setDepositViewChainId(chainId); }, [chainId]);

  const tokenMetaByAddr = useMemo(() => {
    const map: Record<string, TokenListItem> = {};
    for (const t of (tokenlistQuery.data?.tokens ?? [])) {
      if (t.chainId === chainId) map[(t.address as string).toLowerCase()] = t;
    }
    return map;
  }, [tokenlistQuery.data, chainId]);

  const selectedMeta = useMemo(() => {
    const lower = (selectedToken || "").toLowerCase();
    return tokenMetaByAddr[lower] || chainMetaByAddr[lower];
  }, [tokenMetaByAddr, chainMetaByAddr, selectedToken]);

  // Discover bridge type for selected token (0 = MintBurn, 1 = LockUnlock)
  const bridgeTypeQuery = useQuery({
    queryKey: ["bridge-type", chainId, tokenRegistryAddress, selectedToken],
    enabled: Boolean(publicClient && tokenRegistryAddress && selectedToken),
    staleTime: 30_000,
    queryFn: async (): Promise<number | undefined> => {
      if (!publicClient || !tokenRegistryAddress || !selectedToken) return undefined;
      try {
        const v = (await publicClient.readContract({
          abi: ABI.TokenRegistry,
          address: tokenRegistryAddress,
          functionName: "getTokenBridgeType" as const,
          args: [selectedToken as Address],
        })) as bigint;
        return Number(v);
      } catch {
        return undefined;
      }
    },
  });

  const spender = useMemo(() => {
    const t = bridgeTypeQuery.data;
    if (t === undefined || t === null) return undefined;
    if (t === 0) return MINT_BURN_ADDRESS[chainId] as Address | undefined;
    if (t === 1) return LOCK_UNLOCK_ADDRESS[chainId] as Address | undefined;
    return undefined;
  }, [bridgeTypeQuery.data, chainId]);

  const spenderLabel = useMemo(() => {
    const t = bridgeTypeQuery.data;
    if (t === 0) return "MintBurn";
    if (t === 1) return "LockUnlock";
    return undefined;
  }, [bridgeTypeQuery.data]);

  // Default destination account to connected wallet (editable)
  useEffect(() => {
    if (address && !destAccount) setDestAccount(address);
  }, [address]);

  // Allowance query
  const allowanceQuery = useQuery({
    queryKey: ["allowance", chainId, address, spender, selectedToken],
    enabled: Boolean(publicClient && address && spender && selectedToken),
    staleTime: 15_000,
    queryFn: async (): Promise<bigint> => {
      if (!publicClient || !address || !spender || !selectedToken) return 0n;
      const v = (await publicClient.readContract({
        abi: ERC20_ABI,
        address: selectedToken as Address,
        functionName: "allowance",
        args: [address as Address, spender as Address],
      })) as bigint;
      return v ?? 0n;
    },
  });


  function toBytes32FromAddress(addr: string): Hex | undefined {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return undefined;
    const hex = addr.slice(2);
    return ("0x" + hex.padStart(64, "0")) as Hex;
  }

  // Safe logo helper (borrowed style from Tokens page)
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

  // === Helpers: chainKey -> chainId, bytes32 -> address ===
  function chainIdFromKey(key?: Hex): number | undefined {
    if (!key) return undefined;
    const lower = (key as string).toLowerCase();
    for (const c of SUPPORTED_CHAINS) {
      if (evmChainIdToKey(c.id).toLowerCase() === lower) return c.id;
    }
    return undefined;
  }

  function tryBytes32ToAddress(b?: Hex): Address | undefined {
    const s = String(b ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(s)) return undefined;
    const hex = s.slice(2);
    const last40 = hex.slice(24);
    const out = ("0x" + last40) as Address;
    return /^0x[0-9a-fA-F]{40}$/.test(out) ? out : undefined;
  }

  // Cross-chain public clients (browser-safe HTTP transports from env)
  const xchainTransports = useMemo(() => makeTransportsFromConfig(), []);
  const xchainClients = useMemo(() => {
    const map: Record<number, ReturnType<typeof createPublicClient>> = {};
    for (const c of SUPPORTED_CHAINS) {
      map[c.id] = createPublicClient({ chain: c, transport: xchainTransports[c.id] ?? http() });
    }
    return map;
  }, [xchainTransports]);

  async function fetchAllHashes(fn: "getDepositHashes" | "getWithdrawHashes"): Promise<Hex[]> {
    if (!publicClient || !bridge) return [];
    const hashes: Hex[] = [];
    for (let index = 0n; index < MAX_ITEMS; index += PAGE_SIZE) {
      try {
        const batch = (await publicClient.readContract({
          abi: ABI.CL8YBridge,
          address: bridge,
          functionName: fn,
          args: [index, PAGE_SIZE],
        })) as readonly Hex[];
        if (DEBUG_BRIDGE) console.debug("fetchAllHashes", { chainId, bridge, fn, index: index.toString(), batchCount: batch.length });
        if (!batch.length) break;
        hashes.push(...(batch as Hex[]));
        if (batch.length < Number(PAGE_SIZE)) break;
      } catch (e) {
        if (DEBUG_BRIDGE) console.warn("fetchAllHashes error", { chainId, bridge, fn, error: e });
        break;
      }
    }
    return hashes;
  }

  // Deposits view (selectable chain)
  const depositViewBridgeAddr = useMemo(() => CL8Y_BRIDGE_ADDRESS[depositViewChainId] as Address | undefined, [depositViewChainId]);
  const depositHashesQuery = useQuery({
    queryKey: ["bridge-view", depositViewChainId, depositViewBridgeAddr, "deposit-hashes"],
    queryFn: async () => {
      const r = await fetchAllHashesOn(depositViewChainId, depositViewBridgeAddr, "getDepositHashes");
      if (DEBUG_BRIDGE) console.debug("depositView.depositHashes", { chainId: depositViewChainId, bridge: depositViewBridgeAddr, count: r.length });
      return r;
    },
    enabled: Boolean(depositViewChainId && depositViewBridgeAddr),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const withdrawHashesQuery = useQuery({
    queryKey: ["bridge", chainId, bridge, "withdraw-hashes"],
    queryFn: async () => {
      const r = await fetchAllHashes("getWithdrawHashes");
      if (DEBUG_BRIDGE) console.debug("local.withdrawHashes", { chainId, bridge, count: r.length });
      return r;
    },
    enabled: Boolean(publicClient && bridge),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const depositsQuery = useQuery({
    queryKey: ["bridge-view", depositViewChainId, depositViewBridgeAddr, "deposits", depositHashesQuery.data?.length],
    queryFn: async (): Promise<Array<{ hash: Hex; item: Deposit }>> => {
      const cId = depositViewChainId;
      const bAddr = depositViewBridgeAddr as Address;
      const client = xchainClients[cId];
      if (!client) return [];
      const hashes = (depositHashesQuery.data ?? []) as readonly Hex[];
      if (!hashes.length) return [];
      const contracts = hashes.map((h) => ({
        abi: ABI.CL8YBridge as Abi,
        address: bAddr as Address,
        functionName: "getDepositFromHash" as const,
        args: [h] as const,
      }));
      const res = await client.multicall({ contracts });
      const items: Array<{ hash: Hex; item: Deposit }> = [];
      res.forEach((r, i) => {
        if (r.status === "success") {
          const tup = r.result as unknown as Deposit;
          items.push({ hash: hashes[i] as Hex, item: tup });
        }
      });
      if (DEBUG_BRIDGE) console.debug("depositView.deposits", { chainId: depositViewChainId, bridge: depositViewBridgeAddr, count: items.length });
      return items;
    },
    enabled: Boolean(depositViewChainId && depositViewBridgeAddr && (depositHashesQuery.data ?? []).length),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Build unique destination token keys from deposits for metadata lookups on destination chains
  const uniqueDestTokens = useMemo(() => {
    const items = depositsQuery.data ?? [];
    const set = new Set<string>();
    const entries: Array<{ key: string; chainId: number; address: Address }> = [];
    for (const { item } of items) {
      const cid = chainIdFromKey(item.destChainKey);
      const addr = tryBytes32ToAddress(item.destTokenAddress);
      if (!cid || !addr) continue;
      const k = `${cid}:${(addr as string).toLowerCase()}`;
      if (set.has(k)) continue;
      set.add(k);
      entries.push({ key: k, chainId: cid, address: addr });
    }
    return entries;
  }, [depositsQuery.data]);

  // Cross-chain token metadata queries (name/symbol/logo/decimals)
  const destTokenMetaQueries = useQueries({
    queries: uniqueDestTokens.map((t) => ({
      queryKey: ["dest-token-meta", t.chainId, t.address],
      enabled: Boolean(xchainClients[t.chainId] && t.address),
      staleTime: 60_000,
      queryFn: async (): Promise<{ name?: string; symbol?: string; logoURI?: string; decimals?: number } | undefined> => {
        const client = xchainClients[t.chainId];
        if (!client) return undefined;
        try {
          const [name, symbol, logo, decimals] = await Promise.all([
            client.readContract({ abi: ABI.TokenCl8yBridged as unknown as Abi, address: t.address, functionName: "name", args: [] }) as Promise<string>,
            client.readContract({ abi: ABI.TokenCl8yBridged as unknown as Abi, address: t.address, functionName: "symbol", args: [] }) as Promise<string>,
            client.readContract({ abi: ABI.TokenCl8yBridged as unknown as Abi, address: t.address, functionName: "logoLink", args: [] }) as Promise<string>,
            client.readContract({ abi: ABI.TokenCl8yBridged as unknown as Abi, address: t.address, functionName: "decimals", args: [] }) as Promise<number>,
          ]);
          return { name, symbol, logoURI: logo, decimals };
        } catch {
          try {
            const [name, symbol, decimals] = await Promise.all([
              xchainClients[t.chainId].readContract({ abi: ERC20_ABI, address: t.address, functionName: "name", args: [] }) as Promise<string>,
              xchainClients[t.chainId].readContract({ abi: ERC20_ABI, address: t.address, functionName: "symbol", args: [] }) as Promise<string>,
              xchainClients[t.chainId].readContract({ abi: ERC20_ABI, address: t.address, functionName: "decimals", args: [] }) as Promise<number>,
            ]);
            return { name, symbol, decimals };
          } catch {
            return undefined;
          }
        }
      },
    })),
  });

  const destTokenMetaMap = useMemo(() => {
    const map: Record<string, { name?: string; symbol?: string; logoURI?: string; decimals?: number }> = {};
    uniqueDestTokens.forEach((t, idx) => {
      const data = destTokenMetaQueries[idx]?.data;
      if (data) map[t.key] = data;
    });
    return map;
  }, [uniqueDestTokens, destTokenMetaQueries]);

  // Group deposits by destination EVM chain for cross-chain approval lookups
  const depositsByDestChain = useMemo(() => {
    const grouped: Record<number, Array<{ hash: Hex; item: Deposit }>> = {};
    for (const it of (depositsQuery.data ?? [])) {
      const cid = chainIdFromKey(it.item.destChainKey);
      if (!cid) continue;
      if (!grouped[cid]) grouped[cid] = [];
      grouped[cid]!.push(it);
    }
    return grouped;
  }, [depositsQuery.data]);

  const destChainIds = useMemo(() => Object.keys(depositsByDestChain).map((n) => Number(n)), [depositsByDestChain]);

  // Cross-chain approval status for each deposit hash on destination chain
  const xchainApprovalQueries = useQueries({
    queries: destChainIds.map((cid) => ({
      queryKey: ["xchain", cid, "approvals", (depositsByDestChain[cid] ?? []).length],
      enabled: Boolean(xchainClients[cid] && CL8Y_BRIDGE_ADDRESS[cid] && (depositsByDestChain[cid] ?? []).length),
      staleTime: 15_000,
      refetchInterval: 15_000,
      queryFn: async (): Promise<Record<string, WithdrawApproval>> => {
        const client = xchainClients[cid];
        const bridgeAddr = CL8Y_BRIDGE_ADDRESS[cid] as Address | undefined;
        if (!client || !bridgeAddr) return {};
        const items = depositsByDestChain[cid] ?? [];
        if (!items.length) return {};
        const contracts = items.map((it) => ({
          abi: ABI.CL8YBridge as Abi,
          address: bridgeAddr,
          functionName: "getWithdrawApproval" as const,
          args: [it.hash] as const,
        }));
        const res = await client.multicall({ contracts });
        const out: Record<string, WithdrawApproval> = {};
        res.forEach((r, i) => {
          if (r.status === "success") out[(items[i]!.hash as string).toLowerCase()] = r.result as unknown as WithdrawApproval;
        });
        if (DEBUG_BRIDGE) console.debug("xchain.approvals", { cid, count: Object.keys(out).length });
        return out;
      },
    }))
  });

  // Cross-chain withdraw hash existence per destination chain
  const xchainWithdrawHashesQueries = useQueries({
    queries: destChainIds.map((cid) => ({
      queryKey: ["xchain", cid, "withdraw-hashes"],
      enabled: Boolean(xchainClients[cid] && CL8Y_BRIDGE_ADDRESS[cid]),
      staleTime: 15_000,
      refetchInterval: 15_000,
      queryFn: async (): Promise<readonly Hex[]> => {
        const bridgeAddr = CL8Y_BRIDGE_ADDRESS[cid] as Address | undefined;
        if (!bridgeAddr) return [] as const;
        const r = (await fetchAllHashesOn(cid, bridgeAddr, "getWithdrawHashes")) as readonly Hex[];
        if (DEBUG_BRIDGE) console.debug("xchain.withdrawHashes", { cid, bridge: bridgeAddr, count: r.length });
        return r;
      },
    })),
  });

  const withdrawHashExistsByDest = useMemo(() => {
    const map: Record<number, Set<string>> = {};
    destChainIds.forEach((cid, idx) => {
      const arr = (xchainWithdrawHashesQueries[idx]?.data ?? []) as readonly Hex[];
      const set = new Set<string>();
      for (const h of arr) set.add((h as string).toLowerCase());
      map[cid] = set;
    });
    return map;
  }, [destChainIds, xchainWithdrawHashesQueries]);

  const approvalByDestAndHash = useMemo(() => {
    const map: Record<string, WithdrawApproval | undefined> = {};
    destChainIds.forEach((cid, idx) => {
      const m = xchainApprovalQueries[idx]?.data ?? {};
      const items = depositsByDestChain[cid] ?? [];
      items.forEach((it) => {
        const k = `${cid}:${(it.hash as string).toLowerCase()}`;
        map[k] = m[(it.hash as string).toLowerCase()];
      });
    });
    return map;
  }, [destChainIds, xchainApprovalQueries, depositsByDestChain]);

  // Prepare approveWithdraw selector for role gating (must be defined before queries below)
  const approveWithdrawAbiItem = useMemo(() => getAbiItem({ abi: ABI.CL8YBridge as Abi, name: "approveWithdraw" }), []);
  const approveWithdrawAbiFn = useMemo(() => {
    const item = approveWithdrawAbiItem as unknown as { type?: string } | undefined;
    return item && item.type === "function" ? (approveWithdrawAbiItem as unknown as AbiFunction) : undefined;
  }, [approveWithdrawAbiItem]);
  const approveWithdrawSelector = useMemo(() => (approveWithdrawAbiFn ? (getFunctionSelector(approveWithdrawAbiFn) as Hex) : ("0x00000000" as Hex)), [approveWithdrawAbiFn]);

  // Destination chain role gating: can the connected account approveWithdraw on CL8YBridge?
  const xchainApproveRoleQueries = useQueries({
    queries: destChainIds.map((cid) => ({
      queryKey: ["xchain", cid, "can-approve", address],
      enabled: Boolean(address && xchainClients[cid] && CL8Y_BRIDGE_ADDRESS[cid] && approveWithdrawSelector !== ("0x00000000" as Hex)),
      staleTime: 30_000,
      refetchInterval: 30_000,
      queryFn: async (): Promise<{ immediate: boolean; delay: bigint }> => {
        const client = xchainClients[cid];
        const access = getAccessManagerAddress(cid);
        const target = CL8Y_BRIDGE_ADDRESS[cid] as Address;
        if (!address) return { immediate: false, delay: 0n };
        const res = (await client.readContract({
          abi: ABI.AccessManager,
          address: access,
          functionName: "canCall" as const,
          args: [address as Address, target, approveWithdrawSelector as Hex],
        })) as [boolean, bigint];
        return { immediate: Boolean(res?.[0]), delay: (res?.[1] ?? 0n) as bigint };
      },
    }))
  });

  const canApproveOnDestChain: Record<number, boolean> = useMemo(() => {
    const map: Record<number, boolean> = {};
    destChainIds.forEach((cid, idx) => {
      map[cid] = Boolean(xchainApproveRoleQueries[idx]?.data?.immediate);
    });
    return map;
  }, [destChainIds, xchainApproveRoleQueries]);

  const [busyApproveHash, setBusyApproveHash] = useState<string | undefined>(undefined);

  // Tiny blocky icon for visual hash identity
  function BlockyIcon({ seed, size = 14 }: { seed: string; size?: number }) {
    try {
      const hex = (seed || "").replace(/^0x/, "");
      const bytes: number[] = [];
      for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
      const hue = (bytes[0] ?? 0) % 360;
      const sat = 60 + ((bytes[1] ?? 0) % 30);
      const light = 45 + ((bytes[2] ?? 0) % 20);
      const color = `hsl(${hue} ${sat}% ${light}%)`;
      const cells: boolean[] = [];
      for (let i = 0; i < 15; i++) {
        const b = bytes[3 + i] ?? i * 17;
        cells.push((b & 0x8) !== 0);
      }
      const grid: boolean[] = [];
      for (let r = 0; r < 5; r++) {
        const row = cells.slice(r * 3, r * 3 + 3);
        grid.push(row[0]!, row[1]!, row[2]!, row[1]!, row[0]!);
      }
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", width: size, height: size }}>
          {grid.map((on, i) => (
            <div key={i} style={{ backgroundColor: on ? color : "transparent" }} />
          ))}
        </div>
      );
    } catch {
      return <div style={{ width: size, height: size }} />;
    }
  }


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
  // View-specific withdraw hashes and details (selected chain)
  const viewBridgeAddr = useMemo(() => CL8Y_BRIDGE_ADDRESS[withdrawViewChainId] as Address | undefined, [withdrawViewChainId]);
  async function fetchAllHashesOn(cId: number | undefined, bridgeAddr: Address | undefined, fn: "getDepositHashes" | "getWithdrawHashes"): Promise<Hex[]> {
    if (!cId || !bridgeAddr) return [];
    const client = xchainClients[cId];
    if (!client) return [];
    const hashes: Hex[] = [];
    for (let index = 0n; index < MAX_ITEMS; index += PAGE_SIZE) {
      try {
        const batch = (await client.readContract({
          abi: ABI.CL8YBridge,
          address: bridgeAddr,
          functionName: fn,
          args: [index, PAGE_SIZE],
        })) as readonly Hex[];
        if (DEBUG_BRIDGE) console.debug("fetchAllHashesOn", { cId, bridgeAddr, fn, index: index.toString(), batchCount: batch.length });
        if (!batch.length) break;
        hashes.push(...(batch as Hex[]));
        if (batch.length < Number(PAGE_SIZE)) break;
      } catch {
        if (DEBUG_BRIDGE) console.warn("fetchAllHashesOn error", { cId, bridgeAddr, fn });
        break;
      }
    }
    return hashes;
  }
  const withdrawViewHashesQuery = useQuery({
    queryKey: ["bridge-view", withdrawViewChainId, viewBridgeAddr, "withdraw-hashes"],
    enabled: Boolean(withdrawViewChainId && viewBridgeAddr),
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: () => fetchAllHashesOn(withdrawViewChainId, viewBridgeAddr, "getWithdrawHashes"),
  });

  // Derive relevant hashes from deposits on other chains targeting the selected withdraw chain
  const withdrawViewRelevantDepositHashesQuery = useQuery({
    queryKey: ["bridge-view", withdrawViewChainId, "from-deposits-hashes"],
    enabled: Boolean(withdrawViewChainId),
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Hex[]> => {
      const destCid = withdrawViewChainId;
      const peers = filterChainsByEnv(destCid).map((c) => c.id).filter((id) => id !== destCid);
      const out: Hex[] = [];
      const seen = new Set<string>();
      for (const srcId of peers) {
        const client = xchainClients[srcId];
        const srcBridge = CL8Y_BRIDGE_ADDRESS[srcId] as Address | undefined;
        if (!client || !srcBridge) continue;
        const hashes = await fetchAllHashesOn(srcId, srcBridge, "getDepositHashes");
        if (!hashes.length) continue;
        const contracts = hashes.map((h) => ({
          abi: ABI.CL8YBridge as Abi,
          address: srcBridge,
          functionName: "getDepositFromHash" as const,
          args: [h] as const,
        }));
        const res = await client.multicall({ contracts });
        res.forEach((r, i) => {
          if (r.status === "success") {
            const dep = r.result as unknown as Deposit;
            const toCid = chainIdFromKey(dep.destChainKey);
            if (toCid === destCid) {
              const h = hashes[i] as Hex;
              const key = (h as string).toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);
                out.push(h);
              }
            }
          }
        });
      }
      if (DEBUG_BRIDGE) console.debug("view.fromDepositsHashes", { chainId: destCid, count: out.length });
      return out;
    },
  });
  const withdrawsAndApprovalsViewQuery = useQuery({
    queryKey: ["bridge-view", withdrawViewChainId, viewBridgeAddr, "withdraws", withdrawViewHashesQuery.data?.length, withdrawViewRelevantDepositHashesQuery.data?.length],
    enabled: Boolean(
      withdrawViewChainId &&
      viewBridgeAddr &&
      (((withdrawViewHashesQuery.data ?? []).length) || ((withdrawViewRelevantDepositHashesQuery.data ?? []).length))
    ),
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Array<{ hash: Hex; withdraw?: Withdraw; approval?: WithdrawApproval }>> => {
      const cId = withdrawViewChainId;
      const bAddr = viewBridgeAddr as Address;
      const client = xchainClients[cId];
      if (!client) return [];
      const base = (withdrawViewHashesQuery.data ?? []) as readonly Hex[];
      const fromDeps = (withdrawViewRelevantDepositHashesQuery.data ?? []) as readonly Hex[];
      const set = new Set<string>();
      const combined: Hex[] = [];
      for (const h of base) { const k = (h as string).toLowerCase(); if (!set.has(k)) { set.add(k); combined.push(h as Hex); } }
      for (const h of fromDeps) { const k = (h as string).toLowerCase(); if (!set.has(k)) { set.add(k); combined.push(h as Hex); } }
      const hashes = combined as readonly Hex[];
      if (!hashes.length) return [];
      const contracts: Array<{ abi: Abi; address: Address; functionName: string; args: readonly unknown[] }> = [];
      for (const h of hashes) contracts.push({ abi: ABI.CL8YBridge as Abi, address: bAddr, functionName: "getWithdrawFromHash", args: [h] });
      for (const h of hashes) contracts.push({ abi: ABI.CL8YBridge as Abi, address: bAddr, functionName: "getWithdrawApproval", args: [h] });
      const res = await client.multicall({ contracts });
      const out: Array<{ hash: Hex; withdraw?: Withdraw; approval?: WithdrawApproval }>= [];
      for (let i = 0; i < hashes.length; i++) {
        const withdrawRes = res[i];
        const approvalRes = res[i + hashes.length];
        const entry: { hash: Hex; withdraw?: Withdraw; approval?: WithdrawApproval } = { hash: hashes[i] as Hex };
        const hasWithdraw = withdrawRes?.status === "success";
        const approvalVal = approvalRes?.status === "success" ? (approvalRes.result as unknown as WithdrawApproval) : undefined;
        if (hasWithdraw) entry.withdraw = withdrawRes.result as unknown as Withdraw;
        if (approvalVal) entry.approval = approvalVal;
        const include = hasWithdraw || Boolean(approvalVal?.isApproved);
        if (include) out.push(entry);
      }
      if (DEBUG_BRIDGE) console.debug("view.withdrawsAndApprovals", { chainId: cId, bridge: bAddr, count: out.length });
      return out;
    },
  });
  const nowViewQuery = useQuery({
    queryKey: ["block-now-view", withdrawViewChainId],
    enabled: Boolean(withdrawViewChainId && xchainClients[withdrawViewChainId]),
    refetchInterval: 10_000,
    queryFn: async (): Promise<bigint> => {
      const b = await xchainClients[withdrawViewChainId]!.getBlock({});
      return (b.timestamp ?? 0n) as bigint;
    },
  });

  // View-chain token metadata for withdraw tokens shown in the view section
  const uniqueViewWithdrawTokens = useMemo(() => {
    const set = new Set<string>();
    const out: Address[] = [];
    for (const entry of (withdrawsAndApprovalsViewQuery.data ?? [])) {
      const token = entry.withdraw?.token as Address | undefined;
      if (!token) continue;
      const lower = (token as string).toLowerCase();
      if (set.has(lower)) continue;
      set.add(lower);
      out.push(token);
    }
    return out;
  }, [withdrawsAndApprovalsViewQuery.data]);

  const viewWithdrawTokenMetaQueries = useQueries({
    queries: uniqueViewWithdrawTokens.map((t) => ({
      queryKey: ["withdraw-token-meta", withdrawViewChainId, t],
      enabled: Boolean(xchainClients[withdrawViewChainId] && t),
      staleTime: 60_000,
      queryFn: async (): Promise<{ name?: string; symbol?: string; logoURI?: string; decimals?: number } | undefined> => {
        const client = xchainClients[withdrawViewChainId];
        if (!client) return undefined;
        try {
          const [name, symbol, logo, decimals] = await Promise.all([
            client.readContract({ abi: ABI.TokenCl8yBridged as unknown as Abi, address: t as Address, functionName: "name", args: [] }) as Promise<string>,
            client.readContract({ abi: ABI.TokenCl8yBridged as unknown as Abi, address: t as Address, functionName: "symbol", args: [] }) as Promise<string>,
            client.readContract({ abi: ABI.TokenCl8yBridged as unknown as Abi, address: t as Address, functionName: "logoLink", args: [] }) as Promise<string>,
            client.readContract({ abi: ABI.TokenCl8yBridged as unknown as Abi, address: t as Address, functionName: "decimals", args: [] }) as Promise<number>,
          ]);
          return { name, symbol, logoURI: logo, decimals };
        } catch {
          try {
            const [name, symbol, decimals] = await Promise.all([
              xchainClients[withdrawViewChainId].readContract({ abi: ERC20_ABI, address: t as Address, functionName: "name", args: [] }) as Promise<string>,
              xchainClients[withdrawViewChainId].readContract({ abi: ERC20_ABI, address: t as Address, functionName: "symbol", args: [] }) as Promise<string>,
              xchainClients[withdrawViewChainId].readContract({ abi: ERC20_ABI, address: t as Address, functionName: "decimals", args: [] }) as Promise<number>,
            ]);
            return { name, symbol, decimals };
          } catch {
            return undefined;
          }
        }
      },
    }))
  });

  const viewWithdrawTokenMetaMap = useMemo(() => {
    const map: Record<string, { name?: string; symbol?: string; logoURI?: string; decimals?: number }> = {};
    uniqueViewWithdrawTokens.forEach((t, idx) => {
      const data = viewWithdrawTokenMetaQueries[idx]?.data;
      if (data) map[(t as string).toLowerCase()] = data;
    });
    return map;
  }, [uniqueViewWithdrawTokens, viewWithdrawTokenMetaQueries]);

  // Token metadata for withdraw tokens on the current chain (to match deposit formatting)
  const uniqueWithdrawTokens = useMemo(() => {
    const set = new Set<string>();
    const out: Address[] = [];
    for (const entry of (withdrawsAndApprovalsQuery.data ?? [])) {
      const token = entry.withdraw?.token as Address | undefined;
      if (!token) continue;
      const lower = (token as string).toLowerCase();
      if (set.has(lower)) continue;
      set.add(lower);
      out.push(token);
    }
    return out;
  }, [withdrawsAndApprovalsQuery.data]);

  const withdrawTokenMetaQueries = useQueries({
    queries: uniqueWithdrawTokens.map((t) => ({
      queryKey: ["withdraw-token-meta", chainId, t],
      enabled: Boolean(publicClient && t),
      staleTime: 60_000,
      queryFn: async (): Promise<{ name?: string; symbol?: string; logoURI?: string; decimals?: number } | undefined> => {
        if (!publicClient) return undefined;
        try {
          const [name, symbol, logo, decimals] = await Promise.all([
            publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "name", args: [] }) as Promise<string>,
            publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "symbol", args: [] }) as Promise<string>,
            publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "logoLink", args: [] }) as Promise<string>,
            publicClient.readContract({ abi: ABI.TokenCl8yBridged, address: t as Address, functionName: "decimals", args: [] }) as Promise<number>,
          ]);
          return { name, symbol, logoURI: logo, decimals };
        } catch {
          try {
            const [name, symbol, decimals] = await Promise.all([
              publicClient.readContract({ abi: ERC20_ABI, address: t as Address, functionName: "name", args: [] }) as Promise<string>,
              publicClient.readContract({ abi: ERC20_ABI, address: t as Address, functionName: "symbol", args: [] }) as Promise<string>,
              publicClient.readContract({ abi: ERC20_ABI, address: t as Address, functionName: "decimals", args: [] }) as Promise<number>,
            ]);
            return { name, symbol, decimals };
          } catch {
            return undefined;
          }
        }
      },
    }))
  });

  const withdrawTokenMetaMap = useMemo(() => {
    const map: Record<string, { name?: string; symbol?: string; logoURI?: string; decimals?: number }> = {};
    uniqueWithdrawTokens.forEach((t, idx) => {
      const data = withdrawTokenMetaQueries[idx]?.data;
      if (data) map[(t as string).toLowerCase()] = data;
    });
    return map;
  }, [uniqueWithdrawTokens, withdrawTokenMetaQueries]);

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
    if (!publicClient || !spender || !address || !selectedToken) return;
    setBusyApprove(true);
    setFormError(undefined);
    try {
      // simulate
      await publicClient.simulateContract({
        abi: ERC20_ABI,
        address: selectedToken as Address,
        functionName: "approve",
        args: [spender as Address, maxUint256],
        account: address,
      });
      const hash = await writeContractAsync({
        abi: ERC20_ABI,
        address: selectedToken as Address,
        functionName: "approve",
        args: [spender as Address, maxUint256],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await queryClient.invalidateQueries({ queryKey: ["allowance", chainId, address, spender, selectedToken] });
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
        abi: ROUTER_CALL_ABI,
        address: router as Address,
        functionName: "deposit" as const,
        args: [selectedToken as Address, amount, selectedChainKey as Hex, destAcc as Hex],
        account: address,
      });
      const hash = await writeContractAsync({
        abi: ROUTER_CALL_ABI,
        address: router as Address,
        functionName: "deposit" as const,
        args: [selectedToken as Address, amount, selectedChainKey as Hex, destAcc as Hex],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setAmountStr("");
      // Invalidate both router and bridge scoped queries to refresh hashes and items
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bridge", chainId, bridge, "deposit-hashes"] }),
        queryClient.invalidateQueries({ queryKey: ["bridge", chainId, bridge, "deposits"] }),
        queryClient.invalidateQueries({ queryKey: ["bridge", chainId, router] }),
      ]);
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
        abi: ROUTER_CALL_ABI,
        address: router as Address,
        functionName: "withdraw" as const,
        args: [w.srcChainKey, w.token, w.to, w.amount, w.nonce],
        account: address,
      });
      const hash = await writeContractAsync({
        abi: ROUTER_CALL_ABI,
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

  // Approve withdraw on destination chain for a given source deposit
  async function handleApproveWithdrawForDeposit(hash: Hex, item: Deposit) {
    try {
      const destCid = chainIdFromKey(item.destChainKey);
      const tokenAddr = tryBytes32ToAddress(item.destTokenAddress);
      const toAddr = tryBytes32ToAddress(item.destAccount);
      if (!address || !destCid || !tokenAddr || !toAddr) return;
      const operator = address as Address;
      const srcChainId = chainId; // capture source chain id before switching
      const bridgeAddr = CL8Y_BRIDGE_ADDRESS[destCid] as Address | undefined;
      if (!bridgeAddr) return;
      setBusyApproveHash((hash as string).toLowerCase());
      // Ensure we are on destination chain
      if (chainId !== destCid && switchChainAsync) {
        await switchChainAsync({ chainId: destCid });
      }
      // Build args
      const srcChainKey = evmChainIdToKey(srcChainId) as Hex;
      // Default fee params for now
      const fee = 0n;
      const feeRecipient = "0x0000000000000000000000000000000000000000" as Address;
      const deductFromAmount = false;
      const txHash = await writeContractAsync({
        abi: ABI.CL8YBridge as Abi,
        address: bridgeAddr,
        functionName: "approveWithdraw" as const,
        args: [
          srcChainKey,
          tokenAddr as Address,
          toAddr as Address,
          item.destAccount as Hex,
          item.amount as bigint,
          item.nonce as bigint,
          fee,
          feeRecipient,
          deductFromAmount,
        ],
        account: operator,
      });
      if (xchainClients[destCid]) {
        await xchainClients[destCid].waitForTransactionReceipt({ hash: txHash });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["xchain", destCid, "approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["bridge", destCid, CL8Y_BRIDGE_ADDRESS[destCid], "withdraw-hashes"] }),
        queryClient.invalidateQueries({ queryKey: ["bridge", destCid, CL8Y_BRIDGE_ADDRESS[destCid], "withdraws"] }),
        queryClient.invalidateQueries({ queryKey: ["bridge", chainId, bridge, "withdraw-hashes"] }),
        queryClient.invalidateQueries({ queryKey: ["bridge", chainId, bridge, "withdraws"] }),
      ]);
    } catch (e) {
      // noop
    } finally {
      setBusyApproveHash(undefined);
    }
  }

  function fmtBig(x?: bigint) {
    return typeof x === "bigint" ? x.toString() : String(x ?? "");
  }

  if (!mounted) return null;
  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 sm:py-6 grid gap-4 sm:gap-6">
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
                  {(tokensQuery.data ?? []).map((t, idx) => {
                    const lower = (t as string).toLowerCase();
                    const meta = tokenMetaByAddr[lower] || chainMetaByAddr[lower];
                    const label = meta && (meta.symbol || meta.name) ? `${meta.symbol ?? ""}${meta.symbol && meta.name ? " — " : ""}${meta.name ?? ""}` : (t as string);
                    return (
                      <option key={lower} value={t as string}>{label}</option>
                    );
                  })}
                </Select>
                {selectedToken && (
                  <div className="flex items-center gap-3 mt-1 min-w-0">
                    {selectedMeta?.logoURI ? (
                      <img
                        src={toSafeLogoSrc(selectedMeta.logoURI)}
                        alt={selectedMeta?.name || selectedMeta?.symbol || selectedToken}
                        referrerPolicy="no-referrer"
                        decoding="async"
                        loading="lazy"
                        className="h-8 w-8 rounded-full object-contain bg-black shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-black shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <div className="text-sm truncate">
                        {selectedMeta ? (
                          <>
                            {selectedMeta.name || "Unnamed"} {selectedMeta.symbol && <span className="text-muted-foreground">({selectedMeta.symbol})</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Unknown token</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground break-all">{selectedToken}</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label>Amount{selectedMeta ? ` (${selectedMeta.symbol})` : ""}</Label>
                <Input placeholder="0.0" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
                <div className="text-xs text-muted-foreground">Decimals: {selectedMeta?.decimals ?? "?"}</div>
              </div>
              <div className="grid gap-1.5">
                <Label>Destination Chain</Label>
                {(() => {
                  const keys = (chainKeysQuery.data ?? []) as readonly Hex[];
                  const envPeers = filterChainsByEnv(chainId).filter((c) => c.id !== chainId);
                  const regSet = new Set(keys.map((k) => (k as string).toLowerCase()));
                  const knownOpts = envPeers
                    .map((c) => ({ key: evmChainIdToKey(c.id) as string, label: `${c.label} (${c.id})` }))
                    .filter((o) => regSet.has(o.key.toLowerCase()));
                  const knownSet = new Set(knownOpts.map((o) => o.key.toLowerCase()));
                  const unknownKeys = keys.filter((k) => !knownSet.has((k as string).toLowerCase()));
                  return (
                    <Select value={selectedChainKey} onChange={(e) => setSelectedChainKey(e.target.value)}>
                      <option value="">Select chain…</option>
                      {knownOpts.map((o) => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                      {unknownKeys.length > 0 && (
                        <option value="" disabled>──────────</option>
                      )}
                      {unknownKeys.map((ck) => (
                        <option key={ck as string} value={ck as string}>{ck as string}</option>
                      ))}
                    </Select>
                  );
                })()}
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Destination Account (EVM address or bytes32)</Label>
                <Input placeholder="0x..." value={destAccount} onChange={(e) => setDestAccount(e.target.value)} />
              </div>
              <div className="flex items-end gap-2 md:col-span-4">
                {(() => {
                  try {
                    if (!selectedMeta) return null;
                    const amt = parseUnits((amountStr || "").trim(), selectedMeta.decimals);
                    const needs = typeof allowanceQuery.data === "bigint" ? allowanceQuery.data < amt : false;
                    return needs ? (
                      <Button onClick={handleApprove} disabled={!address || !selectedToken || !spender || busyApprove}>
                        {busyApprove ? "Approving…" : `Approve ${spenderLabel ?? "Spender"}`}
                      </Button>
                    ) : null;
                  } catch {
                    return null;
                  }
                })()}
                <Button onClick={handleDeposit} disabled={!address || !selectedToken || !selectedChainKey || busyDeposit}>
                  {busyDeposit ? "Depositing…" : "Deposit"}
                </Button>
                {/* allowance hidden per request */}
                {formError && <div className="text-xs text-red-600">{formError}</div>}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Deposits{typeof (depositHashesQuery.data?.length) === "number" ? ` (${depositHashesQuery.data?.length})` : ""}</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={String(depositViewChainId)} onChange={(e) => setDepositViewChainId(Number(e.target.value))}>
                {filterChainsByEnv(chainId).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["bridge-view", depositViewChainId, depositViewBridgeAddr, "deposit-hashes"] });
                  queryClient.invalidateQueries({ queryKey: ["bridge-view", depositViewChainId, depositViewBridgeAddr, "deposits"] });
                }}
              >
                Refresh
              </Button>
            </div>
          </div>
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
              {(depositsQuery.data ?? []).map(({ hash, item }) => {
                const destChainId = chainIdFromKey(item.destChainKey);
                const destAddr = tryBytes32ToAddress(item.destAccount);
                const destTokenAddr = tryBytes32ToAddress(item.destTokenAddress);
                const destChainLabel = destChainId ? (getFriendlyNameForChainKey(item.destChainKey as Hex) ?? `${destChainId}`) : undefined;
                const tokenKey = destChainId && destTokenAddr ? `${destChainId}:${(destTokenAddr as string).toLowerCase()}` : undefined;
                const meta = tokenKey ? destTokenMetaMap[tokenKey] : undefined;
                const amountStrLocal = (() => {
                  const d = meta?.decimals;
                  if (typeof d === "number" && d >= 0) {
                    try {
                      const whole = item.amount / (10n ** BigInt(d));
                      const frac = item.amount % (10n ** BigInt(d));
                      const fracStr = d > 0 ? String((10n ** BigInt(d) + frac)).slice(1).replace(/0+$/, "") : "";
                      return d > 0 ? `${whole.toString()}${fracStr ? "." + fracStr : ""}` : whole.toString();
                    } catch {
                      return fmtBig(item.amount);
                    }
                  }
                  return fmtBig(item.amount);
                })();
                return (
                  <div key={hash} className="border rounded p-2 grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <BlockyIcon seed={hash as string} />
                        <div className="text-xs text-muted-foreground truncate">{hash}</div>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {meta?.logoURI ? (
                          <img
                            src={toSafeLogoSrc(meta.logoURI)}
                            alt={meta?.name || meta?.symbol || (destTokenAddr ?? "")}
                            referrerPolicy="no-referrer"
                            decoding="async"
                            loading="lazy"
                            className="h-7 w-7 rounded-full object-contain bg-black shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-black shrink-0" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <div className="truncate">{meta?.name || "Unknown token"} {meta?.symbol && <span className="text-muted-foreground">({meta.symbol})</span>}</div>
                          <div className="text-xs text-muted-foreground break-all">{destTokenAddr ?? String(item.destTokenAddress)}</div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div>Amount: {amountStrLocal}</div>
                        <div className="text-xs text-muted-foreground">Nonce: {fmtBig(item.nonce)}</div>
                      </div>
                      <div className="min-w-0">
                        <div>Destination: {destChainLabel ?? String(item.destChainKey)}</div>
                        <div className="break-all">
                          Dest Address: {destChainId && destAddr ? (
                            <a className="underline" href={getAddressExplorerUrl(destChainId, destAddr)} target="_blank" rel="noopener noreferrer">{destAddr}</a>
                          ) : (
                            String(item.destAccount)
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 md:col-span-3">
                        {(() => {
                          const canShow = Boolean(destChainId && destTokenAddr && destAddr);
                          if (!canShow) return (
                            <div>
                              From: <a className="underline" href={getAddressExplorerUrl(chainId, item.from)} target="_blank" rel="noopener noreferrer">{item.from}</a>
                            </div>
                          );
                          const appr = approvalByDestAndHash[`${destChainId}:${(hash as string).toLowerCase()}`];
                          const approved = Boolean(
                            appr?.isApproved && withdrawHashExistsByDest[destChainId!]?.has((hash as string).toLowerCase())
                          );
                          const canApprove = Boolean(canApproveOnDestChain[destChainId!] && address);
                          const friendly = destChainLabel ?? getFriendlyNameForChainKey(item.destChainKey as Hex) ?? String(destChainId);
                          return (
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                From: <a className="underline" href={getAddressExplorerUrl(chainId, item.from)} target="_blank" rel="noopener noreferrer">{item.from}</a>
                              </div>
                              {approved ? (
                                <div className="text-xs text-muted-foreground">Approved on {friendly}</div>
                              ) : (
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  disabled={!canApprove || busyApproveHash === (hash as string).toLowerCase()}
                                  onClick={() => handleApproveWithdrawForDeposit(hash, item)}
                                  title={!canApprove ? `Not authorized to approve on ${friendly}` : undefined}
                                >
                                  {busyApproveHash === (hash as string).toLowerCase() ? `Approving…` : `Approve on ${friendly}`}
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Withdraw Approvals & Withdraws{typeof (withdrawViewHashesQuery.data?.length) === "number" ? ` (${withdrawViewHashesQuery.data?.length})` : ""}</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={String(withdrawViewChainId)} onChange={(e) => setWithdrawViewChainId(Number(e.target.value))}>
                {filterChainsByEnv(chainId).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
              <Button size="sm" variant="outline" onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["bridge-view", withdrawViewChainId, viewBridgeAddr, "withdraw-hashes"] });
                queryClient.invalidateQueries({ queryKey: ["bridge-view", withdrawViewChainId, viewBridgeAddr, "withdraws"] });
              }}>Refresh</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {!viewBridgeAddr ? (
            <div className="text-muted-foreground">No CL8YBridge for selected chain</div>
          ) : withdrawViewHashesQuery.isLoading ? (
            <div className="text-muted-foreground">Loading withdraw hashes…</div>
          ) : ((withdrawViewHashesQuery.data ?? []).length === 0) ? (
            <div className="text-muted-foreground">No withdraws</div>
          ) : withdrawsAndApprovalsViewQuery.isLoading || withdrawsAndApprovalsViewQuery.isFetching ? (
            <div className="text-muted-foreground">Loading withdraw details…</div>
          ) : (
            <div className="grid gap-2">
              {(withdrawsAndApprovalsViewQuery.data ?? []).map(({ hash, withdraw, approval }) => (
                <div key={hash} className="border rounded p-2 grid gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <BlockyIcon seed={hash as string} />
                    <div className="text-xs text-muted-foreground truncate">{hash}</div>
                  </div>
                  {withdraw ? (
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {(() => {
                          const localMeta = withdrawTokenMetaMap[(withdraw.token as string).toLowerCase()];
                          const viewMeta = viewWithdrawTokenMetaMap[(withdraw.token as string).toLowerCase()];
                          const meta = viewMeta || localMeta;
                          const logo = toSafeLogoSrc(meta?.logoURI);
                          return logo ? (
                            <img
                              src={logo}
                              alt={meta?.name || meta?.symbol || (withdraw.token as string)}
                              referrerPolicy="no-referrer"
                              decoding="async"
                              loading="lazy"
                              className="h-7 w-7 rounded-full object-contain bg-black shrink-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-black shrink-0" />
                          );
                        })()}
                        <div className="flex flex-col min-w-0">
                          <div className="truncate">
                            {(() => {
                              const localMeta = withdrawTokenMetaMap[(withdraw.token as string).toLowerCase()];
                              const viewMeta = viewWithdrawTokenMetaMap[(withdraw.token as string).toLowerCase()];
                              const meta = viewMeta || localMeta;
                              return meta?.name || "Unknown token";
                            })()}
                            {(() => {
                              const localMeta = withdrawTokenMetaMap[(withdraw.token as string).toLowerCase()];
                              const viewMeta = viewWithdrawTokenMetaMap[(withdraw.token as string).toLowerCase()];
                              const meta = viewMeta || localMeta;
                              return meta?.symbol ? <span className="text-muted-foreground"> ({meta.symbol})</span> : null;
                            })()}
                          </div>
                          <div className="text-xs text-muted-foreground break-all">
                            <a className="underline" href={getAddressExplorerUrl(chainId, withdraw.token)} target="_blank" rel="noopener noreferrer">{withdraw.token}</a>
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div>
                          Amount: {(() => {
                            const localMeta = withdrawTokenMetaMap[(withdraw.token as string).toLowerCase()];
                            const viewMeta = viewWithdrawTokenMetaMap[(withdraw.token as string).toLowerCase()];
                            const d = (viewMeta?.decimals ?? localMeta?.decimals);
                            if (typeof d === "number" && d >= 0) {
                              try {
                                const whole = withdraw.amount / (10n ** BigInt(d));
                                const frac = withdraw.amount % (10n ** BigInt(d));
                                const fracStr = d > 0 ? String((10n ** BigInt(d) + frac)).slice(1).replace(/0+$/, "") : "";
                                return d > 0 ? `${whole.toString()}${fracStr ? "." + fracStr : ""}` : whole.toString();
                              } catch {
                                return fmtBig(withdraw.amount);
                              }
                            }
                            return fmtBig(withdraw.amount);
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground">Nonce: {fmtBig(withdraw.nonce)}</div>
                      </div>
                      <div className="min-w-0">
                        <div>
                          Source: {(() => {
                            const srcId = chainIdFromKey(withdraw.srcChainKey);
                            const label = getFriendlyNameForChainKey(withdraw.srcChainKey as Hex) ?? (srcId ? String(srcId) : String(withdraw.srcChainKey));
                            return label;
                          })()}
                        </div>
                        <div>
                          Dest Address: <a className="underline" href={getAddressExplorerUrl(chainId, withdraw.to)} target="_blank" rel="noopener noreferrer">{withdraw.to}</a>
                        </div>
                      </div>
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
                      {withdraw && withdrawViewChainId === chainId && (
                        <div className="mt-1">
                          {(() => {
                            const delayVal = withdrawDelayQuery.data ?? 0n;
                            const nowVal = nowViewQuery.data ?? 0n;
                            const delayBig = (typeof delayVal === "bigint") ? delayVal : BigInt(delayVal ?? 0);
                            const nowBig = (typeof nowVal === "bigint") ? nowVal : BigInt(nowVal ?? 0);
                            const approvedAt = (typeof approval.approvedAt === "bigint") ? approval.approvedAt : BigInt(approval.approvedAt ?? 0);
                            const allowedAt = approvedAt + delayBig;
                            const remaining = allowedAt > nowBig ? Number(allowedAt - nowBig) : 0;
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



