"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract, useReadContracts } from "wagmi";
import type { Address, Hex, Abi, AbiFunction } from "viem";
import { encodeFunctionData, getFunctionSelector, isAddress, decodeErrorResult } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
 
import { X, Plus } from "lucide-react";
import {
  ROLE,
  getAccessManagerAddress,
  getKnownAddressLabel,
  KNOWN_CONTRACTS,
  type KnownContractKey,
  getRoleMetaById,
  ROLES,
} from "@/lib/contracts";
import { getAddressExplorerUrl } from "@/lib/chains";
import { ABI } from "@/lib/abi";
import { fetchRoleMembers } from "@/lib/roleMembers";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

export default function RolesPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const accessManager = getAccessManagerAddress(chainId);
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const roles = useMemo(
    () => ROLES.map((r) => ({ id: r.id, label: r.label })),
    []
  );

  const zero = "0x0000000000000000000000000000000000000000" as Address;
  const { data: roleReadResults, refetch: refetchRoleReads } = useReadContracts({
    contracts: roles.map((r) => ({
      abi: ABI.AccessManager,
      address: accessManager,
      functionName: "hasRole" as const,
      args: [r.id, (address ?? zero) as Address] as const,
    })),
    query: { enabled: Boolean(address), staleTime: 30_000 },
  });

  


  // Known contracts and ABI-driven selector tooling

  

  function buildSignature(fn: AbiFunction): string {
    const inputs = (fn.inputs ?? []).map((i) => i.type).join(",");
    return `${fn.name}(${inputs})`;
  }

  const knownContracts = useMemo(
    () =>
      (Object.keys(KNOWN_CONTRACTS) as KnownContractKey[])
        .map((key) => ({ key, ...KNOWN_CONTRACTS[key], address: KNOWN_CONTRACTS[key].addressMap[chainId] as Address | undefined }))
        .filter((c) => Boolean(c.address)),
    [chainId]
  );

  const abiByAddress = useMemo(() => {
    const map: Record<string, Abi> = {};
    for (const c of knownContracts) {
      const abiForKey = (ABI as unknown as Record<string, Abi>)[c.key];
      if (c.address && abiForKey) {
        map[(c.address as Address).toLowerCase()] = abiForKey;
      }
    }
    return map;
  }, [knownContracts]);

  

  

  const membersQueries = useQueries({
    queries: roles.map((r) => ({
      queryKey: ["role-members", chainId, accessManager, r.id.toString()],
      queryFn: () => fetchRoleMembers(publicClient!, chainId, r.id),
      enabled: Boolean(publicClient),
      staleTime: 60_000,
      refetchInterval: 30_000,
    })),
  });

  // Admin check for inline actions
  const isAdmin = useMemo(() => {
    const adminIdx = roles.findIndex((r) => r.id === ROLE.ADMIN);
    return Boolean((roleReadResults?.[adminIdx] as { result?: [boolean, bigint] } | undefined)?.result?.[0]);
  }, [roles, roleReadResults]);

  // Inline per-role UI state
  const [revokingMap, setRevokingMap] = useState<Record<string, boolean>>({});
  const [addingOpen, setAddingOpen] = useState<Record<string, boolean>>({});
  const [addKnownKey, setAddKnownKey] = useState<Record<string, KnownContractKey | "">>({});
  const [addAddress, setAddAddress] = useState<Record<string, string>>({});
  const [addingLoading, setAddingLoading] = useState<Record<string, boolean>>({});
  const [roleErrors, setRoleErrors] = useState<Record<string, string | undefined>>({});

  // Public role id (used to remove selector mapping)
  const { data: publicRoleId } = useQuery({
    queryKey: ["public-role-id", chainId, accessManager],
    queryFn: async () =>
      (await publicClient!.readContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "PUBLIC_ROLE" as const,
        args: [],
      })) as bigint,
    enabled: Boolean(publicClient),
    staleTime: 120_000,
  });

  function toggleAdd(roleKey: string) {
    setAddingOpen((p) => ({ ...p, [roleKey]: !p[roleKey] }));
    setRoleErrors((p) => ({ ...p, [roleKey]: undefined }));
  }

  async function handleRevokeInline(roleId: bigint, targetAddress: Address) {
    const key = roleId.toString();
    if (!address) {
      setRoleErrors((p) => ({ ...p, [key]: "Connect wallet to revoke" }));
      return;
    }
    if (!isAdmin) {
      setRoleErrors((p) => ({ ...p, [key]: "Only ADMIN can revoke roles" }));
      return;
    }
    const itemKey = `${key}-${targetAddress.toLowerCase()}`;
    setRevokingMap((p) => ({ ...p, [itemKey]: true }));
    setRoleErrors((p) => ({ ...p, [key]: undefined }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "revokeRole",
        args: [roleId, targetAddress],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await invalidateRoleRelated();
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.AccessManager]);
      setRoleErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      setRevokingMap((p) => ({ ...p, [itemKey]: false }));
    }
  }

  async function handleGrantInline(roleId: bigint) {
    const key = roleId.toString();
    if (!address) {
      setRoleErrors((p) => ({ ...p, [key]: "Connect wallet to grant" }));
      return;
    }
    if (!isAdmin) {
      setRoleErrors((p) => ({ ...p, [key]: "Only ADMIN can grant roles" }));
      return;
    }
    const addr = (addAddress[key] || "").trim();
    if (!isAddress(addr)) {
      setRoleErrors((p) => ({ ...p, [key]: "Enter a valid address" }));
      return;
    }
    setAddingLoading((p) => ({ ...p, [key]: true }));
    setRoleErrors((p) => ({ ...p, [key]: undefined }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "grantRole",
        args: [roleId, addr as Address, 0n],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await invalidateRoleRelated();
      setAddAddress((p) => ({ ...p, [key]: "" }));
      setAddKnownKey((p) => ({ ...p, [key]: "" }));
      setAddingOpen((p) => ({ ...p, [key]: false }));
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.AccessManager]);
      setRoleErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      setAddingLoading((p) => ({ ...p, [key]: false }));
    }
  }

  

  async function fetchManagedTargets(): Promise<readonly Address[]> {
    if (!publicClient) return [] as const;
    try {
      const items = await publicClient.readContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "getManagedTargets",
        args: [],
      });
      return items as readonly Address[];
    } catch {
      const count = (await publicClient.readContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "getManagedTargetCount",
        args: [],
      })) as bigint;
      const pageSize = 500n;
      const pages: Promise<readonly Address[]>[] = [];
      for (let index = 0n; index < count; index += pageSize) {
        const take = count - index > pageSize ? pageSize : count - index;
        pages.push(
          publicClient.readContract({
            abi: ABI.AccessManager,
            address: accessManager,
            functionName: "getManagedTargetsFrom",
            args: [index, take],
          }) as Promise<readonly Address[]>
        );
      }
      return (await Promise.all(pages)).flat();
    }
  }

  async function fetchTargetRoleSelectors(target: Address, roleId: bigint): Promise<readonly Hex[]> {
    if (!publicClient) return [] as const;
    try {
      const selectors = await publicClient.readContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "getTargetRoleSelectors",
        args: [target, roleId],
      });
      return selectors as readonly Hex[];
    } catch {
      const count = (await publicClient.readContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "getTargetRoleSelectorCount",
        args: [target, roleId],
      })) as bigint;
      const pageSize = 500n;
      const pages: Promise<readonly Hex[]>[] = [];
      for (let index = 0n; index < count; index += pageSize) {
        const take = count - index > pageSize ? pageSize : count - index;
        pages.push(
          publicClient.readContract({
            abi: ABI.AccessManager,
            address: accessManager,
            functionName: "getTargetRoleSelectorsFrom",
            args: [target, roleId, index, take],
          }) as Promise<readonly Hex[]>
        );
      }
      return (await Promise.all(pages)).flat();
    }
  }

  const managedTargetsQuery = useQuery({
    queryKey: ["managed-targets", chainId, accessManager],
    queryFn: fetchManagedTargets,
    enabled: Boolean(publicClient),
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  type TargetSelectorsByRole = {
    target: Address;
    byRole: Record<string, readonly Hex[]>;
  };

  const targetSelectorsQueries = useQueries({
    queries: (managedTargetsQuery.data ?? []).map((t) => ({
      queryKey: ["target-role-selectors", chainId, accessManager, t],
      queryFn: async (): Promise<TargetSelectorsByRole> => {
        const byRole: Record<string, readonly Hex[]> = {};
        await Promise.all(
          roles.map(async (r) => {
            byRole[r.id.toString()] = await fetchTargetRoleSelectors(t as Address, r.id);
          })
        );
        return { target: t as Address, byRole };
      },
      enabled: Boolean(publicClient),
      staleTime: 60_000,
      refetchInterval: 30_000,
    })),
  });

  function decodeSelectorLabel(target: Address, selector: Hex): string | undefined {
    const abi = abiByAddress[target.toLowerCase()];
    if (!abi) return undefined;
    for (const item of abi) {
      if (item.type === "function") {
        const fn = item as AbiFunction;
        const sig = buildSignature(fn);
        try {
          const sel = getFunctionSelector(sig) as Hex;
          if (sel.toLowerCase() === selector.toLowerCase()) return sig;
        } catch {}
      }
    }
    return undefined;
  }

  function getFunctionBySelector(target: Address, selector: Hex): AbiFunction | undefined {
    const abi = abiByAddress[target.toLowerCase()];
    if (!abi) return undefined;
    for (const item of abi) {
      if (item.type === "function") {
        const fn = item as AbiFunction;
        const sig = buildSignature(fn);
        try {
          const sel = getFunctionSelector(sig) as Hex;
          if (sel.toLowerCase() === selector.toLowerCase()) return fn;
        } catch {}
      }
    }
    return undefined;
  }

  function parseArgValue(solType: string, raw: string): unknown {
    const isArray = solType.endsWith("[]");
    if (isArray) {
      const baseType = solType.slice(0, -2);
      let items: string[];
      const trimmed = raw.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          items = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          items = [];
        }
      } else {
        items = trimmed.split(/\s*,\s*/).filter(Boolean);
      }
      return items.map((v) => parseArgValue(baseType, String(v)));
    }
    if (solType.startsWith("uint") || solType.startsWith("int")) {
      return BigInt(raw);
    }
    if (solType === "bool") {
      return /^true$/i.test(raw);
    }
    if (solType === "address") {
      return raw as Address;
    }
    if (solType.startsWith("bytes")) {
      return raw as Hex;
    }
    return raw;
  }

  const [openCalls, setOpenCalls] = useState<Record<string, boolean>>({});
  const [callInputs, setCallInputs] = useState<Record<string, string[]>>({});
  const [callLoading, setCallLoading] = useState<Record<string, boolean>>({});
  const [callErrors, setCallErrors] = useState<Record<string, string | undefined>>({});
  const [selectorRemoveBusy, setSelectorRemoveBusy] = useState<Record<string, boolean>>({});
  const [selectorAddOpen, setSelectorAddOpen] = useState<Record<string, boolean>>({});
  const [selectorAddSigs, setSelectorAddSigs] = useState<Record<string, string[]>>({});
  const [selectorAddBusy, setSelectorAddBusy] = useState<Record<string, boolean>>({});
  const [selectorErrors, setSelectorErrors] = useState<Record<string, string | undefined>>({});

  // Export / Import state
  const [exporting, setExporting] = useState(false);
  const [importJsonText, setImportJsonText] = useState<string>("");
  type MemberRef = { address?: Address; knownKey?: KnownContractKey };
  type TargetRef = { address?: Address; knownKey?: KnownContractKey };
  type ImportedTarget = { address?: Address; knownKey?: KnownContractKey; selectorsByRole: Record<string, readonly Hex[]> };
  const [importParsed, setImportParsed] = useState<
    | undefined
    | {
        version: number;
        sourceChainId: number;
        accessManager: Address;
        roles: Array<{ id: string; key?: string; label?: string; members: MemberRef[] }>;
        targets: Array<ImportedTarget>;
      }
  >();
  const [importErrors, setImportErrors] = useState<string | undefined>();
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyLogs, setApplyLogs] = useState<string[]>([]);
  const [replaceSelectors, setReplaceSelectors] = useState(false);

  function toggleCallPanel(key: string) {
    setOpenCalls((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setCallInput(key: string, index: number, value: string) {
    setCallInputs((prev) => {
      const next = { ...prev };
      const arr = [...(next[key] ?? [])];
      arr[index] = value;
      next[key] = arr;
      return next;
    });
  }

  async function executeTargetFunction(target: Address, selector: Hex) {
    const fn = getFunctionBySelector(target, selector);
    if (!fn) return;
    const key = `${target.toLowerCase()}-${selector.toLowerCase()}`;
    const rawArgs = callInputs[key] ?? [];
    const args = (fn.inputs ?? []).map((inp, i) => parseArgValue(inp.type, rawArgs[i] ?? ""));
    const data = encodeFunctionData({ abi: [fn] as unknown as Abi, functionName: fn.name, args });
    try {
      await publicClient!.simulateContract({
        abi: [fn] as unknown as Abi,
        address: target,
        functionName: fn.name,
        args,
        account: accessManager,
      });
    } catch (err) {
      const msg = extractReadableRevert(err, [abiByAddress[target.toLowerCase()]]);
      setCallErrors((p) => ({ ...p, [key]: msg }));
      return;
    }
    try {
      await publicClient!.simulateContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "execute",
        args: [target, data],
        account: address,
      });
      setCallErrors((p) => ({ ...p, [key]: undefined }));
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.AccessManager, abiByAddress[target.toLowerCase()]]);
      setCallErrors((p) => ({ ...p, [key]: msg }));
      return;
    }
    setCallLoading((p) => ({ ...p, [key]: true }));
    try {
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "execute",
        args: [target, data],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setCallErrors((p) => ({ ...p, [key]: undefined }));
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.AccessManager, abiByAddress[target.toLowerCase()]]);
      if (/user rejected/i.test(msg)) {
        setCallErrors((p) => ({ ...p, [key]: "Transaction canceled in wallet" }));
      } else {
        setCallErrors((p) => ({ ...p, [key]: msg }));
      }
    } finally {
      setCallLoading((p) => ({ ...p, [key]: false }));
    }
  }

  function extractReadableRevert(err: unknown, abis: Array<Abi | undefined>): string {
    const e = err as { message?: string; shortMessage?: string; cause?: unknown; data?: unknown };
    const raw = e?.shortMessage || e?.message || "Transaction failed";
    const dataHex = findHexData(err);
    if (dataHex) {
      for (const abi of abis) {
        if (!abi) continue;
        try {
          const decoded = decodeErrorResult({ abi, data: dataHex });
          if (decoded?.errorName) {
            const args = (decoded.args ?? []).map((a) => String(a)).join(", ");
            return args.length ? `${decoded.errorName}(${args})` : decoded.errorName;
          }
        } catch {}
      }
    }
    return raw;
  }

  function findHexData(err: unknown): Hex | undefined {
    const seen = new Set<unknown>();
    function walk(x: unknown): Hex | undefined {
      if (!x || typeof x !== "object" || seen.has(x)) return undefined;
      seen.add(x);
      const anyX = x as Record<string, unknown>;
      for (const key of Object.keys(anyX)) {
        const val = anyX[key];
        if (typeof val === "string" && /^0x[0-9a-fA-F]*$/.test(val)) {
          return val as Hex;
        }
        const nested = walk(val);
        if (nested) return nested;
      }
      return undefined;
    }
    return walk(err);
  }

  async function invalidateRoleRelated() {
    await refetchRoleReads();
    await queryClient.invalidateQueries({ queryKey: ["role-members", chainId, accessManager] });
  }

  async function invalidateTargetSelectors() {
    await queryClient.invalidateQueries({ queryKey: ["target-role-selectors", chainId, accessManager] });
  }

  function buildFunctionItemsForTarget(target: Address): Array<{ sig: string; name: string }> {
    const abi = abiByAddress[target.toLowerCase()];
    if (!abi) return [];
    return abi.filter((i): i is AbiFunction => i.type === "function").map((fn) => ({ sig: buildSignature(fn), name: fn.name }));
  }

  function getKnownKeyForAddressOnThisChain(addr: Address): KnownContractKey | undefined {
    const target = (addr as string).toLowerCase();
    for (const key of Object.keys(KNOWN_CONTRACTS) as KnownContractKey[]) {
      const mapped = KNOWN_CONTRACTS[key].addressMap[chainId];
      if (mapped && (mapped as string).toLowerCase() === target) return key;
    }
    return undefined;
  }

  function resolveMemberRefToAddress(ref: MemberRef): Address | undefined {
    if (ref.knownKey) {
      const mapped = KNOWN_CONTRACTS[ref.knownKey].addressMap[chainId];
      return mapped as Address | undefined;
    }
    if (ref.address && isAddress(ref.address)) return ref.address as Address;
    return undefined;
  }

  function resolveTargetRefToAddress(ref: TargetRef): Address | undefined {
    if (ref.knownKey) {
      const mapped = KNOWN_CONTRACTS[ref.knownKey].addressMap[chainId];
      return mapped as Address | undefined;
    }
    if (ref.address && isAddress(ref.address)) return ref.address as Address;
    return undefined;
  }

  async function handleRemoveSelector(target: Address, roleId: bigint, selector: Hex) {
    const key = `${target.toLowerCase()}-${roleId.toString()}`;
    if (!address) {
      setSelectorErrors((p) => ({ ...p, [key]: "Connect wallet to remove" }));
      return;
    }
    if (!isAdmin) {
      setSelectorErrors((p) => ({ ...p, [key]: "Only ADMIN can modify selectors" }));
      return;
    }
    if (!publicRoleId) {
      setSelectorErrors((p) => ({ ...p, [key]: "Public role not loaded yet" }));
      return;
    }
    const itemKey = `${key}-${selector.toLowerCase()}`;
    setSelectorRemoveBusy((p) => ({ ...p, [itemKey]: true }));
    setSelectorErrors((p) => ({ ...p, [key]: undefined }));
    try {
      await publicClient!.simulateContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "setTargetFunctionRole",
        args: [target, [selector], publicRoleId],
        account: address,
      });
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.AccessManager]);
      setSelectorErrors((p) => ({ ...p, [key]: msg }));
      setSelectorRemoveBusy((p) => ({ ...p, [itemKey]: false }));
      return;
    }
    try {
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "setTargetFunctionRole",
        args: [target, [selector], publicRoleId],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await invalidateTargetSelectors();
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.AccessManager]);
      setSelectorErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      setSelectorRemoveBusy((p) => ({ ...p, [itemKey]: false }));
    }
  }

  async function handleAddSelectors(target: Address, roleId: bigint, signatures: string[]) {
    const key = `${target.toLowerCase()}-${roleId.toString()}`;
    if (!address) {
      setSelectorErrors((p) => ({ ...p, [key]: "Connect wallet to add" }));
      return;
    }
    if (!isAdmin) {
      setSelectorErrors((p) => ({ ...p, [key]: "Only ADMIN can modify selectors" }));
      return;
    }
    const sigs = (signatures || []).filter(Boolean);
    if (sigs.length === 0) {
      setSelectorErrors((p) => ({ ...p, [key]: "Select at least one function" }));
      return;
    }
    let selectors: Hex[] = [];
    try {
      selectors = sigs.map((s) => getFunctionSelector(s) as Hex);
    } catch {
      setSelectorErrors((p) => ({ ...p, [key]: "Invalid function signature" }));
      return;
    }
    setSelectorAddBusy((p) => ({ ...p, [key]: true }));
    setSelectorErrors((p) => ({ ...p, [key]: undefined }));
    try {
      await publicClient!.simulateContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "setTargetFunctionRole",
        args: [target, selectors as readonly Hex[], roleId],
        account: address,
      });
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.AccessManager]);
      setSelectorErrors((p) => ({ ...p, [key]: msg }));
      setSelectorAddBusy((p) => ({ ...p, [key]: false }));
      return;
    }
    try {
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "setTargetFunctionRole",
        args: [target, selectors as readonly Hex[], roleId],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await invalidateTargetSelectors();
      setSelectorAddSigs((p) => ({ ...p, [key]: [] }));
      setSelectorAddOpen((p) => ({ ...p, [key]: false }));
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.AccessManager]);
      setSelectorErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      setSelectorAddBusy((p) => ({ ...p, [key]: false }));
    }
  }

  async function buildExportData() {
    const currentChainId = chainId;
    const am = accessManager;
    const result: {
      version: number;
      sourceChainId: number;
      accessManager: Address;
      roles: Array<{ id: string; key?: string; label?: string; members: MemberRef[] }>;
      targets: Array<{ address?: Address; knownKey?: KnownContractKey; selectorsByRole: Record<string, readonly Hex[]> }>;
    } = {
      version: 1,
      sourceChainId: currentChainId,
      accessManager: am,
      roles: [],
      targets: [],
    };

    // Roles and members
    for (const r of roles.filter((x) => x.id !== ROLE.ADMIN)) {
      const members = await fetchRoleMembers(publicClient!, currentChainId, r.id);
      const memberRefs: MemberRef[] = members.map((m) => {
        const addr = m.account as Address;
        const knownKey = getKnownKeyForAddressOnThisChain(addr);
        return knownKey ? { knownKey } : { address: addr };
      });
      result.roles.push({ id: r.id.toString(), key: r.label, label: r.label, members: memberRefs });
    }

    // Targets and selectors per role
    const targets = await fetchManagedTargets();
    for (const t of targets) {
      const byRole: Record<string, readonly Hex[]> = {};
      for (const r of roles.filter((x) => x.id !== ROLE.ADMIN)) {
        const sels = await fetchTargetRoleSelectors(t as Address, r.id);
        byRole[r.id.toString()] = sels;
      }
      const knownKey = getKnownKeyForAddressOnThisChain(t as Address);
      if (knownKey) {
        result.targets.push({ knownKey, selectorsByRole: byRole });
      } else {
        result.targets.push({ address: t as Address, selectorsByRole: byRole });
      }
    }

    return result;
  }

  async function handleExportJson() {
    if (!publicClient) return;
    setExporting(true);
    try {
      const data = await buildExportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roles-export-${chainId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function parseImportJson(text: string) {
    setImportJsonText(text);
    setImportErrors(undefined);
    try {
      const parsed = JSON.parse(text);
      // Basic shape validation
      if (
        typeof parsed !== "object" ||
        typeof parsed.version !== "number" ||
        !Array.isArray(parsed.roles) ||
        !Array.isArray(parsed.targets)
      ) {
        throw new Error("Invalid file format");
      }
      setImportParsed(parsed);
    } catch (e) {
      setImportParsed(undefined);
      setImportErrors((e as Error).message || "Invalid JSON");
    }
  }

  async function applyImport() {
    if (!importParsed) return;
    if (!address) {
      setImportErrors("Connect wallet to apply import");
      return;
    }
    setApplyBusy(true);
    setApplyLogs([]);
    setImportErrors(undefined);
    try {
      // Map roleId string -> bigint
      const roleIdStrings = new Set(importParsed.roles.map((r) => r.id));

      // 1) Members: add-only
      for (const roleEntry of importParsed.roles) {
        const roleId = BigInt(roleEntry.id);
        if (roleId === ROLE.ADMIN) continue; // never modify ADMIN
        const key = roleId.toString();
        setApplyLogs((p) => [...p, `Checking members for role ${getRoleMetaById(roleId)?.label ?? key}`]);
        const current = await fetchRoleMembers(publicClient!, chainId, roleId);
        const currentSet = new Set(current.map((m) => (m.account as string).toLowerCase()));
        // Normalize members entries from file: support legacy string[] as addresses
        const desiredAddresses: Address[] = (roleEntry.members as unknown as Array<MemberRef | string> | undefined)
          ?.map((m) => {
            if (typeof m === "string") {
              return isAddress(m) ? (m as Address) : undefined;
            }
            return resolveMemberRefToAddress(m as MemberRef);
          })
          .filter((x): x is Address => Boolean(x)) ?? [];
        const seen = new Set<string>();
        const uniqueDesired = desiredAddresses.filter((a) => {
          const key = (a as string).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const toAdd = uniqueDesired.filter((m) => !currentSet.has((m as string).toLowerCase()));
        if (toAdd.length === 0) continue;
        // Batch add in chunks to avoid tx size limits; here per-address
        for (const m of toAdd) {
          setApplyLogs((p) => [...p, `Granting role ${key} to ${m}`]);
          try {
            await publicClient!.simulateContract({
              abi: ABI.AccessManager,
              address: accessManager,
              functionName: "grantRole",
              args: [roleId, m as Address, 0n],
              account: address,
            });
          } catch (err) {
            const msg = extractReadableRevert(err, [ABI.AccessManager]);
            setImportErrors(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
            return;
          }
          try {
            const txHash = await writeContractAsync({
              abi: ABI.AccessManager,
              address: accessManager,
              functionName: "grantRole",
              args: [roleId, m as Address, 0n],
            });
            await publicClient!.waitForTransactionReceipt({ hash: txHash });
          } catch (err) {
            const msg = extractReadableRevert(err, [ABI.AccessManager]);
            setImportErrors(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
            return;
          }
        }
      }

      // 2) Selectors per target/role
      const currentTargets = await fetchManagedTargets();
      const currentTargetSet = new Set(currentTargets.map((t) => (t as string).toLowerCase()));
      for (const tgt of importParsed.targets) {
        const targetAddr = resolveTargetRefToAddress(tgt as TargetRef);
        if (!targetAddr) {
          setApplyLogs((p) => [...p, `Skipping target with unresolved address (knownKey/address missing or invalid)`]);
          continue;
        }
        setApplyLogs((p) => [...p, `Syncing selectors for target ${targetAddr}`]);
        for (const roleIdStr of Object.keys((tgt as ImportedTarget).selectorsByRole || {})) {
          if (!roleIdStrings.has(roleIdStr)) continue; // ignore unknown roles
          const roleId = BigInt(roleIdStr);
          if (roleId === ROLE.ADMIN) continue; // never modify ADMIN
          const desired = new Set(((tgt as ImportedTarget).selectorsByRole[roleIdStr] || []).map((h) => (h as string).toLowerCase()));
          const current = new Set(
            (await fetchTargetRoleSelectors(targetAddr, roleId)).map((h) => (h as string).toLowerCase())
          );

          // Add missing selectors
          const toAdd: Hex[] = [];
          desired.forEach((h) => {
            if (!current.has(h)) toAdd.push(h as Hex);
          });
          if (toAdd.length > 0) {
            setApplyLogs((p) => [...p, `Adding ${toAdd.length} selectors to role ${roleIdStr}`]);
            try {
              await publicClient!.simulateContract({
                abi: ABI.AccessManager,
                address: accessManager,
                functionName: "setTargetFunctionRole",
                args: [targetAddr, toAdd as readonly Hex[], roleId],
                account: address,
              });
            } catch (err) {
              const msg = extractReadableRevert(err, [ABI.AccessManager]);
              setImportErrors(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
              return;
            }
            try {
              const txHash = await writeContractAsync({
                abi: ABI.AccessManager,
                address: accessManager,
                functionName: "setTargetFunctionRole",
                args: [targetAddr, toAdd as readonly Hex[], roleId],
              });
              await publicClient!.waitForTransactionReceipt({ hash: txHash });
            } catch (err) {
              const msg = extractReadableRevert(err, [ABI.AccessManager]);
              setImportErrors(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
              return;
            }
          }

          // Optionally remove extras by remapping to public role
          if (replaceSelectors && publicRoleId !== undefined) {
            const extras: Hex[] = [];
            current.forEach((h) => {
              if (!desired.has(h)) extras.push(h as Hex);
            });
            if (extras.length > 0) {
              setApplyLogs((p) => [...p, `Removing ${extras.length} selectors from role ${roleIdStr}`]);
              try {
                await publicClient!.simulateContract({
                  abi: ABI.AccessManager,
                  address: accessManager,
                  functionName: "setTargetFunctionRole",
                  args: [targetAddr, extras as readonly Hex[], publicRoleId!],
                  account: address,
                });
              } catch (err) {
                const msg = extractReadableRevert(err, [ABI.AccessManager]);
                setImportErrors(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
                return;
              }
              try {
                const txHash = await writeContractAsync({
                  abi: ABI.AccessManager,
                  address: accessManager,
                  functionName: "setTargetFunctionRole",
                  args: [targetAddr, extras as readonly Hex[], publicRoleId!],
                });
                await publicClient!.waitForTransactionReceipt({ hash: txHash });
              } catch (err) {
                const msg = extractReadableRevert(err, [ABI.AccessManager]);
                setImportErrors(/user rejected/i.test(msg) ? "Transaction canceled" : msg);
                return;
              }
            }
          }
        }

        // Ensure target is registered if not present (setting selectors above already registers)
        if (!currentTargetSet.has((targetAddr as string).toLowerCase())) {
          // nothing extra to do here
        }
      }

      await invalidateRoleRelated();
      await invalidateTargetSelectors();
    } finally {
      setApplyBusy(false);
    }
  }

  
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Roles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {roles.map((r, idx) => {
            const isMember = (roleReadResults?.[idx] as { result?: [boolean, bigint] } | undefined)?.result?.[0];
            return (
              <Badge key={String(r.id)} variant={isMember ? "default" : "secondary"}>
                {r.label} {isMember ? "✓" : "x"}
              </Badge>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role Members</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {roles.map((r, idx) => (
            <div key={String(r.id)} className="grid gap-2">
              <div className="text-sm font-medium">{r.label} Members</div>
              <div className="text-xs text-muted-foreground">
                {(() => getRoleMetaById(r.id)?.description)()}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(membersQueries[idx].data ?? []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">No members</div>
                ) : (
                  membersQueries[idx].data!.map((m: { account: string }) => {
                    const label = getKnownAddressLabel(chainId, m.account as Address) ?? m.account;
                    const href = getAddressExplorerUrl(chainId, m.account as Address);
                    const itemKey = `${r.id.toString()}-${(m.account as string).toLowerCase()}`;
                    const busy = Boolean(revokingMap[itemKey]);
                    return (
                      <Badge key={m.account} className="inline-flex items-center gap-1">
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                          {label}
                        </a>
                        <button
                          type="button"
                          aria-label="Revoke role"
                          className="ml-1 inline-flex items-center text-xs hover:text-red-600"
                          onClick={() => handleRevokeInline(r.id, m.account as Address)}
                          disabled={busy}
                          title="Revoke"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-accent"
                  onClick={() => toggleAdd(r.id.toString())}
                  title="Add member"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {addingOpen[r.id.toString()] && (
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>Known Contract</Label>
                    <Select
                      value={addKnownKey[r.id.toString()] ?? ""}
                      onChange={(e) => {
                        const key = r.id.toString();
                        const val = e.target.value as KnownContractKey | "";
                        setAddKnownKey((p) => ({ ...p, [key]: val }));
                        const found = knownContracts.find((c) => c.key === val);
                        if (found?.address) {
                          setAddAddress((p) => ({ ...p, [key]: found.address as string }));
                        }
                      }}
                    >
                      <option value="">Custom address…</option>
                      {knownContracts.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-1.5 md:col-span-1">
                    <Label htmlFor={`add-${r.id.toString()}`}>Address</Label>
                    <Input
                      id={`add-${r.id.toString()}`}
                      placeholder="0x..."
                      value={addAddress[r.id.toString()] ?? ""}
                      onChange={(e) => setAddAddress((p) => ({ ...p, [r.id.toString()]: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      onClick={() => handleGrantInline(r.id)}
                      disabled={Boolean(addingLoading[r.id.toString()])}
                    >
                      {addingLoading[r.id.toString()] ? "Granting..." : "Grant"}
                    </Button>
                  </div>
                </div>
              )}
              {roleErrors[r.id.toString()] && (
                <div className="text-xs text-red-600">{roleErrors[r.id.toString()]}</div>
              )}
              {idx < roles.length - 1 && <hr className="my-2" />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Function Selectors by Role</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-4">
            {(!managedTargetsQuery.data || managedTargetsQuery.data.length === 0) && (
              <div className="grid gap-2">
                <div className="font-medium">No managed targets configured</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {roles.map((r) => (
                    <div key={`no-target-${r.id.toString()}`} className="border rounded-md p-2">
                      <div className="text-sm mb-2 flex items-center gap-2">
                        <span className="text-muted-foreground">Role: {r.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">No selectors</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(managedTargetsQuery.data ?? []).map((t) => {
                const entry = targetSelectorsQueries.find((q) => (q.data as TargetSelectorsByRole | undefined)?.target?.toLowerCase() === (t as Address).toLowerCase());
                const label = getKnownAddressLabel(chainId, t as Address) ?? (t as Address);
                const href = getAddressExplorerUrl(chainId, t as Address);
                return (
                  <div key={t as string} className="grid gap-2">
                    <div className="font-medium">
                      <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
                    </div>
                    <div className="text-xs flex items-center gap-2">
                      <span className={isAdmin ? "text-green-600" : "text-red-600"}>{isAdmin ? "✓" : "x"}</span>
                      <span>
                        {address
                          ? isAdmin
                            ? "Connected wallet can manage this target"
                            : "Connected wallet cannot manage this target"
                          : "Connect wallet to manage this target"}
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {roles.map((r) => {
                        const sels = (entry?.data as TargetSelectorsByRole | undefined)?.byRole?.[r.id.toString()] ?? [];
                        const roleIdx = roles.findIndex((rr) => rr.id === r.id);
                        const isMember = Boolean((roleReadResults?.[roleIdx] as { result?: [boolean, bigint] } | undefined)?.result?.[0]);
                        const allowed = isMember;
                        return (
                          <div key={`${t as string}-${r.id.toString()}`} className="border rounded-md p-2">
                            <div className="text-sm mb-2 flex items-center gap-2">
                              <span className={allowed ? "text-green-600" : "text-red-600"}>{allowed ? "✓" : "x"}</span>
                              <span>Role: {r.label}</span>
                            </div>
                            {sels.length === 0 ? (
                              <div className="text-xs text-muted-foreground">No selectors</div>
                            ) : (
                              <div className="flex flex-col gap-3">
                                {sels.map((sel) => {
                                  const sig = decodeSelectorLabel(t as Address, sel as Hex);
                                  const fn = sig ? getFunctionBySelector(t as Address, sel as Hex) : undefined;
                                  const key = `${(t as Address).toLowerCase()}-${(sel as string).toLowerCase()}`;
                                  const canInteract = allowed && Boolean(fn);
                                  return (
                                    <div key={sel as string} className="border rounded p-2">
                                      <div className="relative">
                                        <div className="pr-12 overflow-x-auto">
                                          <div className="flex items-center justify-between">
                                            <button
                                              type="button"
                                              className={`text-left ${canInteract ? "underline" : "text-muted-foreground cursor-not-allowed"}`}
                                              onClick={() => canInteract && toggleCallPanel(key)}
                                              disabled={!canInteract}
                                            >
                                              {sig ? sig : (sel as string)}
                                            </button>
                                            {canInteract && (
                                              <Button size="sm" variant="outline" onClick={() => toggleCallPanel(key)}>
                                                {openCalls[key] ? "Hide" : "Show"}
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                        <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-card" />
                                        <div className="pointer-events-none absolute right-10 top-0 h-full w-14 bg-gradient-to-l from-card to-transparent" />
                                        <button
                                          type="button"
                                          aria-label="Remove selector"
                                          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 inline-flex items-center text-xs hover:text-red-600"
                                          onClick={() => handleRemoveSelector(t as Address, r.id, sel as Hex)}
                                          disabled={!isAdmin || Boolean(selectorRemoveBusy[`${(t as Address).toLowerCase()}-${r.id.toString()}-${(sel as string).toLowerCase()}`])}
                                          title="Remove"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                      {canInteract && openCalls[key] && fn && (
                                        <div className="mt-3 grid gap-2">
                                          {(fn.inputs ?? []).length === 0 ? (
                                            <div className="text-xs text-muted-foreground">No inputs</div>
                                          ) : (
                                            <div className="grid gap-2">
                                              {(fn.inputs ?? []).map((inp, i) => (
                                                <div key={`${key}-arg-${i}`} className="grid gap-1.5">
                                                  <Label>
                                                    {inp.name || `arg${i}`} ({inp.type})
                                                  </Label>
                                                  {String(inp.type).endsWith("[]") ? (
                                                    <textarea
                                                      className="w-full min-h-[96px] max-h-48 border rounded-md p-2 text-sm overflow-auto whitespace-pre-wrap break-words"
                                                      placeholder={`${inp.type} (comma-separated or JSON array)`}
                                                      value={(callInputs[key] ?? [])[i] ?? ""}
                                                      onChange={(e) => setCallInput(key, i, e.target.value)}
                                                    />
                                                  ) : (
                                                    <Input
                                                      placeholder={inp.type}
                                                      value={(callInputs[key] ?? [])[i] ?? ""}
                                                      onChange={(e) => setCallInput(key, i, e.target.value)}
                                                    />
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-2">
                                            <Button size="sm" onClick={() => executeTargetFunction(t as Address, sel as Hex)} disabled={Boolean(callLoading[key])}>
                                              {callLoading[key] ? "Calling..." : "Call via AccessManager"}
                                            </Button>
                                            {callErrors[key] && (
                                              <div className="text-xs text-red-600 break-words">{callErrors[key]}</div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* Add selector section */}
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-accent"
                                onClick={() => {
                                  const addKey = `${(t as Address).toLowerCase()}-${r.id.toString()}`;
                                  setSelectorAddOpen((p) => ({ ...p, [addKey]: !p[addKey] }));
                                }}
                                title="Add selector"
                              >
                                <Plus className="w-4 h-4" /> Add
                              </button>
                            </div>
                            {(() => {
                              const addKey = `${(t as Address).toLowerCase()}-${r.id.toString()}`;
                              const items = buildFunctionItemsForTarget(t as Address);
                              return selectorAddOpen[addKey] ? (
                                <div className="mt-2 grid gap-2 md:grid-cols-3">
                                  <div className="grid gap-1.5 md:col-span-2">
                                    <Label>Function</Label>
                                    <Select
                                      multiple
                                      value={selectorAddSigs[addKey] ?? []}
                                      onChange={(e) =>
                                        setSelectorAddSigs((p) => ({
                                          ...p,
                                          [addKey]: Array.from(e.target.selectedOptions).map((o) => o.value),
                                        }))
                                      }
                                      disabled={items.length === 0}
                                    >
                                      {items.map((f) => (
                                        <option key={f.sig} value={f.sig}>
                                          {f.sig}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div className="flex items-end gap-2">
                                    <Button
                                      onClick={() => handleAddSelectors(t as Address, r.id, selectorAddSigs[addKey] ?? [])}
                                      disabled={!isAdmin || Boolean(selectorAddBusy[addKey]) || !((selectorAddSigs[addKey] ?? []).length)}
                                    >
                                      {selectorAddBusy[addKey] ? "Adding..." : "Add"}
                                    </Button>
                                  </div>
                                  {selectorErrors[addKey] && (
                                    <div className="md:col-span-3 text-xs text-red-600">{selectorErrors[addKey]}</div>
                                  )}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
        </CardContent>
      </Card>
      {/* Export / Import moved to bottom */}
      <Card>
        <CardHeader>
          <CardTitle>Export / Import</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleExportJson} disabled={exporting || !publicClient}>
              {exporting ? "Exporting…" : "Export current config (JSON)"}
            </Button>
          </div>
          <hr className="my-2" />
          <div className="grid gap-2">
            <Label>Import JSON</Label>
            <textarea
              className="w-full min-h-[160px] max-h-[320px] border rounded-md p-2 text-sm overflow-auto whitespace-pre-wrap break-words"
              placeholder="Paste exported JSON here"
              value={importJsonText}
              onChange={(e) => parseImportJson(e.target.value)}
            />
            <div className="flex items-center gap-2 text-sm">
              <input
                id="replace-selectors"
                type="checkbox"
                checked={replaceSelectors}
                onChange={(e) => setReplaceSelectors(e.target.checked)}
              />
              <Label htmlFor="replace-selectors">Replace selectors (remove extras not in file)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={applyImport} disabled={!importParsed || applyBusy || !publicClient}>
                {applyBusy ? "Applying…" : "Apply to current chain"}
              </Button>
              {importErrors && <div className="text-xs text-red-600">{importErrors}</div>}
            </div>
            {importParsed && (
              <div className="text-xs text-muted-foreground">
                Ready to import roles and selectors from chain {importParsed.sourceChainId} to chain {chainId}.
              </div>
            )}
            {applyLogs.length > 0 && (
              <div className="mt-2 border rounded-md p-2 max-h-56 overflow-auto text-xs">
                {applyLogs.map((l, i) => (
                  <div key={`log-${i}`}>{l}</div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


