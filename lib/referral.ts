// Off-chain referral attribution on Vercel KV. The QuestEscrow contract is
// immutable, so referral lives entirely off-chain and rewards reuse the normal
// quest/claim mechanism (a dedicated "referral quest" the sponsor funds onchain).
//
// FALLBACK CONTRACT (important): when the KV env vars are absent (local dev, or a
// preview without a store attached) EVERY function degrades to a no-op and NEVER
// throws. linkSponsor/markRefereeActive/incrRewarded become silent no-ops and the
// readers return safe defaults (null / 0). Referral simply does nothing — the
// claim flow and the rest of the app keep working unchanged. @vercel/kv only
// touches the network at runtime, so importing this module is safe at build time.
//
// KEY SHAPE (all addresses lowercased so case never splits a sponsor):
//   ref:sponsor:<referee>  -> <sponsor>            (string, SET NX once, immutable)
//   ref:active:<sponsor>   -> { <referee>, ... }   (set of referees who completed a quest)
//   ref:rewarded:<sponsor> -> <n>                  (int, bonuses already attested)
//
// ANTI-SYBIL (documented):
//   - One sponsor per referee, written once (NX) and never overwritten.
//   - No self-referral (referee !== sponsor is rejected before any write).
//   - A referee only "counts" once they complete a REAL quest (markRefereeActive
//     is called from the attest route after onchain completion succeeds). A bare
//     visit with ?ref never advances the sponsor's counter.
//   - Set semantics make activation idempotent (the same referee counts once even
//     if they complete several quests).
//   - eligibleBonuses is clamped to countActive (a sponsor can never claim more
//     bonuses than distinct active referees).

import { createClient, type VercelKV } from "@vercel/kv";

// Lazily build the client only when both env vars exist. Returns null otherwise
// so all callers fall through to their no-op/default branch. Memoized.
let cached: VercelKV | null | undefined;
function kv(): VercelKV | null {
  if (cached !== undefined) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  cached = url && token ? createClient({ url, token }) : null;
  return cached;
}

const norm = (a: string) => a.toLowerCase();
const sponsorKey = (referee: string) => `ref:sponsor:${norm(referee)}`;
const activeKey = (sponsor: string) => `ref:active:${norm(sponsor)}`;
const rewardedKey = (sponsor: string) => `ref:rewarded:${norm(sponsor)}`;

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

/** Number of referral bonuses already attested to this sponsor. */
export async function getRewarded(sponsor: string): Promise<number> {
  const c = kv();
  if (!c) return 0;
  try {
    return (await c.get<number>(rewardedKey(sponsor))) ?? 0;
  } catch {
    return 0;
  }
}

/** Increment the rewarded counter (call only when a bonus is actually signed). */
export async function incrRewarded(sponsor: string): Promise<void> {
  const c = kv();
  if (!c) return;
  try {
    await c.incr(rewardedKey(sponsor));
  } catch {
    /* no-op */
  }
}

/**
 * Bonuses the sponsor can still claim = active referees minus already rewarded,
 * clamped to >= 0 (a sponsor can never claim more bonuses than active referees).
 */
export async function eligibleBonuses(sponsor: string): Promise<number> {
  const [active, rewarded] = await Promise.all([countActive(sponsor), getRewarded(sponsor)]);
  return Math.max(0, active - rewarded);
}
