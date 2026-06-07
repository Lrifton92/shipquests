"use client";
// Settings: wallet status + connect/disconnect, language (UI-only placeholder),
// contract link on Celoscan, about + version. Read-only — no contract writes.
import { useState, type CSSProperties } from "react";
import styles from "./settings.module.css";
import { useMiniPay } from "../_components/useMiniPay";
import { shortAddress } from "@/lib/quest-list";
import { QUEST_ESCROW_ADDRESS } from "@/lib/quest-abi";

const APP_VERSION = "0.1.0";
const CELOSCAN = `https://celoscan.io/address/${QUEST_ESCROW_ADDRESS}`;

// UI-only for now. EN is wired; the rest are visual placeholders until i18n lands.
const LANGS = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
] as const;

export default function Settings() {
  const { address, connect, connecting, hasProvider } = useMiniPay();
  const [lang, setLang] = useState<(typeof LANGS)[number]["code"]>("en");
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — silent no-op */
    }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.head}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.sub}>Your wallet, language and app info.</p>
      </header>

      {/* Wallet --------------------------------------------------------- */}
      <section className={`${styles.card} reveal`} style={{ "--i": 1 } as CSSProperties}>
        <div className={styles.cardLabel}>Wallet</div>
        {address ? (
          <>
            <div className={styles.walletRow}>
              <span className={styles.walletDot} aria-hidden />
              <button
                type="button"
                className={`${styles.walletAddr} mono`}
                onClick={() => void copyAddress()}
                title="Tap to copy full address"
              >
                {shortAddress(address)}
              </button>
              <span className={`${styles.copied} ${copied ? styles.copiedOn : ""}`} aria-live="polite">
                Copied
              </span>
            </div>
            <p className={styles.note}>
              Connected via MiniPay. To switch accounts, change the active account in your wallet.
            </p>
          </>
        ) : (
          <>
            <p className={styles.note}>
              {hasProvider
                ? "No wallet connected yet."
                : "Open ShipQuests inside MiniPay to connect your wallet."}
            </p>
            <button
              className={styles.connectBtn}
              onClick={() => void connect()}
              disabled={!hasProvider || connecting}
            >
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          </>
        )}
      </section>

      {/* Language ------------------------------------------------------- */}
      <section className={`${styles.card} reveal`} style={{ "--i": 2 } as CSSProperties}>
        <div className={styles.cardLabel}>Language</div>
        <div className={styles.langGrid} role="radiogroup" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={lang === l.code}
              className={`${styles.langBtn} ${lang === l.code ? styles.langOn : ""}`}
              onClick={() => setLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className={styles.note}>More languages coming soon — English is fully supported today.</p>
      </section>

      {/* Contract ------------------------------------------------------- */}
      <section className={`${styles.card} reveal`} style={{ "--i": 3 } as CSSProperties}>
        <div className={styles.cardLabel}>Contract</div>
        <a className={styles.link} href={CELOSCAN} target="_blank" rel="noopener noreferrer">
          <span>
            <span className={styles.linkTitle}>QuestEscrow on Celoscan</span>
            <span className={`${styles.linkAddr} mono`}>{shortAddress(QUEST_ESCROW_ADDRESS)}</span>
          </span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
            <path d="M8 16 16 8M9.5 8H16v6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </section>

      {/* About ---------------------------------------------------------- */}
      <section className={`${styles.card} reveal`} style={{ "--i": 4 } as CSSProperties}>
        <div className={styles.cardLabel}>About</div>
        <p className={styles.about}>
          <b>ShipQuests</b> — complete simple onchain actions, claim cUSD rewards. Rewards are held
          in escrow on Celo and released the moment you verify.
        </p>
        <div className={styles.metaRow}>
          <span className={styles.builtOn}>
            Built on <b>Celo</b>
          </span>
          <span className={`${styles.version} mono`}>v{APP_VERSION}</span>
        </div>
      </section>
    </main>
  );
}
