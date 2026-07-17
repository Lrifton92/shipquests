"use client";
// History: quests the connected wallet has completed. Primary source is the
// v1.1 RewardClaimed events (exact amount + streak per claim). If the log query
// fails we fall back to the legacy lastClaim(questId, wallet) brute-scan, which
// only knows the quest's reward range (shown honestly with a ~ prefix).
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { celo } from "viem/chains";
import { createPublicClient, http } from "viem";
import styles from "./history.module.css";
import { useMiniPay } from "../_components/useMiniPay";
import { WalletChip } from "../_components/WalletChip";
import { useT, useLang } from "../_components/i18n";
import { rewardLabel } from "@/lib/quest-list";
import { fetchClaims } from "@/lib/claims";
import { QUEST_ESCROW_ABI, QUEST_ESCROW_ADDRESS } from "@/lib/quest-abi";

const ZERO = "0x0000000000000000000000000000000000000000";

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org"),
});

type Entry = {
  id: string;
  claimedAt: number; // unix seconds
  minReward: bigint;
  maxReward: bigint;
  kind: number;
  /** consecutive-day streak at claim time (v1.1 events only; 0 = one-shot) */
  streak?: number;
};

type State = "idle" | "loading" | "ready" | "error";

function fmtDate(ts: number, locale: string): string {
  // Short date+time in the app's language. ts is unix seconds.
  return new Date(ts * 1000).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readHistory(wallet: `0x${string}`): Promise<Entry[]> {
  const nextId = (await publicClient.readContract({
    address: QUEST_ESCROW_ADDRESS,
    abi: QUEST_ESCROW_ABI,
    functionName: "nextId",
  })) as bigint;

  const out: Entry[] = [];
  for (let id = nextId - 1n; id >= 1n; id--) {
    const last = (await publicClient.readContract({
      address: QUEST_ESCROW_ADDRESS,
      abi: QUEST_ESCROW_ABI,
      functionName: "lastClaim",
      args: [id, wallet],
    })) as bigint;
    if (last > 0n) {
      const [, , , minReward, maxReward, , , kind] = (await publicClient.readContract({
        address: QUEST_ESCROW_ADDRESS,
        abi: QUEST_ESCROW_ABI,
        functionName: "quests",
        args: [id],
      })) as readonly [
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        bigint,
        number,
      ];
      out.push({
        id: id.toString(),
        claimedAt: Number(last),
        minReward,
        maxReward,
        kind,
      });
    }
  }
  // Most recent first.
  return out.sort((a, b) => b.claimedAt - a.claimedAt);
}

export default function History() {
  const t = useT();
  const { lang } = useLang();
  const { address, connect, connecting, hasProvider } = useMiniPay();
  const [state, setState] = useState<State>("idle");
  const [entries, setEntries] = useState<Entry[]>([]);

  const isMock = QUEST_ESCROW_ADDRESS.toLowerCase() === ZERO;

  const load = useCallback(async () => {
    if (!address || isMock) return;
    setState("loading");
    try {
      // v1.1 events: exact amounts + streaks
      const claims = await fetchClaims(address);
      setEntries(
        claims.map((c) => ({
          id: c.questId,
          claimedAt: c.claimedAt,
          minReward: c.amount,
          maxReward: c.amount,
          kind: c.streak > 0 ? 1 : 0,
          streak: c.streak,
        })),
      );
      setState("ready");
    } catch {
      // legacy fallback: lastClaim brute-scan (range amounts, no streak)
      try {
        setEntries(await readHistory(address));
        setState("ready");
      } catch {
        setState("error");
      }
    }
  }, [address, isMock]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className={styles.shell}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t("history.title")}</h1>
        <WalletChip
          address={address}
          connecting={connecting}
          hasProvider={hasProvider}
          onConnect={() => void connect()}
        />
      </header>
      <p className={styles.sub}>{t("history.sub")}</p>

      {/* Not connected -------------------------------------------------- */}
      {!address && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            ◇
          </div>
          <div className={styles.emptyTitle}>{t("history.connect.title")}</div>
          <p>{t("history.connect.sub")}</p>
          {hasProvider && (
            <button className={styles.cta} onClick={() => void connect()} disabled={connecting}>
              {connecting ? t("wallet.connecting") : t("wallet.connectFull")}
            </button>
          )}
        </div>
      )}

      {/* Preview / pre-deploy ------------------------------------------- */}
      {address && isMock && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            ●
          </div>
          <div className={styles.emptyTitle}>{t("history.mock.title")}</div>
          <p>{t("history.mock.sub")}</p>
        </div>
      )}

      {/* Loading -------------------------------------------------------- */}
      {address && !isMock && state === "loading" && (
        <div className={styles.list} aria-busy="true">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      )}

      {/* Error ---------------------------------------------------------- */}
      {address && !isMock && state === "error" && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            ⚠
          </div>
          <div className={styles.emptyTitle}>{t("history.error.title")}</div>
          <p>{t("history.error.sub")}</p>
          <button className={styles.cta} onClick={() => void load()}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* Empty (connected, no claims) ---------------------------------- */}
      {address && !isMock && state === "ready" && entries.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            ◇
          </div>
          <div className={styles.emptyTitle}>{t("history.empty.title")}</div>
          <p>{t("history.empty.sub")}</p>
          <Link href="/" className={styles.cta}>
            {t("history.empty.cta")}
          </Link>
        </div>
      )}

      {/* List ----------------------------------------------------------- */}
      {address && !isMock && state === "ready" && entries.length > 0 && (
        <div className={styles.list}>
          {entries.map((e, i) => {
            const exact = e.minReward === e.maxReward;
            return (
              <Link
                key={e.id}
                href={`/quest/${e.id}`}
                className={`${styles.row} reveal`}
                style={{ "--i": i } as CSSProperties}
              >
                <span className={styles.check} aria-hidden>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <path d="m5 12.5 4 4 10-10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {t("history.row.quest", { id: e.id })}
                    {e.kind === 1 && <span className={styles.dailyTag}>{t("history.row.daily")}</span>}
                    {(e.streak ?? 0) > 1 && (
                      <span className={styles.streakTag}>
                        {t("history.row.streak", { n: String(e.streak) })}
                      </span>
                    )}
                  </span>
                  <span className={styles.rowDate}>{fmtDate(e.claimedAt, lang)}</span>
                </div>
                <span
                  className={`${styles.amount} mono`}
                  title={exact ? t("history.row.exactTitle") : t("history.row.rangeTitle")}
                >
                  {exact ? "+" : "~"}
                  {rewardLabel(e.minReward, e.maxReward)}
                  <span className={styles.unit}>cUSD</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
