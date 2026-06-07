"use client";
// History: quests the connected wallet has completed. The contract emits no
// events, so we derive history by reading lastClaim(questId, wallet) for each
// quest 1..nextId-1 — a non-zero value is the unix timestamp of the user's claim.
// Amount per claim isn't stored onchain (it's set by the off-chain signature), so
// we show the quest's reward range as a reference, labelled honestly.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { celo } from "viem/chains";
import { createPublicClient, http } from "viem";
import styles from "./history.module.css";
import { useMiniPay } from "../_components/useMiniPay";
import { WalletChip } from "../_components/WalletChip";
import { rewardLabel } from "@/lib/quest-list";
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
};

type State = "idle" | "loading" | "ready" | "error";

function fmtDate(ts: number): string {
  // Local short date+time. ts is unix seconds.
  return new Date(ts * 1000).toLocaleString(undefined, {
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
  const { address, connect, connecting, hasProvider } = useMiniPay();
  const [state, setState] = useState<State>("idle");
  const [entries, setEntries] = useState<Entry[]>([]);

  const isMock = QUEST_ESCROW_ADDRESS.toLowerCase() === ZERO;

  const load = useCallback(async () => {
    if (!address || isMock) return;
    setState("loading");
    try {
      setEntries(await readHistory(address));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [address, isMock]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className={styles.shell}>
      <header className={styles.head}>
        <h1 className={styles.title}>History</h1>
        <WalletChip
          address={address}
          connecting={connecting}
          hasProvider={hasProvider}
          onConnect={() => void connect()}
        />
      </header>
      <p className={styles.sub}>Quests you&apos;ve completed and claimed.</p>

      {/* Not connected -------------------------------------------------- */}
      {!address && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            ◇
          </div>
          <div className={styles.emptyTitle}>Connect to see your history</div>
          <p>Your completed quests will appear here once your wallet is connected.</p>
          {hasProvider && (
            <button className={styles.cta} onClick={() => void connect()} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect wallet"}
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
          <div className={styles.emptyTitle}>History is live after launch</div>
          <p>Once the contract is deployed, your claims show up here automatically.</p>
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
          <div className={styles.emptyTitle}>Couldn&apos;t load history</div>
          <p>Check your connection and try again.</p>
          <button className={styles.cta} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {/* Empty (connected, no claims) ---------------------------------- */}
      {address && !isMock && state === "ready" && entries.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            ◇
          </div>
          <div className={styles.emptyTitle}>No quests completed yet</div>
          <p>Complete your first quest and your claim shows up here.</p>
          <Link href="/" className={styles.cta}>
            Browse quests
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
                    Quest #{e.id}
                    {e.kind === 1 && <span className={styles.dailyTag}>DAILY</span>}
                  </span>
                  <span className={styles.rowDate}>{fmtDate(e.claimedAt)}</span>
                </div>
                <span
                  className={`${styles.amount} mono`}
                  title={exact ? "Reward claimed" : "Reward range — daily amounts vary per claim"}
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
