"use client";
// Compact wallet status chip used in page headers. When disconnected it always
// shows an actionable gold "Connect wallet" button (a click re-tries provider
// detection even if none was found yet), plus an (i) help popover explaining how
// to connect inside the MiniPay mobile app.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { shortAddress } from "@/lib/quest-list";
import { useT } from "./i18n";
import styles from "./WalletChip.module.css";

type Props = {
  address: string | null;
  connecting: boolean;
  hasProvider: boolean;
  onConnect: () => void;
};

export function WalletChip({ address, connecting, onConnect }: Props) {
  const t = useT();

  if (address) {
    return (
      <span className={`${styles.chip} ${styles.connected} mono`} title={address}>
        <span className={styles.dot} aria-hidden />
        {shortAddress(address)}
      </span>
    );
  }

  // Disconnected: always offer the connect action. The click re-checks the
  // provider, so it works even when none was detected at mount.
  return (
    <span className={styles.group}>
      <button
        className={`${styles.chip} ${styles.action}`}
        onClick={onConnect}
        disabled={connecting}
      >
        {connecting ? t("wallet.connecting") : t("wallet.connectFull")}
      </button>
      <HelpPopover label={t("wallet.help.trigger")}>
        <p className={styles.helpTitle}>{t("wallet.help.title")}</p>
        <p className={styles.helpBody}>{t("wallet.help.mobile")}</p>
        <p className={styles.helpBody}>{t("wallet.help.desktop")}</p>
      </HelpPopover>
    </span>
  );
}

// Tiny dependency-free popover: opens on click, closes on outside click or Esc.
function HelpPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className={styles.help} ref={wrapRef}>
      <button
        type="button"
        className={styles.helpTrigger}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        i
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </span>
  );
}
