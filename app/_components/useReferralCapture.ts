"use client";
// Captures the ?ref=<address> in the URL and links it to the connected wallet.
//
// Flow:
//   1. On mount, read ?ref from the URL. If it's a valid address, persist it to
//      localStorage (shipquests-ref) and clean it out of the URL (cosmetic).
//   2. When a wallet connects (address available) and a stored ref exists, POST
//      /api/referral/link { wallet, ref } exactly once, then mark it done in
//      localStorage so we never POST again. ref === wallet (self) is skipped.
//
// This never touches the connection flow itself — it only observes `address`
// from useMiniPay and fires a fire-and-forget POST. It also exposes the captured
// ref + a "wasReferred" flag for the optional referral banner.
import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { useMiniPay } from "./useMiniPay";

const REF_KEY = "shipquests-ref";
const LINKED_KEY = "shipquests-ref-linked";

function readStored(): string | null {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export function useReferralCapture(): { ref: string | null; wasReferred: boolean } {
  const { address } = useMiniPay();
  const [ref, setRef] = useState<string | null>(null);

  // 1) Capture ?ref from the URL once, on mount.
  useEffect(() => {
    let captured = readStored();
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get("ref");
      if (fromUrl && isAddress(fromUrl)) {
        captured = fromUrl;
        localStorage.setItem(REF_KEY, fromUrl);
        // Strip ?ref from the address bar without a navigation/reload.
        url.searchParams.delete("ref");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* URL/storage unavailable — keep whatever was stored */
    }
    if (captured) setRef(captured);
  }, []);

  // 2) Link the stored ref to the wallet once it connects.
  useEffect(() => {
    if (!address) return;
    const stored = readStored();
    if (!stored || !isAddress(stored)) return;
    if (stored.toLowerCase() === address.toLowerCase()) return; // no self-referral
    let alreadyLinked = false;
    try {
      alreadyLinked = localStorage.getItem(LINKED_KEY) === address.toLowerCase();
    } catch {
      /* ignore */
    }
    if (alreadyLinked) return;

    void fetch("/api/referral/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: address, ref: stored }),
    })
      .then(() => {
        try {
          localStorage.setItem(LINKED_KEY, address.toLowerCase());
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* network down — will retry on next connect */
      });
  }, [address]);

  return { ref, wasReferred: ref !== null };
}
