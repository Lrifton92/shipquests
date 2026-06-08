"use client";
// Invite: share your referral link and manage your referral bonus.
// Reward model: you earn pct% of everything your friends earn. The bonus accrues
// off-chain (Vercel KV) and is claimed onchain via a dedicated Daily "referral
// quest" — claimable once per 24h. This page reads owed/active stats from
// /api/referral/stats and the 24h cooldown from the escrow's lastClaim onchain,
// then runs the same attest→claim flow as a normal quest, inline.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { celo } from "viem/chains";
import { createPublicClient, http, formatUnits } from "viem";
import styles from "./invite.module.css";
import { useMiniPay } from "../_components/useMiniPay";
import { ensureCelo } from "../_components/ensureCelo";
import { useT } from "../_components/i18n";
import { Arrow } from "../_components/Arrow";
import { CountUp } from "../_components/CountUp";
import { RewardBurst } from "../_components/RewardBurst";
import { formatCusd } from "@/lib/quest-list";
import { QUEST_ESCROW_ABI, QUEST_ESCROW_ADDRESS } from "@/lib/quest-abi";

const REFERRAL_QUEST_ID = process.env.NEXT_PUBLIC_REFERRAL_QUEST_ID;
const COOLDOWN_SEC = 24 * 3600;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org"),
});

type Stats = { active: number; earnedWei: string; owedWei: string; pct: number };
type Phase = "idle" | "verifying" | "claiming" | "success" | "error";

