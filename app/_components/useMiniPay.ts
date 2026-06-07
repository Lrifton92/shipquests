"use client";
// MiniPay connection hook. MiniPay injects an EIP-1193 provider on window.ethereum
// and auto-approves eth_requestAccounts inside the MiniPay browser. Outside MiniPay
// (desktop dev) the same flow works with any injected Celo wallet, and `connect()`
// lets the user trigger it manually if auto-connect was dismissed.
import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { celo } from "viem/chains";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMiniPay?: boolean;
};
type EthereumWindow = { ethereum?: Eip1193 & { providers?: Eip1193[] } };

// Resolves the best injected provider. With multiple wallets (Rabby + Brave, etc.)
// EIP-1193 exposes `window.ethereum.providers`; prefer MiniPay, else any provider.
function getProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as EthereumWindow).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers.find((p) => p.isMiniPay) ?? eth.providers[0];
  }
  return eth;
}

export function useMiniPay() {
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [hasProvider, setHasProvider] = useState(false);

  const connect = useCallback(async () => {
    // Re-check at click time: the provider may have injected after mount.
    const eth = getProvider();
    if (!eth) {
      setConnecting(false);
      return null;
    }
    setHasProvider(true);
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
    let cancelled = false;

    // Try now, after the `ethereum#initialized` event, and after short delays —
    // injected providers (Rabby, MetaMask) can attach to window after first paint.
    const tryDetect = () => {
      if (cancelled) return false;
      const eth = getProvider();
      if (!eth) return false;
      setHasProvider(true);
      // Silent auto-connect: MiniPay approves without a prompt; other wallets
      // surface their own approval, which the user can dismiss.
      void connect();
      return true;
    };

    if (tryDetect()) return;

    const onInit = () => tryDetect();
    window.addEventListener("ethereum#initialized", onInit, { once: true });

    const timers = [100, 400, 1500].map((ms) => window.setTimeout(tryDetect, ms));

    // No provider found yet — stop the initial spinner so the connect CTA shows.
    const stopSpinner = window.setTimeout(() => {
      if (!cancelled && !getProvider()) setConnecting(false);
    }, 1600);

    return () => {
      cancelled = true;
      window.removeEventListener("ethereum#initialized", onInit);
      timers.forEach(clearTimeout);
      clearTimeout(stopSpinner);
    };
  }, [connect]);

  // walletClient is recreated each render but it is a thin wrapper over the
  // injected provider — no connection cost. null when no provider (SSR/no wallet).
  const eth = getProvider();
  const client: WalletClient | null = eth
    ? createWalletClient({ chain: celo, transport: custom(eth) })
    : null;

  return { address, client, connect, connecting, hasProvider };
}
