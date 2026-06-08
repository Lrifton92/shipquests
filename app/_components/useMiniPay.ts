"use client";
// Wallet connection hook. Two paths, injected first:
//   1. Injected EIP-1193 provider (window.ethereum) — MiniPay auto-approves inside
//      its browser; any injected Celo wallet (Valora in-app, MetaMask, Rabby…)
//      works too. This is detected at mount and auto-connected silently.
//   2. WalletConnect fallback — when NO injected provider exists (a plain mobile
//      browser, e.g. someone opening a shared link in Safari/Chrome), clicking
//      connect() opens the WalletConnect modal (QR on desktop, wallet deeplinks on
//      mobile) so the user can pair Valora / MetaMask / Rainbow / etc. The WC
//      provider is an EIP-1193 provider too, so the rest of the app (viem
//      walletClient + writeContract) is unchanged.
// WalletConnect is NEVER triggered automatically on load — only on an explicit
// connect() click that finds no injected provider — so it never pops a modal
// unprompted.
import { useCallback, useEffect, useRef, useState } from "react";
import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { celo } from "viem/chains";

// Public WalletConnect/Reown project id (client-side identifier, not a secret).
// Overridable via env; falls back to the configured project.
const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "002fbc5b5715175bbcbed26658dceb23";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMiniPay?: boolean;
};
type EthereumWindow = { ethereum?: Eip1193 & { providers?: Eip1193[] } };

// Minimal shape of the WalletConnect EthereumProvider we rely on.
type WcProvider = Eip1193 & {
  accounts: string[];
  connect: () => Promise<void>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

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
  // A connected WalletConnect provider (only set when the injected path is absent
  // and the user connects via the WC modal). Kept in state so `client` rebuilds.
  const [wcProvider, setWcProvider] = useState<WcProvider | null>(null);
  const wcRef = useRef<WcProvider | null>(null);

  // Lazily build (once) and connect a WalletConnect provider. Dynamically imported
  // so it stays out of the initial bundle and never runs on the server.
  const connectWalletConnect = useCallback(async (): Promise<Address | null> => {
    const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
    let wc = wcRef.current;
    if (!wc) {
      wc = (await EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        chains: [celo.id],
        optionalChains: [celo.id],
        showQrModal: true,
        methods: [
          "eth_sendTransaction",
          "personal_sign",
          "eth_signTypedData",
          "eth_signTypedData_v4",
          "wallet_switchEthereumChain",
          "wallet_addEthereumChain",
        ],
        events: ["chainChanged", "accountsChanged", "disconnect"],
        metadata: {
          name: "ShipQuests",
          description: "Earn cUSD on Celo — complete simple onchain actions.",
          url: "https://shipquests.vercel.app",
          icons: ["https://shipquests.vercel.app/icon.png"],
        },
      })) as unknown as WcProvider;
      wcRef.current = wc;
      // Keep local state in sync if the wallet ends the session or switches account.
      wc.on("disconnect", () => {
        setAddress(null);
        setWcProvider(null);
      });
      wc.on("accountsChanged", (...args: unknown[]) => {
        const accs = args[0] as string[] | undefined;
        setAddress((accs?.[0] as Address) ?? null);
      });
    }
    if (!wc.accounts || wc.accounts.length === 0) {
      await wc.connect(); // opens the WC modal (QR on desktop, deeplinks on mobile)
    }
    const acct = (wc.accounts?.[0] as Address) ?? null;
    setWcProvider(wc);
    setHasProvider(true);
    setAddress(acct);
    return acct;
  }, []);

  const connect = useCallback(async (): Promise<Address | null> => {
    // Re-check at click time: the provider may have injected after mount.
    const eth = getProvider();
    if (!eth) {
      // No injected wallet (typical plain mobile browser) → WalletConnect modal.
      setConnecting(true);
      try {
        return await connectWalletConnect();
      } catch {
        return null;
      } finally {
        setConnecting(false);
      }
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
  }, [connectWalletConnect]);

  useEffect(() => {
    let cancelled = false;

    // Try now, after the `ethereum#initialized` event, and after short delays —
    // injected providers (Rabby, MetaMask) can attach to window after first paint.
    // NOTE: this only auto-connects an INJECTED provider; it never triggers the
    // WalletConnect modal (tryDetect returns early when no injected provider).
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

  // walletClient is recreated each render but it is a thin wrapper over the active
  // provider — no connection cost. Prefers the injected provider; falls back to a
  // connected WalletConnect provider. null when neither exists (SSR/no wallet).
  const activeProvider = getProvider() ?? wcProvider;
  const client: WalletClient | null = activeProvider
    ? createWalletClient({ chain: celo, transport: custom(activeProvider) })
    : null;

  return { address, client, connect, connecting, hasProvider };
}
