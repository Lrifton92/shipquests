"use client";
// Settings: wallet status + connect/disconnect, language (UI-only placeholder),
// contract link on Celoscan, about + version. Read-only — no contract writes.
import { useState, type CSSProperties } from "react";
import styles from "./settings.module.css";
import { useMiniPay } from "../_components/useMiniPay";
import { useT, useLang, LANGS } from "../_components/i18n";
import { shortAddress } from "@/lib/quest-list";
import { QUEST_ESCROW_ADDRESS } from "@/lib/quest-abi";

const APP_VERSION = "0.1.0";
const CELOSCAN = `https://celoscan.io/address/${QUEST_ESCROW_ADDRESS}`;

export default function Settings() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { address, connect, connecting, hasProvider } = useMiniPay();
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
        <h1 className={styles.title}>{t("settings.title")}</h1>
        <p className={styles.sub}>{t("settings.sub")}</p>
      </header>

      {/* Wallet --------------------------------------------------------- */}
      <section className={`${styles.card} reveal`} style={{ "--i": 1 } as CSSProperties}>
        <div className={styles.cardLabel}>{t("settings.wallet")}</div>
        {address ? (
          <>
            <div className={styles.walletRow}>
              <span className={styles.walletDot} aria-hidden />
              <button
                type="button"
                className={`${styles.walletAddr} mono`}
                onClick={() => void copyAddress()}
                title={t("settings.wallet.copyTitle")}
              >
                {shortAddress(address)}
              </button>
              <span className={`${styles.copied} ${copied ? styles.copiedOn : ""}`} aria-live="polite">
                {t("settings.wallet.copied")}
              </span>
            </div>
            <p className={styles.note}>{t("settings.wallet.connectedNote")}</p>
          </>
        ) : (
          <>
            <p className={styles.note}>
              {hasProvider
                ? t("settings.wallet.noneNote")
                : t("settings.wallet.openInMinipay")}
            </p>
            <button
              className={styles.connectBtn}
              onClick={() => void connect()}
              disabled={connecting}
            >
              {connecting ? t("wallet.connecting") : t("wallet.connectFull")}
            </button>
          </>
        )}
      </section>

      {/* Language ------------------------------------------------------- */}
      <section className={`${styles.card} reveal`} style={{ "--i": 2 } as CSSProperties}>
        <div className={styles.cardLabel}>{t("settings.language")}</div>
        <div className={styles.langGrid} role="radiogroup" aria-label={t("settings.language")}>
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
        <p className={styles.note}>{t("settings.language.note")}</p>
      </section>

      {/* Contract ------------------------------------------------------- */}
      <section className={`${styles.card} reveal`} style={{ "--i": 3 } as CSSProperties}>
        <div className={styles.cardLabel}>{t("settings.contract")}</div>
        <a className={styles.link} href={CELOSCAN} target="_blank" rel="noopener noreferrer">
          <span>
            <span className={styles.linkTitle}>{t("settings.contract.title")}</span>
            <span className={`${styles.linkAddr} mono`}>{shortAddress(QUEST_ESCROW_ADDRESS)}</span>
          </span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
            <path d="M8 16 16 8M9.5 8H16v6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </section>

      {/* About ---------------------------------------------------------- */}
      <section className={`${styles.card} reveal`} style={{ "--i": 4 } as CSSProperties}>
        <div className={styles.cardLabel}>{t("settings.about")}</div>
        <p className={styles.about}>
          <b>ShipQuests</b> — {t("settings.about.body")}
        </p>
        <div className={styles.metaRow}>
          <span className={styles.builtOn}>
            {t("settings.about.builtOn")} <b>Celo</b>
          </span>
          <span className={`${styles.version} mono`}>{t("settings.about.version", { version: APP_VERSION })}</span>
        </div>
      </section>
    </main>
  );
}
