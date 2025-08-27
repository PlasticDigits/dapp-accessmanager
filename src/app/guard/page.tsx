"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import type { Address, Hex, Abi } from "viem";
import { isAddress, decodeErrorResult } from "viem";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { ABI } from "@/lib/abi";
import { KNOWN_CONTRACTS, ROLE, getAccessManagerAddress } from "@/lib/contracts";
import { getAddressExplorerUrl } from "@/lib/chains";
import { getKnownAddressLabel } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { Select } from "@/components/ui/select";

type GuardMeta = {
  datastore: Address;
  setAccount: Hex;
  setDeposit: Hex;
  setWithdraw: Hex;
};

export default function GuardPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const guardBridge = useMemo(
    () => KNOWN_CONTRACTS.GuardBridge.addressMap[chainId] as Address | undefined,
    [chainId]
  );

  const metaQuery = useQuery({
    queryKey: ["guardbridge-meta", chainId, guardBridge],
    enabled: Boolean(publicClient && guardBridge),
    staleTime: 60_000,
    queryFn: async (): Promise<GuardMeta> => {
      const [datastore, setAccount, setDeposit, setWithdraw] = await Promise.all([
        publicClient!.readContract({
          abi: ABI.GuardBridge,
          address: guardBridge!,
          functionName: "datastoreAddress" as const,
          args: [],
        }) as Promise<Address>,
        publicClient!.readContract({
          abi: ABI.GuardBridge,
          address: guardBridge!,
          functionName: "GUARD_MODULES_ACCOUNT" as const,
          args: [],
        }) as Promise<Hex>,
        publicClient!.readContract({
          abi: ABI.GuardBridge,
          address: guardBridge!,
          functionName: "GUARD_MODULES_DEPOSIT" as const,
          args: [],
        }) as Promise<Hex>,
        publicClient!.readContract({
          abi: ABI.GuardBridge,
          address: guardBridge!,
          functionName: "GUARD_MODULES_WITHDRAW" as const,
          args: [],
        }) as Promise<Hex>,
      ]);
      return { datastore, setAccount, setDeposit, setWithdraw };
    },
  });

  // CONFIG role gate
  const accessManager = getAccessManagerAddress(chainId);
  const configRoleQuery = useQuery({
    queryKey: ["config-role", chainId, accessManager, address],
    enabled: Boolean(publicClient && address),
    staleTime: 30_000,
    queryFn: async () => {
      const res = (await publicClient!.readContract({
        abi: ABI.AccessManager,
        address: accessManager,
        functionName: "hasRole" as const,
        args: [ROLE.CONFIG, (address ?? "0x0000000000000000000000000000000000000000") as Address] as const,
      })) as [boolean, bigint];
      return Boolean(res?.[0]);
    },
  });

  // Inline add/remove placeholders (to be wired next)
  const [addingOpen, setAddingOpen] = useState<Record<string, boolean>>({});
  const [addAddress, setAddAddress] = useState<Record<string, string>>({});

  const categories = useMemo(
    () =>
      metaQuery.data
        ? (
            [
              { key: "account", title: "Account Modules", setId: metaQuery.data.setAccount },
              { key: "deposit", title: "Deposit Modules", setId: metaQuery.data.setDeposit },
              { key: "withdraw", title: "Withdraw Modules", setId: metaQuery.data.setWithdraw },
            ] as Array<{ key: string; title: string; setId: Hex }>
          )
        : [],
    [metaQuery.data]
  );

  const lists = useQueries({
    queries: categories.map((c) => ({
      queryKey: ["guardbridge-modules", chainId, guardBridge, c.setId],
      enabled: Boolean(publicClient && guardBridge && metaQuery.data),
      staleTime: 30_000,
      queryFn: async (): Promise<readonly Address[]> => {
        const items = (await publicClient!.readContract({
          abi: ABI.DatastoreSetAddress,
          address: metaQuery.data!.datastore,
          functionName: "getAll" as const,
          args: [guardBridge!, c.setId] as const,
        })) as readonly Address[];
        return items;
      },
    })),
  });

  const knownModules = useMemo(
    () => {
      const items: Array<{ key: string; label: string; address?: Address }> = [];
      const bl = KNOWN_CONTRACTS.BlacklistBasic.addressMap[chainId] as Address | undefined;
      const rl = KNOWN_CONTRACTS.TokenRateLimit.addressMap[chainId] as Address | undefined;
      if (bl) items.push({ key: "BlacklistBasic", label: KNOWN_CONTRACTS.BlacklistBasic.label, address: bl });
      if (rl) items.push({ key: "TokenRateLimit", label: KNOWN_CONTRACTS.TokenRateLimit.label, address: rl });
      return items;
    },
    [chainId]
  );

  // Detect module types (BlacklistBasic, TokenRateLimit)
  const zeroAddr = "0x0000000000000000000000000000000000000000" as Address;
  const allModuleAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const q of lists) {
      for (const a of (q.data ?? []) as readonly Address[]) {
        set.add((a as string).toLowerCase());
      }
    }
    return Array.from(set.values()) as string[];
  }, [lists]);

  const typeDetectQueries = useQueries({
    queries: allModuleAddresses.map((s) => ({
      queryKey: ["guardbridge-mod-type", chainId, s],
      enabled: Boolean(publicClient) && allModuleAddresses.length > 0,
      staleTime: 120_000,
      queryFn: async (): Promise<"blacklist" | "ratelimit" | undefined> => {
        const addr = (s as string) as Address;
        try {
          await publicClient!.readContract({
            abi: ABI.BlacklistBasic,
            address: addr,
            functionName: "isBlacklisted" as const,
            args: [zeroAddr],
          });
          return "blacklist";
        } catch {}
        try {
          await publicClient!.readContract({
            abi: ABI.TokenRateLimit,
            address: addr,
            functionName: "WINDOW_SECONDS" as const,
            args: [],
          });
          return "ratelimit";
        } catch {}
        return undefined;
      },
    })),
  });

  const moduleTypeByAddr = useMemo(() => {
    const map: Record<string, "blacklist" | "ratelimit" | undefined> = {};
    allModuleAddresses.forEach((s, i) => {
      map[s] = typeDetectQueries[i]?.data as "blacklist" | "ratelimit" | undefined;
    });
    return map;
  }, [allModuleAddresses, typeDetectQueries]);

  // Blacklist settings state
  const [settingsOpen, setSettingsOpen] = useState<Record<string, boolean>>({});
  const [blkTextTrue, setBlkTextTrue] = useState<Record<string, string>>({});
  const [blkTextFalse, setBlkTextFalse] = useState<Record<string, string>>({});
  const [blkBusyTrue, setBlkBusyTrue] = useState<Record<string, boolean>>({});
  const [blkBusyFalse, setBlkBusyFalse] = useState<Record<string, boolean>>({});
  const [blkErrors, setBlkErrors] = useState<Record<string, string | undefined>>({});

  function parseAddresses(raw: string): Address[] {
    const tokens = raw
      .split(/[\s,;\n\r]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const uniq = new Set<string>();
    const out: Address[] = [];
    for (const t of tokens) {
      if (isAddress(t)) {
        const key = t.toLowerCase();
        if (!uniq.has(key)) {
          uniq.add(key);
          out.push(t as Address);
        }
      }
    }
    return out;
  }

  async function handleBlacklistSet(addr: Address, toTrue: boolean) {
    const key = (addr as string).toLowerCase();
    if (!publicClient) return;
    if (!configRoleQuery.data) {
      setBlkErrors((p) => ({ ...p, [key]: "Not authorized (CONFIG role required)" }));
      return;
    }
    const raw = toTrue ? blkTextTrue[key] ?? "" : blkTextFalse[key] ?? "";
    const list = parseAddresses(raw);
    if (list.length === 0) {
      setBlkErrors((p) => ({ ...p, [key]: "Enter at least one valid address" }));
      return;
    }
    if (toTrue) setBlkBusyTrue((p) => ({ ...p, [key]: true }));
    else setBlkBusyFalse((p) => ({ ...p, [key]: true }));
    setBlkErrors((p) => ({ ...p, [key]: undefined }));
    type BlFnName = "setIsBlacklistedToTrue" | "setIsBlacklistedToFalse";
    const fn: BlFnName = toTrue ? "setIsBlacklistedToTrue" : "setIsBlacklistedToFalse";
    try {
      await publicClient.simulateContract({
        abi: ABI.BlacklistBasic,
        address: addr,
        functionName: fn,
        args: [list] as const,
        account: address,
      });
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.BlacklistBasic, ABI.AccessManager]);
      setBlkErrors((p) => ({ ...p, [key]: msg }));
      if (toTrue) setBlkBusyTrue((p) => ({ ...p, [key]: false }));
      else setBlkBusyFalse((p) => ({ ...p, [key]: false }));
      return;
    }
    try {
      const hash = await writeContractAsync({
        abi: ABI.BlacklistBasic,
        address: addr,
        functionName: fn,
        args: [list] as const,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      if (toTrue) setBlkTextTrue((p) => ({ ...p, [key]: "" }));
      else setBlkTextFalse((p) => ({ ...p, [key]: "" }));
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.BlacklistBasic, ABI.AccessManager]);
      setBlkErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      if (toTrue) setBlkBusyTrue((p) => ({ ...p, [key]: false }));
      else setBlkBusyFalse((p) => ({ ...p, [key]: false }));
    }
  }

  // RateLimit settings state
  const [rlToken, setRlToken] = useState<Record<string, string>>({});
  const [rlDepLimit, setRlDepLimit] = useState<Record<string, string>>({});
  const [rlWdrLimit, setRlWdrLimit] = useState<Record<string, string>>({});
  const [rlBusyLoad, setRlBusyLoad] = useState<Record<string, boolean>>({});
  const [rlBusySetDep, setRlBusySetDep] = useState<Record<string, boolean>>({});
  const [rlBusySetWdr, setRlBusySetWdr] = useState<Record<string, boolean>>({});
  const [rlErrors, setRlErrors] = useState<Record<string, string | undefined>>({});
  const [rlInfo, setRlInfo] = useState<
    Record<
      string,
      {
        windowSeconds?: bigint;
        depositLimit?: bigint;
        withdrawLimit?: bigint;
        depositUsed?: bigint;
        withdrawUsed?: bigint;
        depositWindowStart?: bigint;
        depositWindowUsed?: bigint;
        withdrawWindowStart?: bigint;
        withdrawWindowUsed?: bigint;
      }
    >
  >({});

  async function handleRLLoad(moduleAddr: Address) {
    const key = (moduleAddr as string).toLowerCase();
    const token = (rlToken[key] || "").trim();
    if (!isAddress(token)) {
      setRlErrors((p) => ({ ...p, [key]: "Enter a valid token address" }));
      return;
    }
    setRlBusyLoad((p) => ({ ...p, [key]: true }));
    setRlErrors((p) => ({ ...p, [key]: undefined }));
    try {
      const [windowSeconds, depLimit, wdrLimit, depUsed, wdrUsed, depWin, wdrWin] = await Promise.all([
        publicClient!.readContract({ abi: ABI.TokenRateLimit, address: moduleAddr, functionName: "WINDOW_SECONDS" }) as Promise<bigint>,
        publicClient!.readContract({ abi: ABI.TokenRateLimit, address: moduleAddr, functionName: "depositLimitPerToken", args: [token as Address] }) as Promise<bigint>,
        publicClient!.readContract({ abi: ABI.TokenRateLimit, address: moduleAddr, functionName: "withdrawLimitPerToken", args: [token as Address] }) as Promise<bigint>,
        publicClient!.readContract({ abi: ABI.TokenRateLimit, address: moduleAddr, functionName: "getCurrentDepositUsed", args: [token as Address] }) as Promise<bigint>,
        publicClient!.readContract({ abi: ABI.TokenRateLimit, address: moduleAddr, functionName: "getCurrentWithdrawUsed", args: [token as Address] }) as Promise<bigint>,
        publicClient!.readContract({ abi: ABI.TokenRateLimit, address: moduleAddr, functionName: "depositWindowPerToken", args: [token as Address] }) as Promise<[bigint, bigint]>,
        publicClient!.readContract({ abi: ABI.TokenRateLimit, address: moduleAddr, functionName: "withdrawWindowPerToken", args: [token as Address] }) as Promise<[bigint, bigint]>,
      ]);
      setRlInfo((p) => ({
        ...p,
        [key]: {
          windowSeconds,
          depositLimit: depLimit,
          withdrawLimit: wdrLimit,
          depositUsed: depUsed,
          withdrawUsed: wdrUsed,
          depositWindowStart: depWin[0],
          depositWindowUsed: depWin[1],
          withdrawWindowStart: wdrWin[0],
          withdrawWindowUsed: wdrWin[1],
        },
      }));
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.TokenRateLimit, ABI.AccessManager]);
      setRlErrors((p) => ({ ...p, [key]: msg }));
    } finally {
      setRlBusyLoad((p) => ({ ...p, [key]: false }));
    }
  }

  async function handleRLSet(moduleAddr: Address, kind: "deposit" | "withdraw") {
    if (!configRoleQuery.data) return;
    const key = (moduleAddr as string).toLowerCase();
    const token = (rlToken[key] || "").trim();
    if (!isAddress(token)) {
      setRlErrors((p) => ({ ...p, [key]: "Enter a valid token address" }));
      return;
    }
    const raw = kind === "deposit" ? rlDepLimit[key] : rlWdrLimit[key];
    let limit: bigint;
    try {
      limit = BigInt((raw || "").trim());
    } catch {
      setRlErrors((p) => ({ ...p, [key]: "Enter a valid integer limit" }));
      return;
    }
    if (kind === "deposit") setRlBusySetDep((p) => ({ ...p, [key]: true }));
    else setRlBusySetWdr((p) => ({ ...p, [key]: true }));
    setRlErrors((p) => ({ ...p, [key]: undefined }));
    type RlFnName = "setDepositLimit" | "setWithdrawLimit";
    const fn: RlFnName = kind === "deposit" ? "setDepositLimit" : "setWithdrawLimit";
    try {
      await publicClient!.simulateContract({
        abi: ABI.TokenRateLimit,
        address: moduleAddr,
        functionName: fn,
        args: [token as Address, limit] as const,
        account: address,
      });
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.TokenRateLimit, ABI.AccessManager]);
      setRlErrors((p) => ({ ...p, [key]: msg }));
      if (kind === "deposit") setRlBusySetDep((p) => ({ ...p, [key]: false }));
      else setRlBusySetWdr((p) => ({ ...p, [key]: false }));
      return;
    }
    try {
      const hash = await writeContractAsync({
        abi: ABI.TokenRateLimit,
        address: moduleAddr,
        functionName: fn,
        args: [token as Address, limit] as const,
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await handleRLLoad(moduleAddr);
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.TokenRateLimit, ABI.AccessManager]);
      setRlErrors((p) => ({ ...p, [key]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      if (kind === "deposit") setRlBusySetDep((p) => ({ ...p, [key]: false }));
      else setRlBusySetWdr((p) => ({ ...p, [key]: false }));
    }
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

  function extractReadableRevert(err: unknown, abis: Array<Abi | undefined>): string {
    const e = err as { message?: string; shortMessage?: string };
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

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [addBusy, setAddBusy] = useState<Record<string, boolean>>({});
  const [removeBusy, setRemoveBusy] = useState<Record<string, boolean>>({});

  type AddFnName = "addGuardModuleAccount" | "addGuardModuleDeposit" | "addGuardModuleWithdraw";
  type RemoveFnName = "removeGuardModuleAccount" | "removeGuardModuleDeposit" | "removeGuardModuleWithdraw";

  function fnFor(category: "account" | "deposit" | "withdraw", op: "add"): AddFnName;
  function fnFor(category: "account" | "deposit" | "withdraw", op: "remove"): RemoveFnName;
  function fnFor(category: "account" | "deposit" | "withdraw", op: "add" | "remove") {
    if (op === "add") {
      return category === "account"
        ? "addGuardModuleAccount"
        : category === "deposit"
        ? "addGuardModuleDeposit"
        : "addGuardModuleWithdraw";
    }
    return category === "account"
      ? "removeGuardModuleAccount"
      : category === "deposit"
      ? "removeGuardModuleDeposit"
      : "removeGuardModuleWithdraw";
  }

  async function invalidateLists() {
    await queryClient.invalidateQueries({ queryKey: ["guardbridge-modules", chainId, guardBridge] });
  }

  async function handleAdd(category: "account" | "deposit" | "withdraw") {
    if (!publicClient || !guardBridge || !metaQuery.data) return;
    if (!configRoleQuery.data) {
      setErrors((p) => ({ ...p, [category]: "Not authorized (CONFIG role required)" }));
      return;
    }
    const addr = (addAddress[category] || "").trim();
    if (!isAddress(addr)) {
      setErrors((p) => ({ ...p, [category]: "Enter a valid address" }));
      return;
    }
    setAddBusy((p) => ({ ...p, [category]: true }));
    setErrors((p) => ({ ...p, [category]: undefined }));
    const functionName: AddFnName = fnFor(category, "add");
    try {
      await publicClient.simulateContract({
        abi: ABI.GuardBridge,
        address: guardBridge,
        functionName,
        args: [addr as Address] as const,
        account: address,
      });
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.GuardBridge, ABI.AccessManager]);
      setErrors((p) => ({ ...p, [category]: msg }));
      setAddBusy((p) => ({ ...p, [category]: false }));
      return;
    }
    try {
      const hash = await writeContractAsync({
        abi: ABI.GuardBridge,
        address: guardBridge,
        functionName,
        args: [addr as Address] as const,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setAddAddress((p) => ({ ...p, [category]: "" }));
      setAddingOpen((p) => ({ ...p, [category]: false }));
      await invalidateLists();
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.GuardBridge, ABI.AccessManager]);
      setErrors((p) => ({ ...p, [category]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      setAddBusy((p) => ({ ...p, [category]: false }));
    }
  }

  async function handleRemove(category: "account" | "deposit" | "withdraw", target: Address) {
    if (!publicClient || !guardBridge || !metaQuery.data) return;
    if (!configRoleQuery.data) {
      setErrors((p) => ({ ...p, [category]: "Not authorized (CONFIG role required)" }));
      return;
    }
    const key = `${category}-${(target as string).toLowerCase()}`;
    setRemoveBusy((p) => ({ ...p, [key]: true }));
    setErrors((p) => ({ ...p, [category]: undefined }));
    const functionName: RemoveFnName = fnFor(category, "remove");
    try {
      await publicClient.simulateContract({
        abi: ABI.GuardBridge,
        address: guardBridge,
        functionName,
        args: [target] as const,
        account: address,
      });
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.GuardBridge, ABI.AccessManager]);
      setErrors((p) => ({ ...p, [category]: msg }));
      setRemoveBusy((p) => ({ ...p, [key]: false }));
      return;
    }
    try {
      const hash = await writeContractAsync({
        abi: ABI.GuardBridge,
        address: guardBridge,
        functionName,
        args: [target] as const,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await invalidateLists();
    } catch (err) {
      const msg = extractReadableRevert(err, [ABI.GuardBridge, ABI.AccessManager]);
      setErrors((p) => ({ ...p, [category]: /user rejected/i.test(msg) ? "Transaction canceled" : msg }));
    } finally {
      setRemoveBusy((p) => ({ ...p, [key]: false }));
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Guard Modules</CardTitle>
        </CardHeader>
        <CardContent>
          {!guardBridge ? (
            <div className="text-sm text-red-600">GuardBridge address not configured for this chain.</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              View configured modules for the GuardBridge.
            </div>
          )}
          <div className="mt-2 text-xs">
            <span className={configRoleQuery.data ? "text-green-600" : "text-red-600"}>
              {configRoleQuery.data ? "✓" : "x"}
            </span>{" "}
            {address
              ? configRoleQuery.data
                ? "Connected wallet has CONFIG role"
                : "Connected wallet lacks CONFIG role"
              : "Connect wallet to manage modules"}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(["account", "deposit", "withdraw"] as const).map((k, idx) => {
          const listQuery = lists[idx];
          const title =
            k === "account" ? "Account Modules" : k === "deposit" ? "Deposit Modules" : "Withdraw Modules";
          const count = (listQuery.data ?? []).length;
          const currentSet = new Set((listQuery.data ?? []).map((a) => (a as string).toLowerCase()));
          return (
            <Card key={k}>
              <CardHeader>
                <CardTitle>
                  {title} {guardBridge && metaQuery.data ? <span className="text-sm text-muted-foreground">({count})</span> : null}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!guardBridge ? (
                  <div className="text-sm text-muted-foreground">Unavailable on this chain.</div>
                ) : !metaQuery.data ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : (listQuery.data ?? []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No modules configured.
                    {" "}
                    {address
                      ? configRoleQuery.data
                        ? "Use Add to register a module."
                        : "Only CONFIG can add modules."
                      : "Connect wallet to manage modules."}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {listQuery.data!.map((addr) => {
                      const label = getKnownAddressLabel(chainId, addr) ?? addr;
                      const href = getAddressExplorerUrl(chainId, addr);
                      const t = moduleTypeByAddr[(addr as string).toLowerCase()];
                      const canOpenSettings = t === "blacklist" || t === "ratelimit";
                      const removeKey = `${k}-${(addr as string).toLowerCase()}`;
                      return (
                        <div key={(addr as string).toLowerCase()} className="flex items-center gap-2">
                          <Badge className="w-fit">
                            <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                              {label}
                            </a>
                          </Badge>
                          {t && <span className="text-xs text-muted-foreground">{t === "blacklist" ? "Blacklist" : "RateLimit"}</span>}
                          {canOpenSettings && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() =>
                                setSettingsOpen((p) => ({
                                  ...p,
                                  [(addr as string).toLowerCase()]: !p[(addr as string).toLowerCase()],
                                }))
                              }
                            >
                              {settingsOpen[(addr as string).toLowerCase()] ? "Hide settings" : "Settings"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            title="Remove"
                            onClick={() => handleRemove(k, addr as Address)}
                            disabled={!configRoleQuery.data || Boolean(removeBusy[removeKey])}
                          >
                            {removeBusy[removeKey] ? "Removing…" : <X className="w-3 h-3" />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-accent"
                    onClick={() => setAddingOpen((p) => ({ ...p, [k]: !p[k] }))}
                    title="Add module"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                {addingOpen[k] ? (
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label>Known module</Label>
                      <Select
                        value={""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const found = knownModules.find((m) => m.key === v);
                          if (found?.address) setAddAddress((p) => ({ ...p, [k]: found.address as string }));
                        }}
                      >
                        <option value="">Custom address…</option>
                        {knownModules.map((m) => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label>Module address</Label>
                      <Input
                        placeholder="0x..."
                        value={addAddress[k] ?? ""}
                        onChange={(e) => setAddAddress((p) => ({ ...p, [k]: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button
                        onClick={() => handleAdd(k)}
                        disabled={
                          !configRoleQuery.data ||
                          Boolean(addBusy[k]) ||
                          !isAddress(addAddress[k] ?? "") ||
                          currentSet.has((addAddress[k] ?? "").toLowerCase())
                        }
                        title={
                          !isAddress(addAddress[k] ?? "")
                            ? "Enter a valid address"
                            : currentSet.has((addAddress[k] ?? "").toLowerCase())
                            ? "Already added"
                            : undefined
                        }
                      >
                        {addBusy[k] ? "Adding…" : "Add"}
                      </Button>
                    </div>
                  </div>
                ) : null}
                {errors[k] && <div className="mt-2 text-xs text-red-600">{errors[k]}</div>}
                {/* Blacklist settings panel */}
                {(listQuery.data ?? []).map((addr) => {
                  const key = (addr as string).toLowerCase();
                  const t = moduleTypeByAddr[key];
                  if (t !== "blacklist" || !settingsOpen[key]) return null;
                  return (
                    <div key={`blk-${key}`} className="mt-3 border rounded-md p-3 grid gap-3">
                      <div className="text-sm font-medium">BlacklistBasic Settings</div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label>Blacklist addresses (set true)</Label>
                          <textarea
                            className="w-full min-h-[96px] max-h-48 border rounded-md p-2 text-sm overflow-auto whitespace-pre-wrap break-words"
                            placeholder="0x..., 0x..., one per line or comma-separated"
                            value={blkTextTrue[key] ?? ""}
                            onChange={(e) => setBlkTextTrue((p) => ({ ...p, [key]: e.target.value }))}
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => handleBlacklistSet(addr as Address, true)} disabled={!configRoleQuery.data || Boolean(blkBusyTrue[key])}>
                              {blkBusyTrue[key] ? "Applying…" : "Apply"}
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-1.5">
                          <Label>Unblacklist addresses (set false)</Label>
                          <textarea
                            className="w-full min-h-[96px] max-h-48 border rounded-md p-2 text-sm overflow-auto whitespace-pre-wrap break-words"
                            placeholder="0x..., 0x..., one per line or comma-separated"
                            value={blkTextFalse[key] ?? ""}
                            onChange={(e) => setBlkTextFalse((p) => ({ ...p, [key]: e.target.value }))}
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => handleBlacklistSet(addr as Address, false)} disabled={!configRoleQuery.data || Boolean(blkBusyFalse[key])}>
                              {blkBusyFalse[key] ? "Applying…" : "Apply"}
                            </Button>
                          </div>
                        </div>
                      </div>
                      {blkErrors[key] && <div className="text-xs text-red-600">{blkErrors[key]}</div>}
                    </div>
                  );
                })}
                {/* RateLimit settings panel */}
                {(listQuery.data ?? []).map((addr) => {
                  const key = (addr as string).toLowerCase();
                  const t = moduleTypeByAddr[key];
                  if (t !== "ratelimit" || !settingsOpen[key]) return null;
                  const info = rlInfo[key] || {};
                  return (
                    <div key={`rl-${key}`} className="mt-3 border rounded-md p-3 grid gap-3">
                      <div className="text-sm font-medium">TokenRateLimit Settings</div>
                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="grid gap-1.5">
                          <Label>Token</Label>
                          <Input
                            placeholder="0x..."
                            value={rlToken[key] ?? ""}
                            onChange={(e) => setRlToken((p) => ({ ...p, [key]: e.target.value }))}
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <Button size="sm" onClick={() => handleRLLoad(addr as Address)} disabled={!address || Boolean(rlBusyLoad[key])}>
                            {rlBusyLoad[key] ? "Loading…" : "Load"}
                          </Button>
                        </div>
                        {info.windowSeconds !== undefined && (
                          <div className="grid text-xs text-muted-foreground">
                            <div>Window: {String(info.windowSeconds)} s</div>
                          </div>
                        )}
                      </div>
                      {info.depositLimit !== undefined && (
                        <div className="grid gap-2 md:grid-cols-3">
                          <div className="grid gap-1.5">
                            <Label>Deposit limit</Label>
                            <Input
                              placeholder="0 (unlimited)"
                              value={rlDepLimit[key] ?? String(info.depositLimit)}
                              onChange={(e) => setRlDepLimit((p) => ({ ...p, [key]: e.target.value }))}
                            />
                            <div className="text-xs text-muted-foreground">
                              Used: {String(info.depositUsed ?? 0n)} | Window used: {String(info.depositWindowUsed ?? 0n)}
                            </div>
                          </div>
                          <div className="flex items-end gap-2">
                            <Button size="sm" onClick={() => handleRLSet(addr as Address, "deposit")} disabled={!address || Boolean(rlBusySetDep[key])}>
                              {rlBusySetDep[key] ? "Setting…" : "Set"}
                            </Button>
                          </div>
                        </div>
                      )}
                      {info.withdrawLimit !== undefined && (
                        <div className="grid gap-2 md:grid-cols-3">
                          <div className="grid gap-1.5">
                            <Label>Withdraw limit</Label>
                            <Input
                              placeholder="0 (unlimited)"
                              value={rlWdrLimit[key] ?? String(info.withdrawLimit)}
                              onChange={(e) => setRlWdrLimit((p) => ({ ...p, [key]: e.target.value }))}
                            />
                            <div className="text-xs text-muted-foreground">
                              Used: {String(info.withdrawUsed ?? 0n)} | Window used: {String(info.withdrawWindowUsed ?? 0n)}
                            </div>
                          </div>
                          <div className="flex items-end gap-2">
                            <Button size="sm" onClick={() => handleRLSet(addr as Address, "withdraw")} disabled={!address || Boolean(rlBusySetWdr[key])}>
                              {rlBusySetWdr[key] ? "Setting…" : "Set"}
                            </Button>
                          </div>
                        </div>
                      )}
                      {rlErrors[key] && <div className="text-xs text-red-600">{rlErrors[key]}</div>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


