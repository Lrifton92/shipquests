"use client";
// Sponsor flow — create a quest onchain. Two transactions via the connected
// wallet (MiniPay / Rabby): ERC20 approve(escrow, total) then createQuest(...).
// Reads cUSD balance/decimals before submit for a clear "insufficient funds"
// message, and reads nextId after to link to the freshly created quest.
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { celo } from "viem/chains";
import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
} from "viem";
import styles from "./sponsor.module.css";
import { useMiniPay } from "../_components/useMiniPay";
import { ensureCelo } from "../_components/ensureCelo";
import { WalletChip } from "../_components/WalletChip";
import { Arrow } from "../_components/Arrow";
import { useT } from "../_components/i18n";
import type { Dict } from "@/lib/i18n/en";
import { QUEST_ESCROW_ABI, QUEST_ESCROW_ADDRESS } from "@/lib/quest-abi";

// cUSD on Celo mainnet, 18 decimals. Pre-filled but editable below.
const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address;

// Minimal ERC20 surface this flow needs.
const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org"),
});

type Kind = 0 | 1; // 0 = ONE-SHOT, 1 = DAILY
const DURATIONS = [7, 14, 30] as const;

type Phase = "idle" | "checking" | "approving" | "creating" | "success" | "error";

function readableError(message: string): keyof Dict {
  const m = message.toLowerCase();
  if (m.includes("user rejected") || m.includes("denied") || m.includes("rejected the request")) {
    return "sponsor.err.cancelled";
  }
  if (m.includes("insufficient funds")) {
    return "sponsor.err.gas";
  }
  if (m.includes("does not match the target chain") || m.includes("chain mismatch")) {
    return "sponsor.err.chain";
  }
  return "sponsor.err.generic";
}

