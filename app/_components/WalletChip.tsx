"use client";
// Compact wallet status chip used in page headers. Shows connect CTA, connecting
// state, or the short address once connected.
import { shortAddress } from "@/lib/quest-list";
import styles from "./WalletChip.module.css";

type Props = {
  address: string | null;
  connecting: boolean;
  hasProvider: boolean;
  onConnect: () => void;
};

export function WalletChip({ address, connecting, hasProvider, onConnect }: Props) {
  if (address) {
    return (
      <span className={`${styles.chip} ${styles.connected} mono`} title={address}>
        <span className={styles.dot} aria-hidden />
        {shortAddress(address)}
      </span>
    );
  }
  if (!hasProvider) {
    return (
      <span className={`${styles.chip} ${styles.muted}`} title="Open in MiniPay to connect">
        No wallet
      </span>
    );
  }
  return (
    <button className={`${styles.chip} ${styles.action}`} onClick={onConnect} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect"}
    </button>
  );
}
