"use client";
// MiniPay connection hook. MiniPay injects an EIP-1193 provider on window.ethereum
// and auto-approves eth_requestAccounts inside the MiniPay browser. Outside MiniPay
// (desktop dev) the same flow works with any injected Celo wallet, and `connect()`
// lets the user trigger it manually if auto-connect was dismissed.
import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { celo } from "viem/chains";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

function getProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

export function useMiniPay() {
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [hasProvider, setHasProvider] = useState(false);

  const connect = useCallback(async () => {
    const eth = getProvider();
    if (!eth) {
      setConnecting(false);
      return null;
    }
    setConnecting(true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
      const acct = accounts[0] ?? null;
      setAddress(acct);
      return acct;
    } catch {
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    const eth = getProvider();
    setHasProvider(!!eth);
    if (!eth) {
      setConnecting(false);
      return;
    }
    // Silent auto-connect: MiniPay approves without a prompt.
    void connect();
  }, [connect]);

  // walletClient is recreated each render but it is a thin wrapper over the
  // injected provider — no connection cost. null when no provider (SSR/no wallet).
  const eth = getProvider();
  const client: WalletClient | null = eth
    ? createWalletClient({ chain: celo, transport: custom(eth) })
    : null;

  return { address, client, connect, connecting, hasProvider };
}
