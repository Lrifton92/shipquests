"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { celo } from "viem/chains";
import { createPublicClient, http, formatUnits } from "viem";
import styles from "./quest.module.css";
import { useMiniPay } from "../../_components/useMiniPay";
import { WalletChip } from "../../_components/WalletChip";
import { CountUp } from "../../_components/CountUp";
import {
  getQuest,
  rewardLabel,
  shortAddress,
  type QuestCard,
} from "@/lib/quest-list";
import { QUEST_ESCROW_ABI, QUEST_ESCROW_ADDRESS } from "@/lib/quest-abi";

type Step =
  | "loading"
  | "notFound"
  | "idle"
  | "verifying"
  | "needsAction"
  | "claiming"
  | "success"
  | "error";

type ClaimData = { amount: bigint; deadline: bigint; signature: `0x${string}` };

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org"),
});

function classifyError(message: string): { step: Step; text: string } {
  const m = message.toLowerCase();
  if (m.includes("cooldown")) {
    return { step: "error", text: "You already opened today's box. Come back in 24h." };
  }
  if (m.includes("already claimed")) {
    return { step: "error", text: "You've already claimed this quest." };
  }
  if (m.includes("user rejected") || m.includes("denied")) {
    return { step: "idle", text: "Transaction cancelled." };
  }
  return { step: "error", text: "Something went wrong. Please try again." };
}

