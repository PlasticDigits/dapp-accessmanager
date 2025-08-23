"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract, useReadContracts } from "wagmi";
import type { Address, Hex, Abi, AbiFunction } from "viem";
import { encodeFunctionData, getFunctionSelector, isAddress, decodeErrorResult } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import {
  ROLE,
  getAccessManagerAddress,
  getKnownAddressLabel,
  ACCESS_MANAGER_ADDRESSES,
  FACTORY_TOKEN_CL8Y_BRIDGED_ADDRESS,
  CHAIN_REGISTRY_ADDRESS,
  TOKEN_REGISTRY_ADDRESS,
  MINT_BURN_ADDRESS,
  LOCK_UNLOCK_ADDRESS,
  CL8Y_BRIDGE_ADDRESS,
  DATASTORE_SET_ADDRESS,
  GUARD_BRIDGE_ADDRESS,
  BLACKLIST_BASIC_ADDRESS,
  TOKEN_RATE_LIMIT_ADDRESS,
  BRIDGE_ROUTER_ADDRESS,
  CREATE3_DEPLOYER_ADDRESS,
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
    () => [
      { id: ROLE.ADMIN, label: "ADMIN" },
      { id: ROLE.FACTORY_CREATOR, label: "FACTORY_CREATOR" },
      { id: ROLE.BRIDGE_OPERATOR, label: "BRIDGE_OPERATOR" },
      { id: ROLE.BRIDGE_CANCELLER, label: "BRIDGE_CANCELLER" },
    ],
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

  const [grantAddress, setGrantAddress] = useState<string>("");
  const [grantRoleId, setGrantRoleId] = useState<bigint>(ROLE.ADMIN);
  const [grantDelay, setGrantDelay] = useState<number>(0);

  const [revokeAddress, setRevokeAddress] = useState<string>("");
  const [revokeRoleId, setRevokeRoleId] = useState<bigint>(ROLE.ADMIN);

  const [managedTarget, setManagedTarget] = useState<string>("");
  const [selectorsText, setSelectorsText] = useState<string>("");
  const [scheduleRoleId, setScheduleRoleId] = useState<bigint>(ROLE.ADMIN);
  const [scheduleAt, setScheduleAt] = useState<Date | undefined>(undefined);

  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  // Known contracts and ABI-driven selector tooling
  type KnownContractKey =
    | "AccessManager"
    | "FactoryTokenCL8yBridged"
    | "ChainRegistry"
    | "TokenRegistry"
    | "MintBurn"
    | "LockUnlock"
    | "CL8YBridge"
    | "DatastoreSetAddress"
    | "GuardBridge"
    | "BlacklistBasic"
    | "TokenRateLimit"
    | "BridgeRouter"
    | "Create3Deployer";

  const [selectedKnownKey, setSelectedKnownKey] = useState<KnownContractKey | "">("");
  const [selectedFunctionSig, setSelectedFunctionSig] = useState<string>("");

  function buildSignature(fn: AbiFunction): string {
    const inputs = (fn.inputs ?? []).map((i) => i.type).join(",");
    return `${fn.name}(${inputs})`;
  }

  const knownContracts = useMemo(
    () =>
      [
        { key: "AccessManager" as KnownContractKey, label: "Access Manager", addressMap: ACCESS_MANAGER_ADDRESSES },
        { key: "FactoryTokenCL8yBridged" as KnownContractKey, label: "Factory Token CL8y Bridged", addressMap: FACTORY_TOKEN_CL8Y_BRIDGED_ADDRESS },
        { key: "ChainRegistry" as KnownContractKey, label: "Chain Registry", addressMap: CHAIN_REGISTRY_ADDRESS },
        { key: "TokenRegistry" as KnownContractKey, label: "Token Registry", addressMap: TOKEN_REGISTRY_ADDRESS },
        { key: "MintBurn" as KnownContractKey, label: "Mint Burn", addressMap: MINT_BURN_ADDRESS },
        { key: "LockUnlock" as KnownContractKey, label: "Lock Unlock", addressMap: LOCK_UNLOCK_ADDRESS },
        { key: "CL8YBridge" as KnownContractKey, label: "CL8Y Bridge", addressMap: CL8Y_BRIDGE_ADDRESS },
        { key: "DatastoreSetAddress" as KnownContractKey, label: "Datastore Set Address", addressMap: DATASTORE_SET_ADDRESS },
        { key: "GuardBridge" as KnownContractKey, label: "Guard Bridge", addressMap: GUARD_BRIDGE_ADDRESS },
        { key: "BlacklistBasic" as KnownContractKey, label: "Blacklist Basic", addressMap: BLACKLIST_BASIC_ADDRESS },
        { key: "TokenRateLimit" as KnownContractKey, label: "Token Rate Limit", addressMap: TOKEN_RATE_LIMIT_ADDRESS },
        { key: "BridgeRouter" as KnownContractKey, label: "Bridge Router", addressMap: BRIDGE_ROUTER_ADDRESS },
        { key: "Create3Deployer" as KnownContractKey, label: "Create3 Deployer", addressMap: CREATE3_DEPLOYER_ADDRESS },
      ]
        .map((c) => ({ ...c, address: c.addressMap[chainId] as Address | undefined }))
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

  const selectedAbi: Abi | undefined = selectedKnownKey
    ? (ABI as unknown as Record<string, Abi>)[selectedKnownKey]
    : undefined;
  const functionItems = useMemo((): Array<{ sig: string; name: string }> => {
    if (!selectedAbi) return [];
    return selectedAbi
      .filter((i): i is AbiFunction => i.type === "function")
      .map((fn) => ({ sig: buildSignature(fn), name: fn.name }));
  }, [selectedAbi]);

  function appendSelectorFromSignature(signature: string) {
    try {
      const selector = getFunctionSelector(signature) as Hex;
      const current = selectorsText.trim();
      const updated = current.length ? `${current} ${selector}` : selector;
      setSelectorsText(updated);
    } catch {}
  }

  const membersQueries = useQueries({
    queries: roles.map((r) => ({
      queryKey: ["role-members", chainId, accessManager, r.id.toString()],
      queryFn: () => fetchRoleMembers(publicClient!, chainId, r.id),
      enabled: Boolean(publicClient),
      staleTime: 60_000,
      refetchInterval: 30_000,
    })),
  });

  const revokeRoleIdx = roles.findIndex((r) => r.id === revokeRoleId);
  const revokeRoleMembers = (
    revokeRoleIdx >= 0 ? (membersQueries[revokeRoleIdx].data ?? []) : []
  ) as Array<{ account: string }>;

  useEffect(() => {
    setRevokeAddress("");
  }, [revokeRoleId]);

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

  async function handleGrant() {
    if (!address) return;
    if (!isAddress(grantAddress)) return;
    try {
      setIsGranting(true);
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "grantRole",
        args: [grantRoleId, grantAddress as Address, BigInt(Math.max(0, grantDelay))],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await invalidateRoleRelated();
      setGrantAddress("");
    } finally {
      setIsGranting(false);
    }
  }

  async function handleRevoke() {
    if (!address) return;
    if (!isAddress(revokeAddress)) return;
    try {
      setIsRevoking(true);
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "revokeRole",
        args: [revokeRoleId, revokeAddress as Address],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await invalidateRoleRelated();
      setRevokeAddress("");
    } finally {
      setIsRevoking(false);
    }
  }

  function parseSelectors(text: string): Hex[] {
    return text
      .split(/[\,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith("0x") ? s : ("0x" + s)) as Hex);
  }

  async function handleScheduleSetTargetFunctionRole() {
    if (!address) return;
    if (!isAddress(managedTarget)) return;
    const selectors = parseSelectors(selectorsText);
    if (selectors.length === 0) return;
    const data = encodeFunctionData({
      abi: ABI.AccessManager,
      functionName: "setTargetFunctionRole",
      args: [managedTarget as Address, selectors as readonly Hex[], scheduleRoleId],
    });
    try {
      setIsScheduling(true);
      const hash = await writeContractAsync({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "schedule",
        args: [accessManager, data, BigInt(Math.floor(((scheduleAt ?? new Date()).getTime()) / 1000))],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
    } finally {
      setIsScheduling(false);
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

      {roles.map((r, idx) => (
        <Card key={String(r.id)}>
          <CardHeader>
            <CardTitle>{r.label} Members</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {(membersQueries[idx].data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No members</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {membersQueries[idx].data!.map((m: { account: string }) => {
                  const label = getKnownAddressLabel(chainId, m.account as Address) ?? m.account;
                  const href = getAddressExplorerUrl(chainId, m.account as Address);
                  return (
                    <Badge key={m.account}>
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {label}
                      </a>
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Grant Role</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={grantRoleId.toString()} onChange={(e) => setGrantRoleId(BigInt(e.target.value))}>
              {roles.map((r) => (
                <option key={String(r.id)} value={r.id.toString()}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="grantAddress">Address</Label>
            <Input id="grantAddress" placeholder="0x..." value={grantAddress} onChange={(e) => setGrantAddress(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="grantDelay">Exec Delay (sec)</Label>
            <Input id="grantDelay" type="number" min={0} value={grantDelay} onChange={(e) => setGrantDelay(Number(e.target.value))} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleGrant} disabled={!address || isGranting}>
              {isGranting ? "Granting..." : "Grant"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revoke Role</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={revokeRoleId.toString()} onChange={(e) => setRevokeRoleId(BigInt(e.target.value))}>
              {roles.map((r) => (
                <option key={String(r.id)} value={r.id.toString()}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="revokeAddress">Member Address</Label>
            <Select
              id="revokeAddress"
              value={revokeAddress}
              onChange={(e) => setRevokeAddress(e.target.value)}
              disabled={revokeRoleMembers.length === 0}
            >
              <option value="">
                {revokeRoleMembers.length === 0 ? "No members" : "Select member…"}
              </option>
              {revokeRoleMembers.map((m) => {
                const label = getKnownAddressLabel(chainId, m.account as Address) ?? (m.account as string);
                return (
                  <option key={m.account} value={m.account}>
                    {label}
                  </option>
                );
              })}
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleRevoke} disabled={!address || isRevoking || !isAddress(revokeAddress)}>
              {isRevoking ? "Revoking..." : "Revoke"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>setTargetFunctionRole (Immediate)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1.5 md:col-span-4">
            <Label>Known Contract</Label>
            <div className="grid gap-2 md:grid-cols-3">
              <Select
                value={selectedKnownKey}
                onChange={(e) => {
                  const key = e.target.value as KnownContractKey | "";
                  setSelectedKnownKey(key);
                  setSelectedFunctionSig("");
                  const found = knownContracts.find((c) => c.key === key);
                  if (found?.address) setManagedTarget(found.address);
                }}
              >
                <option value="">Custom address…</option>
                {knownContracts.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Select
                value={selectedFunctionSig}
                onChange={(e) => setSelectedFunctionSig(e.target.value)}
                disabled={!selectedKnownKey}
              >
                <option value="">Select function…</option>
                {functionItems.map((f) => (
                  <option key={f.sig} value={f.sig}>
                    {f.sig}
                  </option>
                ))}
              </Select>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={() => selectedFunctionSig && appendSelectorFromSignature(selectedFunctionSig)}
                  disabled={!selectedFunctionSig}
                >
                  Add selector
                </Button>
              </div>
            </div>
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="managedTarget">Managed Target</Label>
            <Input id="managedTarget" placeholder="0x..." value={managedTarget} onChange={(e) => setManagedTarget(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Selectors (0x..., comma/space separated)</Label>
            <Input placeholder="0xabcdef01 0x12345678" value={selectorsText} onChange={(e) => setSelectorsText(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={scheduleRoleId.toString()} onChange={(e) => setScheduleRoleId(BigInt(e.target.value))}>
              {roles.map((r) => (
                <option key={String(r.id)} value={r.id.toString()}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2 md:col-span-4">
            <Button
              onClick={async () => {
                if (!address || !isAddress(managedTarget)) return;
                const selectors = parseSelectors(selectorsText);
                if (selectors.length === 0) return;
                const hash = await writeContractAsync({
                  abi: ABI.AccessManager,
                  address: accessManager,
                  functionName: "setTargetFunctionRole",
                  args: [managedTarget as Address, selectors as readonly Hex[], scheduleRoleId],
                });
                await publicClient!.waitForTransactionReceipt({ hash });
              }}
              disabled={!address}
            >
              Execute Now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule setTargetFunctionRole</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="managedTarget2">Managed Target</Label>
            <Input id="managedTarget2" placeholder="0x..." value={managedTarget} onChange={(e) => setManagedTarget(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Selectors (0x..., comma/space separated)</Label>
            <Input placeholder="0xabcdef01 0x12345678" value={selectorsText} onChange={(e) => setSelectorsText(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={scheduleRoleId.toString()} onChange={(e) => setScheduleRoleId(BigInt(e.target.value))}>
              {roles.map((r) => (
                <option key={String(r.id)} value={r.id.toString()}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <DateTimePicker label="When (local)" value={scheduleAt} onChange={setScheduleAt} />
          <div className="flex items-end gap-2 md:col-span-4">
            <Button onClick={handleScheduleSetTargetFunctionRole} disabled={!address || isScheduling}>
              {isScheduling ? "Scheduling..." : "Schedule Operation"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Function Selectors by Role</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!managedTargetsQuery.data || managedTargetsQuery.data.length === 0 ? (
            <div className="text-sm text-muted-foreground">No managed targets</div>
          ) : (
            <div className="grid gap-4">
              {managedTargetsQuery.data.map((t) => {
                const entry = targetSelectorsQueries.find((q) => (q.data as TargetSelectorsByRole | undefined)?.target?.toLowerCase() === (t as Address).toLowerCase());
                const label = getKnownAddressLabel(chainId, t as Address) ?? (t as Address);
                const href = getAddressExplorerUrl(chainId, t as Address);
                return (
                  <div key={t as string} className="grid gap-2">
                    <div className="font-medium">
                      <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
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
                                    <div key={sel as string} className="border rounded p-2 overflow-x-auto">
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
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


