"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { celo } from "viem/chains";
import { createPublicClient, http, formatUnits } from "viem";
import styles from "./quest.module.css";
import { useMiniPay } from "../../_components/useMiniPay";
import { ensureCelo } from "../../_components/ensureCelo";
import { WalletChip } from "../../_components/WalletChip";
import { Arrow } from "../../_components/Arrow";
import { CountUp } from "../../_components/CountUp";
import { useT } from "../../_components/i18n";
import type { Dict } from "@/lib/i18n/en";
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

function classifyError(message: string): { step: Step; key: keyof Dict } {
  const m = message.toLowerCase();
  if (m.includes("cooldown")) {
    return { step: "error", key: "quest.err.cooldown" };
  }
  if (m.includes("already claimed")) {
    return { step: "error", key: "quest.err.alreadyClaimed" };
  }
  if (m.includes("user rejected") || m.includes("denied")) {
    return { step: "idle", key: "quest.err.cancelled" };
  }
  return { step: "error", key: "quest.err.generic" };
}

export default function QuestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
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
      setErrorText(t("wallet.connectFirst"));
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
        setErrorText(t("quest.err.verifyFailed"));
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
      setErrorText(t("quest.err.serverUnreachable"));
      setStep("error");
      return;
    }

    // 2) Claim onchain via MiniPay wallet client.
    if (!client) {
      setErrorText(t("wallet.notAvailable"));
      setStep("error");
      return;
    }
    // Ensure the wallet is on Celo (prompt switch/add) before the claim write.
    try {
      await ensureCelo(client);
    } catch (e) {
      const { step: s, key } = classifyError(e instanceof Error ? e.message : String(e));
      setErrorText(t(key));
      setStep(s);
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
      const { step: s, key } = classifyError(e instanceof Error ? e.message : String(e));
      setErrorText(t(key));
      setStep(s);
    }
  }, [quest, address, client, connect, t]);

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
          <div className={styles.nfTitle}>{t("quest.notFound.title")}</div>
          <Link href="/" className={styles.backLink}>
            <Arrow variant="left" size={15} />
            {t("quest.notFound.back")}
          </Link>
        </div>
      </main>
    );
  }

  const isDaily = quest.kind === "DAILY";
  const amountNum = claim ? Number(formatUnits(claim.amount, 18)) : 0;
  const questTitle = quest.titleKey ? t(quest.titleKey) : quest.title;
  const questAction = quest.actionKey ? t(quest.actionKey) : quest.action;
  const stepsText = quest.stepsKey ? t(quest.stepsKey) : questAction;
  const busy = step === "verifying" || step === "claiming";

  return (
    <main className={styles.shell}>
      <BackBar address={address} connecting={connecting} hasProvider={hasProvider} onConnect={() => void connect()} />

      {step === "success" ? (
        <SuccessView isDaily={isDaily} revealed={revealed} amountNum={amountNum} questTitle={questTitle} t={t} />
      ) : (
        <>
          <header className={styles.questHead}>
            <span className={`${styles.badge} ${isDaily ? styles.daily : styles.oneshot}`}>
              {isDaily ? t("quest.badge.daily") : t("quest.badge.oneshot")}
            </span>
            <h1 className={styles.title}>
              {quest.icon && <span aria-hidden>{quest.icon} </span>}
              {questTitle}
            </h1>
            <p className={styles.action}>{questAction}</p>
          </header>

          <section className={styles.rewardPanel}>
            <span className={styles.rewardLabel}>
              {isDaily ? t("quest.reward.mystery") : t("quest.reward.label")}
            </span>
            <div className={styles.rewardValue}>
              <span className={`${styles.rewardAmount} mono`}>
                {rewardLabel(quest.minReward, quest.maxReward)}
              </span>
              <span className={styles.rewardUnit}>cUSD</span>
            </div>
            {isDaily && (
              <p className={styles.rewardHint}>{t("quest.reward.hint")}</p>
            )}
          </section>

          <dl className={styles.meta}>
            <div>
              <dt>{t("quest.meta.spotsLeft")}</dt>
              <dd className="mono">{quest.left.toString()}</dd>
            </div>
            <div>
              <dt>{t("quest.meta.actionTarget")}</dt>
              <dd className="mono" title={quest.target}>
                {shortAddress(quest.target)}
              </dd>
            </div>
          </dl>

          {isMock && (
            <div className={styles.notice}>
              <span aria-hidden>●</span> {t("quest.preview")}
            </div>
          )}

          {/* Step 1 — do the action (dapp link or wallet instruction) */}
          <section className={styles.stepCard}>
            <div className={styles.stepHead}>
              <span className={styles.stepNum} aria-hidden>1</span>
              <span className={styles.stepLabel}>{t("quest.step1.label")}</span>
            </div>
            <p className={styles.stepBody}>{stepsText}</p>
            {quest.actionUrl ? (
              <a
                className={styles.actionBtn}
                href={quest.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("quest.step.doAction")}
                <Arrow variant="diag" size={16} />
              </a>
            ) : (
              <div className={styles.walletHint}>
                <span aria-hidden>◈</span> {t("quest.step.fromWallet")}
              </div>
            )}
          </section>

          {/* Step 2 — claim (existing flow, restyled) */}
          <section className={`${styles.stepCard} ${styles.stepClaim}`}>
            <div className={styles.stepHead}>
              <span className={styles.stepNum} aria-hidden>2</span>
              <span className={styles.stepLabel}>{t("quest.step2.label")}</span>
            </div>

            {step === "needsAction" ? (
              <div className={styles.needs}>
                <div className={styles.needsTitle}>{t("quest.needs.title")}</div>
                <p>{t("quest.needs.sub")}</p>
                <a
                  className={styles.needsLink}
                  href={`https://celoscan.io/address/${quest.target}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("quest.needs.link")}
                  <Arrow variant="diag" size={15} />
                </a>
              </div>
            ) : (
              <p className={styles.stepBody}>{t("quest.step2.hint")}</p>
            )}

            {errorText && step !== "needsAction" && <div className={styles.errorMsg}>{errorText}</div>}

            <button
              className={styles.cta}
              onClick={() => void run()}
              disabled={busy || isMock}
            >
              {busy && <Spinner />}
              {step === "verifying"
                ? t("quest.cta.verifying")
                : step === "claiming"
                  ? t("quest.cta.claiming")
                  : step === "needsAction"
                    ? t("quest.cta.checkAgain")
                    : isDaily
                      ? t("quest.cta.openBox")
                      : t("quest.cta.claim")}
            </button>
          </section>
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
  t,
}: {
  isDaily: boolean;
  revealed: boolean;
  amountNum: number;
  questTitle: string;
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string;
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
      <div className={styles.successLabel}>{isDaily ? t("quest.success.boxOpened") : t("quest.success.claimed")}</div>
      <div className={`${styles.successAmount} mono`}>
        +<CountUp value={amountNum} decimals={decimals} />
        <span className={styles.successUnit}>cUSD</span>
      </div>
      <p className={styles.successSub}>{t("quest.success.sub", { title: questTitle })}</p>
      <Link href="/" className={styles.successCta}>
        {t("quest.success.cta")}
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
  const t = useT();
  return (
    <div className={styles.backBar}>
      <Link href="/" className={styles.back} aria-label={t("common.back")}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden>
          <path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("common.back")}
      </Link>
      <WalletChip address={address} connecting={connecting} hasProvider={hasProvider} onConnect={onConnect} />
    </div>
  );
}

function Spinner() {
  return <span className={styles.spinner} aria-hidden />;
}