export default function QuestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, client, connect, connecting, hasProvider } = useMiniPay();

  const [quest, setQuest] = useState<QuestCard | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [step, setStep] = useState<Step>("loading");
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [errorText, setErrorText] = useState("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let alive = true;
    getQuest(id).then(({ quest: q, isMock: m }) => {
      if (!alive) return;
      setQuest(q);
      setIsMock(m);
      setStep(q ? "idle" : "notFound");
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const run = useCallback(async () => {
    if (!quest) return;
    setErrorText("");

    const wallet = address ?? (await connect());
    if (!wallet) {
      setErrorText("Connect your wallet first.");
      return;
    }

    // 1) Verify completion + get the signed attestation.
    setStep("verifying");
    let data: ClaimData;
    try {
      const res = await fetch(`/api/attest/${quest.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      if (res.status === 409) {
        setStep("needsAction");
        return;
      }
      if (!res.ok) {
        setErrorText("Verification failed. Try again in a moment.");
        setStep("error");
        return;
      }
      const json = (await res.json()) as { amount: string; deadline: string; signature: `0x${string}` };
      data = {
        amount: BigInt(json.amount),
        deadline: BigInt(json.deadline),
        signature: json.signature,
      };
      setClaim(data);
    } catch {
      setErrorText("Couldn't reach the server. Check your connection.");
      setStep("error");
      return;
    }

    // 2) Claim onchain via MiniPay wallet client.
    if (!client) {
      setErrorText("Wallet not available.");
      setStep("error");
      return;
    }
    setStep("claiming");
    try {
      const hash = await client.writeContract({
        account: wallet,
        chain: celo,
        address: QUEST_ESCROW_ADDRESS,
        abi: QUEST_ESCROW_ABI,
        functionName: "claim",
        args: [BigInt(quest.id), data.amount, data.deadline, data.signature],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStep("success");
      // Trigger the box-open / count-up on the next frame.
      requestAnimationFrame(() => setRevealed(true));
    } catch (e) {
      const { step: s, text } = classifyError(e instanceof Error ? e.message : String(e));
      setErrorText(text);
      setStep(s);
    }
  }, [quest, address, client, connect]);

  if (step === "loading") {
    return (
      <main className={styles.shell}>
        <BackBar address={address} connecting={connecting} hasProvider={hasProvider} onConnect={() => void connect()} />
        <div className={styles.skeletonBig} />
      </main>
    );
  }

  if (step === "notFound" || !quest) {
    return (
      <main className={styles.shell}>
        <BackBar address={address} connecting={connecting} hasProvider={hasProvider} onConnect={() => void connect()} />
        <div className={styles.notFound}>
          <div className={styles.nfIcon} aria-hidden>
            ◇
          </div>
          <div className={styles.nfTitle}>Quest not found</div>
          <Link href="/" className={styles.backLink}>
            ← Back to quests
          </Link>
        </div>
      </main>
    );
  }

  const isDaily = quest.kind === "DAILY";
  const amountNum = claim ? Number(formatUnits(claim.amount, 18)) : 0;

  return (
    <main className={styles.shell}>
      <BackBar address={address} connecting={connecting} hasProvider={hasProvider} onConnect={() => void connect()} />

      {step === "success" ? (
        <SuccessView isDaily={isDaily} revealed={revealed} amountNum={amountNum} questTitle={quest.title} />
      ) : (
        <>
          <header className={styles.questHead}>
            <span className={`${styles.badge} ${isDaily ? styles.daily : styles.oneshot}`}>
              {isDaily ? "DAILY BOX" : "ONE-SHOT"}
            </span>
            <h1 className={styles.title}>{quest.title}</h1>
            <p className={styles.action}>{quest.action}</p>
          </header>

          <section className={styles.rewardPanel}>
            <span className={styles.rewardLabel}>
              {isDaily ? "Mystery reward" : "Reward"}
            </span>
            <div className={styles.rewardValue}>
              <span className={`${styles.rewardAmount} mono`}>
                {rewardLabel(quest.minReward, quest.maxReward)}
              </span>
              <span className={styles.rewardUnit}>cUSD</span>
            </div>
            {isDaily && (
              <p className={styles.rewardHint}>The exact amount is revealed when you open the box.</p>
            )}
          </section>

          <dl className={styles.meta}>
            <div>
              <dt>Spots left</dt>
              <dd className="mono">{quest.left.toString()}</dd>
            </div>
            <div>
              <dt>Action target</dt>
              <dd className="mono" title={quest.target}>
                {shortAddress(quest.target)}
              </dd>
            </div>
          </dl>

          {isMock && (
            <div className={styles.notice}>
              <span aria-hidden>●</span> Preview quest — claiming needs the live contract.
            </div>
          )}

          {step === "needsAction" && (
            <div className={styles.needs}>
              <div className={styles.needsTitle}>Complete the action first</div>
              <p>We couldn&apos;t find your onchain action yet. Do it, then verify again.</p>
              <a
                className={styles.needsLink}
                href={`https://celoscan.io/address/${quest.target}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the target app ↗
              </a>
            </div>
          )}

          {errorText && step !== "needsAction" && <div className={styles.errorMsg}>{errorText}</div>}

          <button
            className={styles.cta}
            onClick={() => void run()}
            disabled={step === "verifying" || step === "claiming" || isMock}
          >
            {step === "verifying" && <Spinner />}
            {step === "claiming" && <Spinner />}
            {step === "verifying"
              ? "Verifying onchain…"
              : step === "claiming"
                ? "Claiming reward…"
                : step === "needsAction"
                  ? "I did it — check again"
                  : isDaily
                    ? "Open my box"
                    : "I did it — claim"}
          </button>
        </>
      )}
    </main>
  );
}

function SuccessView({
  isDaily,
  revealed,
  amountNum,
  questTitle,
}: {
  isDaily: boolean;
  revealed: boolean;
  amountNum: number;
  questTitle: string;
}) {
  const decimals = amountNum < 1 ? 4 : 2;
  return (
    <div className={styles.success}>
      {isDaily && (
        <div className={`${styles.box} ${revealed ? styles.boxOpen : ""}`} aria-hidden>
          <div className={styles.boxLid} />
          <div className={styles.boxBody} />
          <div className={styles.boxBurst} />
        </div>
      )}
      <div className={styles.successLabel}>{isDaily ? "Box opened!" : "Reward claimed!"}</div>
      <div className={`${styles.successAmount} mono`}>
        +<CountUp value={amountNum} decimals={decimals} />
        <span className={styles.successUnit}>cUSD</span>
      </div>
      <p className={styles.successSub}>{questTitle} — sent to your wallet.</p>
      <Link href="/" className={styles.successCta}>
        Find more quests
      </Link>
    </div>
  );
}

function BackBar({
  address,
  connecting,
  hasProvider,
  onConnect,
}: {
  address: string | null;
  connecting: boolean;
  hasProvider: boolean;
  onConnect: () => void;
}) {
  return (
    <div className={styles.backBar}>
      <Link href="/" className={styles.back} aria-label="Back to quests">
        ←
      </Link>
      <WalletChip address={address} connecting={connecting} hasProvider={hasProvider} onConnect={onConnect} />
    </div>
  );
}

function Spinner() {
  return <span className={styles.spinner} aria-hidden />;
}