export default function Sponsor() {
  const t = useT();
  const { address, client, connect, connecting, hasProvider } = useMiniPay();

  // Form state.
  const [target, setTarget] = useState("");
  const [token, setToken] = useState<string>(CUSD_ADDRESS);
  const [minReward, setMinReward] = useState("0.10");
  const [maxReward, setMaxReward] = useState("0.10");
  const [maxCompletions, setMaxCompletions] = useState("10");
  const [kind, setKind] = useState<Kind>(0);
  const [durationDays, setDurationDays] = useState<number>(7);

  // Flow state.
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Client-side validation (cheap, runs every render). Returns an i18n key.
  const validation = useMemo<keyof Dict | null>(() => {
    if (!isAddress(target)) return "sponsor.val.target";
    if (!isAddress(token)) return "sponsor.val.token";
    const min = Number(minReward);
    const max = Number(maxReward);
    const comps = Number(maxCompletions);
    if (!(min > 0)) return "sponsor.val.minGt0";
    if (!(max > 0)) return "sponsor.val.maxGt0";
    if (min > max) return "sponsor.val.minLeMax";
    if (!Number.isInteger(comps) || comps <= 0) return "sponsor.val.completions";
    return null;
  }, [target, token, minReward, maxReward, maxCompletions]);

  const total = useMemo(() => {
    try {
      const max = parseUnits(maxReward || "0", 18);
      const comps = BigInt(Math.trunc(Number(maxCompletions) || 0));
      return max * comps;
    } catch {
      return BigInt(0);
    }
  }, [maxReward, maxCompletions]);

  const busy = phase === "checking" || phase === "approving" || phase === "creating";

  const submit = useCallback(async () => {
    setErrorText("");
    if (validation) {
      setErrorText(t(validation));
      return;
    }

    const wallet = address ?? (await connect());
    if (!wallet) {
      setErrorText(t("wallet.connectFirst"));
      return;
    }
    if (!client) {
      setErrorText(t("wallet.notAvailable"));
      return;
    }

    // Make sure the wallet is on Celo (prompt switch/add) before any write.
    try {
      await ensureCelo(client);
    } catch (e) {
      setErrorText(t(readableError(e instanceof Error ? e.message : String(e))));
      setPhase("idle");
      return;
    }

    const targetAddr = target as Address;
    const tokenAddr = token as Address;
    const minWei = parseUnits(minReward, 18);
    const maxWei = parseUnits(maxReward, 18);
    const comps = BigInt(Math.trunc(Number(maxCompletions)));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + durationDays * 86400);
    const escrowTotal = maxWei * comps;

    // 1) Pre-flight: balance must cover the full escrow.
    setPhase("checking");
    try {
      const balance = await publicClient.readContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet],
      });
      if (balance < escrowTotal) {
        setErrorText(
          t("sponsor.err.insufficientBalance", {
            locked: formatUnits(escrowTotal, 18),
            have: formatUnits(balance, 18),
          }),
        );
        setPhase("idle");
        return;
      }
    } catch {
      setErrorText(t("sponsor.err.readBalance"));
      setPhase("error");
      return;
    }

    // 2) approve(escrow, total)
    setPhase("approving");
    try {
      const approveHash = await client.writeContract({
        account: wallet,
        chain: celo,
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [QUEST_ESCROW_ADDRESS, escrowTotal],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    } catch (e) {
      setErrorText(t(readableError(e instanceof Error ? e.message : String(e))));
      setPhase("error");
      return;
    }

    // 3) createQuest(...)
    setPhase("creating");
    try {
      const createHash = await client.writeContract({
        account: wallet,
        chain: celo,
        address: QUEST_ESCROW_ADDRESS,
        abi: QUEST_ESCROW_ABI,
        functionName: "createQuest",
        args: [targetAddr, tokenAddr, minWei, maxWei, comps, kind, deadline],
      });
      await publicClient.waitForTransactionReceipt({ hash: createHash });
    } catch (e) {
      setErrorText(t(readableError(e instanceof Error ? e.message : String(e))));
      setPhase("error");
      return;
    }

    // 4) Resolve the new quest id (nextId - 1) and show success.
    try {
      const next = await publicClient.readContract({
        address: QUEST_ESCROW_ADDRESS,
        abi: QUEST_ESCROW_ABI,
        functionName: "nextId",
      });
      setCreatedId((next - BigInt(1)).toString());
    } catch {
      setCreatedId(null); // success, but couldn't resolve id — link falls back.
    }
    setPhase("success");
  }, [
    validation,
    address,
    client,
    connect,
    target,
    token,
    minReward,
    maxReward,
    maxCompletions,
    kind,
    durationDays,
    t,
  ]);

  if (phase === "success") {
    return (
      <main className={styles.shell}>
        <BackBar address={address} connecting={connecting} hasProvider={hasProvider} onConnect={() => void connect()} />
        <div className={styles.success}>
          <div className={styles.successIcon} aria-hidden>
            ✓
          </div>
          <div className={styles.successTitle}>{t("sponsor.success.title")}</div>
          <p className={styles.successSub}>{t("sponsor.success.sub")}</p>
          {createdId !== null && (
            <Link href={`/quest/${createdId}`} className={styles.successCta}>
              {t("sponsor.success.view", { id: createdId })}
              <Arrow variant="right" size={16} />
            </Link>
          )}
          <Link href="/sponsor" className={styles.successGhost} onClick={() => location.reload()}>
            {t("sponsor.success.another")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <BackBar address={address} connecting={connecting} hasProvider={hasProvider} onConnect={() => void connect()} />

      <header className={styles.head}>
        <h1 className={styles.title}>{t("sponsor.title")}</h1>
        <p className={styles.sub}>{t("sponsor.sub")}</p>
      </header>

      <div className={styles.form}>
        <Field label={t("sponsor.field.target")} hint={t("sponsor.field.target.hint")}>
          <input
            className={`${styles.input} mono`}
            value={target}
            onChange={(e) => setTarget(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="text"
          />
        </Field>

        <Field label={t("sponsor.field.token")} hint={t("sponsor.field.token.hint")}>
          <input
            className={`${styles.input} mono`}
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </Field>

        <div className={styles.row}>
          <Field label={t("sponsor.field.minReward")} hint={t("sponsor.field.cusd")}>
            <input
              className={`${styles.input} mono`}
              value={minReward}
              onChange={(e) => setMinReward(e.target.value)}
              inputMode="decimal"
              placeholder="0.10"
            />
          </Field>
          <Field label={t("sponsor.field.maxReward")} hint={t("sponsor.field.cusd")}>
            <input
              className={`${styles.input} mono`}
              value={maxReward}
              onChange={(e) => setMaxReward(e.target.value)}
              inputMode="decimal"
              placeholder="0.10"
            />
          </Field>
        </div>

        <Field label={t("sponsor.field.maxCompletions")} hint={t("sponsor.field.maxCompletions.hint")}>
          <input
            className={`${styles.input} mono`}
            value={maxCompletions}
            onChange={(e) => setMaxCompletions(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="10"
          />
        </Field>

        <Field label={t("sponsor.field.type")} hint={t("sponsor.field.type.hint")}>
          <div className={styles.toggle} role="radiogroup" aria-label={t("sponsor.field.type")}>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 0}
              className={`${styles.toggleBtn} ${kind === 0 ? styles.toggleOn : ""}`}
              onClick={() => setKind(0)}
            >
              {t("sponsor.type.oneshot")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 1}
              className={`${styles.toggleBtn} ${kind === 1 ? styles.toggleOn : ""}`}
              onClick={() => setKind(1)}
            >
              {t("sponsor.type.daily")}
            </button>
          </div>
        </Field>

        <Field label={t("sponsor.field.deadline")} hint={t("sponsor.field.deadline.hint")}>
          <div className={styles.toggle} role="radiogroup" aria-label={t("sponsor.field.deadline")}>
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={durationDays === d}
                className={`${styles.toggleBtn} ${durationDays === d ? styles.toggleOn : ""}`}
                onClick={() => setDurationDays(d)}
              >
                {t("sponsor.duration.days", { n: d })}
              </button>
            ))}
          </div>
        </Field>

        <div className={styles.totalBox}>
          <span className={styles.totalLabel}>{t("sponsor.total.label")}</span>
          <span className={`${styles.totalValue} mono`}>{formatUnits(total, 18)} cUSD</span>
        </div>

        {errorText && <div className={styles.errorMsg}>{errorText}</div>}
        {!errorText && validation && phase === "idle" && (
          <div className={styles.hintMsg}>{t(validation)}</div>
        )}

        <button
          className={styles.cta}
          onClick={() => void submit()}
          disabled={busy || (!!validation && phase !== "error")}
        >
          {busy && <span className={styles.spinner} aria-hidden />}
          {phase === "checking"
            ? t("sponsor.cta.checking")
            : phase === "approving"
              ? t("sponsor.cta.approving")
              : phase === "creating"
                ? t("sponsor.cta.creating")
                : address
                  ? t("sponsor.cta.create")
                  : t("sponsor.cta.connect")}
        </button>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {hint && <span className={styles.fieldHint}>{hint}</span>}
      </span>
      {children}
    </label>
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