/** Format a remaining duration (seconds) as "Hh Mm" or "Mm Ss". */
function formatDuration(sec: number): string {
  if (sec <= 0) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Invite() {
  const t = useT();
  const { address, client, connect, connecting, hasProvider } = useMiniPay();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [lastClaimSec, setLastClaimSec] = useState<number | null>(null);
  const [nowSec, setNowSec] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState("");
  // Amount captured at the moment of the successful claim (owed gets reset by the
  // stats refresh right after), plus a one-shot reveal flag to fire the celebration.
  const [claimedNum, setClaimedNum] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setNowSec(Math.floor(Date.now() / 1000));
  }, []);

  // 1s tick to drive the live cooldown countdown.
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // The share link uses the sponsor's short invite code when available, and falls
  // back to the raw wallet address (works the same via the capture/link route).
  const link = address ? `${origin}?ref=${code ?? address}` : "";

  const loadStats = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/referral/stats?wallet=${address}`);
      if (res.ok) setStats((await res.json()) as Stats);
    } catch {
      /* stats stay null — the card shows zeros */
    }
  }, [address]);

  const loadCode = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/referral/code?wallet=${address}`);
      if (res.ok) setCode(((await res.json()) as { code: string | null }).code);
    } catch {
      /* code stays null — link falls back to the raw address */
    }
  }, [address]);

  const loadCooldown = useCallback(async () => {
    if (!address || !REFERRAL_QUEST_ID) return;
    try {
      const last = (await publicClient.readContract({
        address: QUEST_ESCROW_ADDRESS,
        abi: QUEST_ESCROW_ABI,
        functionName: "lastClaim",
        args: [BigInt(REFERRAL_QUEST_ID), address],
      })) as bigint;
      setLastClaimSec(Number(last));
    } catch {
      setLastClaimSec(null);
    }
  }, [address]);

  useEffect(() => {
    void loadStats();
    void loadCooldown();
    void loadCode();
  }, [loadStats, loadCooldown, loadCode]);

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

  // Derived cooldown + bonus state.
  const owed = stats ? BigInt(stats.owedWei) : 0n;
  const earned = stats ? BigInt(stats.earnedWei) : 0n;
  const pct = stats?.pct ?? 10;
  const cooldownEnd = lastClaimSec && lastClaimSec > 0 ? lastClaimSec + COOLDOWN_SEC : 0;
  const remaining = cooldownEnd > 0 ? Math.max(0, cooldownEnd - nowSec) : 0;
  const onCooldown = remaining > 0;
  const elapsedRatio = cooldownEnd > 0 ? Math.min(1, Math.max(0, (nowSec - (lastClaimSec ?? 0)) / COOLDOWN_SEC)) : 1;
  const canClaim = !!REFERRAL_QUEST_ID && owed > 0n && !onCooldown && phase === "idle";
  const busy = phase === "verifying" || phase === "claiming";

  const claim = useCallback(async () => {
    if (!REFERRAL_QUEST_ID) return;
    setErrorText("");
    const wallet = address ?? (await connect());
    if (!wallet) return;

    setPhase("verifying");
    let data: { amount: bigint; deadline: bigint; signature: `0x${string}` };
    try {
      const res = await fetch(`/api/attest/${REFERRAL_QUEST_ID}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      if (res.status === 409) {
        // Not enough bonus yet — refresh stats and fall back to idle.
        await loadStats();
        setPhase("idle");
        return;
      }
      if (!res.ok) {
        setErrorText(t("referral.bonus.err"));
        setPhase("error");
        return;
      }
      const json = (await res.json()) as { amount: string; deadline: string; signature: `0x${string}` };
      data = { amount: BigInt(json.amount), deadline: BigInt(json.deadline), signature: json.signature };
    } catch {
      setErrorText(t("referral.bonus.err"));
      setPhase("error");
      return;
    }

    if (!client) {
      setErrorText(t("wallet.notAvailable"));
      setPhase("error");
      return;
    }
    // Ensure the wallet is on Celo (prompt switch/add) before the claim write.
    try {
      await ensureCelo(client);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      if (msg.includes("user rejected") || msg.includes("denied")) {
        setPhase("idle");
        return;
      }
      setErrorText(t("referral.bonus.err"));
      setPhase("error");
      return;
    }
    setPhase("claiming");
    try {
      const hash = await client.writeContract({
        account: wallet,
        chain: celo,
        address: QUEST_ESCROW_ADDRESS,
        abi: QUEST_ESCROW_ABI,
        functionName: "claim",
        args: [BigInt(REFERRAL_QUEST_ID), data.amount, data.deadline, data.signature],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      // Capture the claimed amount before the stats refresh resets `owed` to 0.
      setClaimedNum(Number(formatUnits(data.amount, 18)));
      setPhase("success");
      // Fire the celebration on the next frame (matches the quest reveal pattern).
      requestAnimationFrame(() => setRevealed(true));
      await Promise.all([loadStats(), loadCooldown()]);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      // User-cancelled returns silently to idle; anything else is a real error.
      if (msg.includes("user rejected") || msg.includes("denied")) {
        setPhase("idle");
        return;
      }
      setErrorText(t("referral.bonus.err"));
      setPhase("error");
    }
  }, [address, client, connect, loadStats, loadCooldown, t]);

  const claimLabel = busy
    ? phase === "verifying"
      ? t("referral.bonus.verifying")
      : t("referral.bonus.claiming")
    : phase === "success"
      ? t("referral.bonus.claimed")
      : owed > 0n
        ? t("referral.bonus.claim", { amount: formatCusd(owed) })
        : t("referral.bonus.claimGeneric");

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
            disabled={connecting}
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

          {/* Bonus -------------------------------------------------------- */}
          <section className={`${styles.card} reveal`} style={{ "--i": 2 } as CSSProperties}>
            <div className={styles.bonusTop}>
              <div className={styles.cardLabel}>{t("referral.bonus.label")}</div>
              <span className={styles.rateChip}>{t("referral.bonus.rate", { pct })}</span>
            </div>

            {phase === "success" ? (
              <div className={`${styles.bonusSuccess} ${revealed ? styles.bonusSuccessOn : ""}`}>
                <RewardBurst fireKey={revealed} />
                <div className={styles.bonusHalo} aria-hidden />
                <div className={styles.bonusCheck} aria-hidden>
                  <svg viewBox="0 0 52 52" width="44" height="44">
                    <circle className={styles.bonusCheckRing} cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    <path className={styles.bonusCheckMark} d="M15 27l8 8 15-16" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className={styles.bonusSuccessLabel}>{t("referral.bonus.claimed")}</div>
                <div className={`${styles.bonusSuccessAmount} mono`}>
                  +<CountUp value={claimedNum} decimals={claimedNum < 1 ? 4 : 2} />
                  <span className={styles.bonusUnit}>cUSD</span>
                </div>
              </div>
            ) : (
              <>
            <div className={styles.bonusAmount}>
              <span className={`${styles.bonusValue} mono`}>{formatCusd(owed)}</span>
              <span className={styles.bonusUnit}>cUSD</span>
            </div>

            {/* Cooldown bar (montant + 24h fill) */}
            <div className={styles.cooldown}>
              <div className={styles.cooldownTrack}>
                <div
                  className={`${styles.cooldownFill} ${!onCooldown ? styles.cooldownReady : ""}`}
                  style={{ width: `${Math.round(elapsedRatio * 100)}%` }}
                />
              </div>
              <span className={styles.cooldownText}>
                {onCooldown ? t("referral.bonus.cooldown", { time: formatDuration(remaining) }) : t("referral.bonus.ready")}
              </span>
            </div>

            {/* Mini stats */}
            <div className={styles.miniStats}>
              <div className={styles.miniStat}>
                <span className={`${styles.miniValue} mono`}>{stats?.active ?? 0}</span>
                <span className={styles.miniLabel}>{t("referral.bonus.referred")}</span>
              </div>
              <div className={styles.miniStat}>
                <span className={`${styles.miniValue} mono`}>{formatCusd(earned)}</span>
                <span className={styles.miniLabel}>{t("referral.bonus.friendsEarned")}</span>
              </div>
            </div>

            {owed === 0n ? (
              <p className={styles.note}>{t("referral.bonus.none")}</p>
            ) : (
              <button
                className={styles.claimBtn}
                onClick={() => void claim()}
                disabled={!canClaim}
              >
                {busy && <span className={styles.spinner} aria-hidden />}
                {claimLabel}
              </button>
            )}
            {errorText && <p className={styles.errorMsg}>{errorText}</p>}
              </>
            )}
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
