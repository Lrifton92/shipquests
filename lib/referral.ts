// Off-chain referral attribution on Vercel KV. The QuestEscrow contract is
// immutable, so referral lives entirely off-chain and rewards reuse the normal
// quest/claim mechanism (a dedicated Daily "referral quest" the sponsor funds).
//
// REWARD MODEL: the sponsor earns REFERRAL_PCT% of every cUSD reward their
// referees earn. Each referee completion accrues pct% of that reward to the
// sponsor's "earned" tally; the sponsor's claimable bonus = earned*pct - paid.
//
// FALLBACK CONTRACT (important): when the KV env vars are absent (local dev, or a
// preview without a store attached) EVERY function degrades to a no-op and NEVER
// throws. Writers become silent no-ops and readers return safe defaults (null /
// 0 / 0n). Referral simply does nothing — the claim flow and the rest of the app
// keep working unchanged. @vercel/kv only touches the network at runtime, so
// importing this module is safe at build time.
//
// UNIT NOTE: balances are stored in MICRO-cUSD (1e-6 cUSD = 1e12 wei), not wei.
// Redis/Upstash INCRBY is a signed 64-bit integer; summing wei (~1e17 each)
// overflows after ~90 claims. Micro-cUSD keeps millions of claims well within
// Number.MAX_SAFE_INTEGER. Sub-micro dust (<1e-6 cUSD) is floored away.
//
// KEY SHAPE (all addresses lowercased so case never splits a sponsor):
//   ref:sponsor:<referee>  -> <sponsor>            (string, SET NX once, immutable)
//   ref:active:<sponsor>   -> { <referee>, ... }   (set of referees who completed a quest)
//   ref:earned:<sponsor>   -> <micro>              (int, cUSD earned by referees, micro)
//   ref:paid:<sponsor>     -> <micro>              (int, bonus already attested, micro)
//
// ANTI-SYBIL (documented):
//   - One sponsor per referee, written once (NX) and never overwritten.
//   - No self-referral (referee !== sponsor is rejected before any write).
//   - A referee only accrues earnings once they complete a REAL quest
//     (accrueEarning is called from the attest route after onchain completion).
//   - owed is clamped to >= 0 (a sponsor can never be owed less-than-zero).

import { createClient, type VercelKV } from "@vercel/kv";
import { generateCode } from "./ref-code";

/** Sponsor's share of referee earnings, in percent. Env-tunable, default 10. */
export const REFERRAL_PCT = Number(process.env.NEXT_PUBLIC_REFERRAL_PCT ?? "10");

const WEI_PER_MICRO = 10n ** 12n; // 1 micro-cUSD = 1e12 wei (cUSD has 18 decimals)

/** Floor cUSD wei to whole micro-cUSD (1e-6 cUSD). Safe JS integer for any realistic total. */
export function weiToMicro(wei: bigint): number {
  return Number(wei / WEI_PER_MICRO);
}

/** Inverse of weiToMicro: whole micro-cUSD back to wei. */
export function microToWei(micro: number): bigint {
  return BigInt(Math.trunc(micro)) * WEI_PER_MICRO;
}

/**
 * Bonus owed (micro-cUSD) = floor(earned * pct%) - paid, clamped to >= 0.
 * Pure so it can be unit-tested without KV.
 */
export function computeOwedMicro(earnedMicro: number, paidMicro: number, pct: number): number {
  return Math.max(0, Math.floor((earnedMicro * pct) / 100) - paidMicro);
}

// Lazily build the client only when both env vars exist. Returns null otherwise
// so all callers fall through to their no-op/default branch. Memoized.
let cached: VercelKV | null | undefined;
function kv(): VercelKV | null {
  if (cached !== undefined) return cached;
  // Accept both env-var conventions: the legacy Vercel KV names (KV_REST_API_*)
  // and the Upstash-for-Redis marketplace integration names (UPSTASH_REDIS_REST_*).
  // Whichever the store injects, the client builds — no silent no-op on a name mismatch.
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? createClient({ url, token }) : null;
  return cached;
}

const norm = (a: string) => a.toLowerCase();
const sponsorKey = (referee: string) => `ref:sponsor:${norm(referee)}`;
const activeKey = (sponsor: string) => `ref:active:${norm(sponsor)}`;
const earnedKey = (sponsor: string) => `ref:earned:${norm(sponsor)}`;
const paidKey = (sponsor: string) => `ref:paid:${norm(sponsor)}`;
const codeKey = (code: string) => `ref:code:${code.toUpperCase()}`;
const codeOfKey = (wallet: string) => `ref:codeof:${norm(wallet)}`;

/**
 * The sponsor's stable invite code. Generated once and never changed: returns the
 * existing code if the wallet already has one, otherwise mints a fresh unique code
 * (claimed via SET NX, retried on the astronomically rare collision) and binds it
 * to the wallet (also NX, so the wallet's code is immutable). Returns null if KV is
 * absent — the Invite UI then falls back to the raw ?ref=<wallet> link.
 */
