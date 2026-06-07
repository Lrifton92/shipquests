"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";
import { useMiniPay } from "./_components/useMiniPay";
import { WalletChip } from "./_components/WalletChip";
import { QuestCardItem } from "./_components/QuestCardItem";
import { listQuests, type QuestCard } from "@/lib/quest-list";

type LoadState = "loading" | "ready" | "error";

export default function Home() {
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
        <div className={styles.heroLabel}>Earn rewards</div>
        <div className={styles.heroValue}>
          <span className="mono">cUSD</span>
          <span className={styles.heroUnit}>on Celo</span>
        </div>
        <p className={styles.heroSub}>
          Do a simple action, get verified onchain, claim your reward. No fees, no jargon.
        </p>
      </section>

      {isMock && (
        <div className={styles.notice}>
          <span aria-hidden>●</span> Preview quests — the live contract isn&apos;t deployed yet.
        </div>
      )}

      <div className={styles.sectionTitle}>
        <span>Available quests</span>
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
          <div className={styles.emptyTitle}>Couldn&apos;t load quests</div>
          <p>Check your connection and try again.</p>
          <button className={styles.retry} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {state === "ready" && quests.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            ◇
          </div>
          <div className={styles.emptyTitle}>No quests right now</div>
          <p>New quests drop regularly. Check back soon.</p>
        </div>
      )}

      {state === "ready" && quests.length > 0 && (
        <div className={styles.list}>
          {quests.map((q) => (
            <QuestCardItem key={q.id} quest={q} />
          ))}
        </div>
      )}
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
