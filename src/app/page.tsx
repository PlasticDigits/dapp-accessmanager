"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract, useReadContracts } from "wagmi";
import type { Address, Hex } from "viem";
import { encodeFunctionData, isAddress } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { ROLE, getAccessManagerAddress, getKnownAddressLabel } from "@/lib/contracts";
import { ABI } from "@/lib/abi";
import { fetchRoleMembers } from "@/lib/roleMembers";
import { useQueries, useQueryClient } from "@tanstack/react-query";

export default function Home() {
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

  const membersQueries = useQueries({
    queries: roles.map((r) => ({
      queryKey: ["role-members", chainId, accessManager, r.id.toString()],
      queryFn: () => fetchRoleMembers(publicClient!, chainId, r.id),
      enabled: Boolean(publicClient),
      staleTime: 60_000,
      refetchInterval: 30_000,
    })),
  });

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

      <Card>
        <CardHeader>
          <CardTitle>Grant Role</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="grantAddress">Address</Label>
            <Input id="grantAddress" placeholder="0x..." value={grantAddress} onChange={(e) => setGrantAddress(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button disabled>Grant (connect + permissions needed)</Button>
          </div>
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
                {membersQueries[idx].data!.map((m: { account: string }) => (
                  <Badge key={m.account}>{getKnownAddressLabel(chainId, m.account as Address) ?? m.account}</Badge>
                ))}
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
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="grantAddress">Address</Label>
            <Input id="grantAddress" placeholder="0x..." value={grantAddress} onChange={(e) => setGrantAddress(e.target.value)} />
          </div>
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
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="revokeAddress">Address</Label>
            <Input id="revokeAddress" placeholder="0x..." value={revokeAddress} onChange={(e) => setRevokeAddress(e.target.value)} />
          </div>
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
          <div className="flex items-end gap-2">
            <Button onClick={handleRevoke} disabled={!address || isRevoking}>
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
    </div>
  );
}