export async function getOrCreateCode(wallet: string): Promise<string | null> {
  const c = kv();
  if (!c) return null;
  try {
    const existing = await c.get<string>(codeOfKey(wallet));
    if (existing) return existing;
    for (let i = 0; i < 6; i++) {
      const code = generateCode();
      const claimed = await c.set(codeKey(code), norm(wallet), { nx: true });
      if (claimed !== "OK") continue; // collision — try another code
      const bound = await c.set(codeOfKey(wallet), code, { nx: true });
      if (bound === "OK") return code;
      // A concurrent request already bound a code to this wallet — use that one.
      return (await c.get<string>(codeOfKey(wallet))) ?? code;
    }
    return null; // could not find a free code (practically impossible)
  } catch {
    return null;
  }
}

/** Resolve an invite code to its sponsor wallet, or null if unknown / KV absent. */
export async function resolveCode(code: string): Promise<string | null> {
  const c = kv();
  if (!c) return null;
  try {
    return await c.get<string>(codeKey(code));
  } catch {
    return null;
  }
}

/**
 * Pose the sponsor of a referee, only if not already set and referee !== sponsor.
 * Uses SET NX so a sponsor is immutable once written (no overwrite ever).
 * No-op (returns false) if KV is absent or on any error.
 */
export async function linkSponsor(referee: string, sponsor: string): Promise<boolean> {
  if (norm(referee) === norm(sponsor)) return false; // no self-referral
  const c = kv();
  if (!c) return false;
  try {
    const res = await c.set(sponsorKey(referee), norm(sponsor), { nx: true });
    return res === "OK";
  } catch {
    return false;
  }
}

/** Read a referee's sponsor, or null if none / KV absent. */
export async function getSponsor(referee: string): Promise<string | null> {
  const c = kv();
  if (!c) return null;
  try {
    return await c.get<string>(sponsorKey(referee));
  } catch {
    return null;
  }
}

/**
 * Mark a referee active for their sponsor (call after the referee completes a
 * real quest). Adds them to the sponsor's active set; idempotent via SADD.
 * No-op if the referee has no sponsor, or KV is absent / errors.
 */
export async function markRefereeActive(referee: string): Promise<void> {
  const c = kv();
  if (!c) return;
  try {
    const sponsor = await getSponsor(referee);
    if (!sponsor) return;
    await c.sadd(activeKey(sponsor), norm(referee));
  } catch {
    /* no-op */
  }
}

/** Number of distinct active referees for a sponsor (0 if KV absent / error). */
export async function countActive(sponsor: string): Promise<number> {
  const c = kv();
  if (!c) return 0;
  try {
    return (await c.scard(activeKey(sponsor))) ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Accrue the sponsor's share of a referee's reward. Call after a referee
 * completes a REAL quest, with the reward amount signed for them. Adds the FULL
 * reward (in micro) to the sponsor's earned tally; the pct% is applied at read
 * time in owedWei(). No-op if the referee has no sponsor / KV absent / errors.
 */
export async function accrueEarning(referee: string, amountWei: bigint): Promise<void> {
  const c = kv();
  if (!c) return;
  try {
    const sponsor = await getSponsor(referee);
    if (!sponsor) return;
    const micro = weiToMicro(amountWei);
    if (micro <= 0) return;
    await c.incrby(earnedKey(sponsor), micro);
  } catch {
    /* no-op */
  }
}

/** Total cUSD (micro) earned by a sponsor's referees (0 if KV absent / error). */
export async function getEarnedMicro(sponsor: string): Promise<number> {
  const c = kv();
  if (!c) return 0;
  try {
    return (await c.get<number>(earnedKey(sponsor))) ?? 0;
  } catch {
    return 0;
  }
}

/** Referral bonus already attested to this sponsor, in micro-cUSD. */
export async function getPaidMicro(sponsor: string): Promise<number> {
  const c = kv();
  if (!c) return 0;
  try {
    return (await c.get<number>(paidKey(sponsor))) ?? 0;
  } catch {
    return 0;
  }
}

/** Increment the paid tally by an attested bonus amount (call only when signed). */
export async function incrPaid(sponsor: string, amountWei: bigint): Promise<void> {
  const c = kv();
  if (!c) return;
  try {
    const micro = weiToMicro(amountWei);
    if (micro <= 0) return;
    await c.incrby(paidKey(sponsor), micro);
  } catch {
    /* no-op */
  }
}

/**
 * Bonus the sponsor can still claim, in cUSD wei.
 * = floor(earned * REFERRAL_PCT%) - paid, clamped to >= 0.
 */
export async function owedWei(sponsor: string): Promise<bigint> {
  const [earned, paid] = await Promise.all([getEarnedMicro(sponsor), getPaidMicro(sponsor)]);
  return microToWei(computeOwedMicro(earned, paid, REFERRAL_PCT));
}
