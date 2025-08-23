"use client";

import { useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import type { Address, Hex } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ABI } from "@/lib/abi";
import { CHAIN_REGISTRY_ADDRESS, TOKEN_REGISTRY_ADDRESS } from "@/lib/contracts";
import { isAddress } from "viem";

export default function RegistryPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

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
    } finally {
      setIsTokenDestSubmitting(false);
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
    </div>
  );
}


