"use client";
// Invite: share your referral link, see active referees + claimable bonuses,
// and jump to the referral quest to claim a bonus. Read-only off-chain stats
// (GET /api/referral/stats); the actual bonus is claimed via the normal quest
// flow on the referral quest page.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import styles from "./invite.module.css";
import { useMiniPay } from "../_components/useMiniPay";
import { useT } from "../_components/i18n";
import { Arrow } from "../_components/Arrow";

const REFERRAL_QUEST_ID = process.env.NEXT_PUBLIC_REFERRAL_QUEST_ID;

export default function Invite() {
  const t = useT();
  const { address, connect, connecting, hasProvider } = useMiniPay();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{ active: number; eligible: number } | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // The share link encodes the connected wallet as the sponsor.
  const link = address ? `${origin}?ref=${address}` : "";

  const loadStats = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/referral/stats?wallet=${address}`);
      if (res.ok) setStats((await res.json()) as { active: number; eligible: number });
    } catch {
      /* stats stay null — the cards show 0 */
    }
  }, [address]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — silent */
    }
  };

  const share = async () => {
    if (!link) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "ShipQuests", text: t("referral.share.text"), url: link });
      } catch {
        /* user cancelled — no-op */
      }
    } else {
      void copy();
    }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t("referral.title")}</h1>
        <p className={styles.sub}>{t("referral.sub")}</p>
      </header>

      {!address ? (
        <section className={`${styles.card} reveal`} style={{ "--i": 1 } as CSSProperties}>
          <div className={styles.cardLabel}>{t("referral.connect.label")}</div>
          <p className={styles.note}>
            {hasProvider ? t("referral.connect.note") : t("settings.wallet.openInMinipay")}
          </p>
          <button
            className={styles.connectBtn}
            onClick={() => void connect()}
            disabled={!hasProvider || connecting}
          >
            {connecting ? t("wallet.connecting") : t("wallet.connectFull")}
          </button>
        </section>
      ) : (
        <>
          {/* Share link --------------------------------------------------- */}
          <section className={`${styles.card} reveal`} style={{ "--i": 1 } as CSSProperties}>
            <div className={styles.cardLabel}>{t("referral.link.label")}</div>
            <div className={styles.linkBox}>
              <span className={`${styles.linkUrl} mono`}>{link}</span>
            </div>
            <div className={styles.btnRow}>
              <button
                type="button"
                className={`${styles.actionBtn} ${copied ? styles.copied : ""}`}
                onClick={() => void copy()}
              >
                {copied ? t("referral.copied") : t("referral.copy")}
              </button>
              <button type="button" className={styles.actionBtn} onClick={() => void share()}>
                {t("referral.share")}
                <Arrow variant="diag" size={15} />
              </button>
            </div>
            <p className={styles.note}>{t("referral.link.note")}</p>
          </section>

          {/* Stats -------------------------------------------------------- */}
          <section className={`${styles.card} reveal`} style={{ "--i": 2 } as CSSProperties}>
            <div className={styles.cardLabel}>{t("referral.stats.label")}</div>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={`${styles.statValue} mono`}>{stats?.active ?? 0}</span>
                <span className={styles.statLabel}>{t("referral.stats.active")}</span>
              </div>
              <div className={styles.stat}>
                <span className={`${styles.statValue} ${styles.eligible} mono`}>{stats?.eligible ?? 0}</span>
                <span className={styles.statLabel}>{t("referral.stats.eligible")}</span>
              </div>
            </div>
            {REFERRAL_QUEST_ID && (stats?.eligible ?? 0) > 0 && (
              <Link href={`/quest/${REFERRAL_QUEST_ID}`} className={styles.claimLink}>
                {t("referral.claim.cta")}
                <Arrow variant="right" size={16} />
              </Link>
            )}
            <p className={styles.note}>{t("referral.stats.note")}</p>
          </section>

          {/* How it works ------------------------------------------------- */}
          <section className={`${styles.card} reveal`} style={{ "--i": 3 } as CSSProperties}>
            <div className={styles.cardLabel}>{t("referral.how.label")}</div>
            <ol className={styles.steps}>
              <li className={styles.stepItem}>
                <span className={styles.stepNum}>1</span>
                {t("referral.how.s1")}
              </li>
              <li className={styles.stepItem}>
                <span className={styles.stepNum}>2</span>
                {t("referral.how.s2")}
              </li>
              <li className={styles.stepItem}>
                <span className={styles.stepNum}>3</span>
                {t("referral.how.s3")}
              </li>
            </ol>
          </section>
        </>
      )}
    </main>
  );
}
