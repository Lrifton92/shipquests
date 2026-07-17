"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { useMiniPay } from "./_components/useMiniPay";
import { WalletChip } from "./_components/WalletChip";
import { QuestCardItem } from "./_components/QuestCardItem";
import { useT } from "./_components/i18n";
import { listQuests, type QuestCard } from "@/lib/quest-list";

type LoadState = "loading" | "ready" | "error";

export default function Home() {
  const t = useT();
  const { address, connect, connecting, hasProvider } = useMiniPay();
  const [state, setState] = useState<LoadState>("loading");
  const [quests, setQuests] = useState<QuestCard[]>([]);
  const [isMock, setIsMock] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await listQuests();
      setQuests(res.quests);
      setIsMock(res.isMock);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Mark />
          <span className={styles.wordmark}>
            Ship<b>Quests</b>
          </span>
        </div>
        <WalletChip
          address={address}
          connecting={connecting}
          hasProvider={hasProvider}
          onConnect={() => void connect()}
        />
      </header>

      <section className={styles.hero}>
        <div className={styles.heroLabel}>{t("home.hero.label")}</div>
        <div className={styles.heroValue}>
          <span className="mono">cUSD</span>
          <span className={styles.heroUnit}>{t("home.hero.unit")}</span>
        </div>
        <p className={styles.heroSub}>{t("home.hero.sub")}</p>
      </section>

      {isMock && (
        <div className={styles.notice}>
          <span aria-hidden>●</span> {t("home.preview")}
        </div>
      )}

      <div className={styles.sectionTitle}>
        <span>{t("home.available")}</span>
        {state === "ready" && <span className={styles.count}>{quests.length}</span>}
      </div>

      {state === "loading" && (
        <div className={styles.list} aria-busy="true">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      )}

      {state === "error" && (
        <div className={styles.errorBox}>
          <div className={styles.emptyIcon} aria-hidden>
            ⚠
          </div>
          <div className={styles.emptyTitle}>{t("home.error.title")}</div>
          <p>{t("home.error.sub")}</p>
          <button className={styles.retry} onClick={() => void load()}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {state === "ready" && quests.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            ◇
          </div>
          <div className={styles.emptyTitle}>{t("home.empty.title")}</div>
          <p>{t("home.empty.sub")}</p>
        </div>
      )}

      {state === "ready" && quests.length > 0 && (
        <div className={styles.list}>
          {quests.map((q, i) => (
            <div key={q.id} className="reveal" style={{ "--i": i } as CSSProperties}>
              <QuestCardItem quest={q} />
            </div>
          ))}
        </div>
      )}

      <Link href="/arcade" className={`${styles.arcadeCard} reveal`}>
        <span className={styles.arcadeGhost} aria-hidden>
          <svg viewBox="0 0 16 16" width="26" height="26">
            <path
              d="M2 15V8a6 6 0 0 1 12 0v7l-2-1.6L10 15l-2-1.6L6 15l-2-1.6L2 15Z"
              fill="#41e8e0"
            />
            <circle cx="6" cy="7.5" r="1.7" fill="#fff" />
            <circle cx="10.5" cy="7.5" r="1.7" fill="#fff" />
            <circle cx="6.4" cy="7.9" r="0.8" fill="#2b3bd6" />
            <circle cx="10.9" cy="7.9" r="0.8" fill="#2b3bd6" />
          </svg>
        </span>
        <span className={styles.arcadeText}>
          <span className={styles.arcadeTitle}>{t("arcade.teaser.title")}</span>
          <span className={styles.arcadeSub}>{t("arcade.teaser.sub")}</span>
        </span>
        <span className={styles.arcadeCta}>{t("arcade.teaser.cta")} ▸</span>
      </Link>
    </main>
  );
}

function Mark() {
  return (
    <svg className={styles.mark} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="var(--gold-line)" />
      <path
        d="M16 7l7.5 4.3v8.6L16 24l-7.5-4.1v-8.6L16 7z"
        stroke="var(--gold)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M16 12.5l3.5 2v3.9L16 20l-3.5-1.6v-3.9L16 12.5z" fill="var(--gold)" />
    </svg>
  );
}
