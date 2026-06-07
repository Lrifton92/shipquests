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
import { WalletChip } from "../_components/WalletChip";
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

function readableError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("user rejected") || m.includes("denied") || m.includes("rejected the request")) {
    return "Transaction cancelled in your wallet.";
  }
  if (m.includes("insufficient funds")) {
    return "Not enough CELO for gas. Top up a little CELO and retry.";
  }
  return "Something went wrong. Please try again.";
}

export default function Sponsor() {
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

  // Client-side validation (cheap, runs every render).
  const validation = useMemo(() => {
    if (!isAddress(target)) return "Enter a valid action target address.";
    if (!isAddress(token)) return "Enter a valid reward token address.";
    const min = Number(minReward);
    const max = Number(maxReward);
    const comps = Number(maxCompletions);
    if (!(min > 0)) return "Min reward must be greater than 0.";
    if (!(max > 0)) return "Max reward must be greater than 0.";
    if (min > max) return "Min reward can't be greater than max reward.";
    if (!Number.isInteger(comps) || comps <= 0) return "Max completions must be a whole number above 0.";
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
      setErrorText(validation);
      return;
    }

    const wallet = address ?? (await connect());
    if (!wallet) {
      setErrorText("Connect your wallet first.");
      return;
    }
    if (!client) {
      setErrorText("Wallet not available.");
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
          `Insufficient balance. This quest locks ${formatUnits(escrowTotal, 18)} cUSD, ` +
            `your wallet has ${formatUnits(balance, 18)} cUSD.`,
        );
        setPhase("idle");
        return;
      }
    } catch {
      setErrorText("Couldn't read your token balance. Check the token address and network.");
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
      setErrorText(readableError(e instanceof Error ? e.message : String(e)));
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
      setErrorText(readableError(e instanceof Error ? e.message : String(e)));
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
  ]);

  if (phase === "success") {
    return (
      <main className={styles.shell}>
        <BackBar address={address} connecting={connecting} hasProvider={hasProvider} onConnect={() => void connect()} />
        <div className={styles.success}>
          <div className={styles.successIcon} aria-hidden>
            ✓
          </div>
          <div className={styles.successTitle}>Quest is live</div>
          <p className={styles.successSub}>
            Your rewards are locked in escrow on Celo. Players can complete it now.
          </p>
          {createdId !== null && (
            <Link href={`/quest/${createdId}`} className={styles.successCta}>
              View quest #{createdId} →
            </Link>
          )}
          <Link href="/sponsor" className={styles.successGhost} onClick={() => location.reload()}>
            Create another
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <BackBar address={address} connecting={connecting} hasProvider={hasProvider} onConnect={() => void connect()} />

      <header className={styles.head}>
        <h1 className={styles.title}>Create a quest</h1>
        <p className={styles.sub}>
          Set the action, fund the rewards, ship it. Two quick wallet confirmations.
        </p>
      </header>

      <div className={styles.form}>
        <Field label="Action target" hint="Contract players must interact with to qualify.">
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

        <Field label="Reward token" hint="Defaults to cUSD. Must be an 18-decimal ERC-20.">
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
          <Field label="Min reward" hint="cUSD">
            <input
              className={`${styles.input} mono`}
              value={minReward}
              onChange={(e) => setMinReward(e.target.value)}
              inputMode="decimal"
              placeholder="0.10"
            />
          </Field>
          <Field label="Max reward" hint="cUSD">
            <input
              className={`${styles.input} mono`}
              value={maxReward}
              onChange={(e) => setMaxReward(e.target.value)}
              inputMode="decimal"
              placeholder="0.10"
            />
          </Field>
        </div>

        <Field label="Max completions" hint="How many players can earn.">
          <input
            className={`${styles.input} mono`}
            value={maxCompletions}
            onChange={(e) => setMaxCompletions(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="10"
          />
        </Field>

        <Field label="Type" hint="One-shot pays once. Daily can be opened every 24h.">
          <div className={styles.toggle} role="radiogroup" aria-label="Quest type">
            <button
              type="button"
              role="radio"
              aria-checked={kind === 0}
              className={`${styles.toggleBtn} ${kind === 0 ? styles.toggleOn : ""}`}
              onClick={() => setKind(0)}
            >
              One-shot
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 1}
              className={`${styles.toggleBtn} ${kind === 1 ? styles.toggleOn : ""}`}
              onClick={() => setKind(1)}
            >
              Daily box
            </button>
          </div>
        </Field>

        <Field label="Deadline" hint="When the quest stops accepting completions.">
          <div className={styles.toggle} role="radiogroup" aria-label="Deadline">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={durationDays === d}
                className={`${styles.toggleBtn} ${durationDays === d ? styles.toggleOn : ""}`}
                onClick={() => setDurationDays(d)}
              >
                {d} days
              </button>
            ))}
          </div>
        </Field>

        <div className={styles.totalBox}>
          <span className={styles.totalLabel}>Total locked in escrow</span>
          <span className={`${styles.totalValue} mono`}>{formatUnits(total, 18)} cUSD</span>
        </div>

        {errorText && <div className={styles.errorMsg}>{errorText}</div>}
        {!errorText && validation && phase === "idle" && (
          <div className={styles.hintMsg}>{validation}</div>
        )}

        <button
          className={styles.cta}
          onClick={() => void submit()}
          disabled={busy || (!!validation && phase !== "error")}
        >
          {busy && <span className={styles.spinner} aria-hidden />}
          {phase === "checking"
            ? "Checking balance…"
            : phase === "approving"
              ? "Approving cUSD…"
              : phase === "creating"
                ? "Creating quest…"
                : address
                  ? "Fund & create quest"
                  : "Connect wallet to create"}
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
  return (
    <div className={styles.backBar}>
      <Link href="/" className={styles.back} aria-label="Back to quests">
        ←
      </Link>
      <WalletChip address={address} connecting={connecting} hasProvider={hasProvider} onConnect={onConnect} />
    </div>
  );
}
