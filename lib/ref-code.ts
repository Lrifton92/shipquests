// Short, shareable referral codes. Each wallet gets ONE stable code (generated
// once, never changes) stored in KV; the code resolves back to the sponsor wallet.
// Format: 6 chars of Crockford base32 (digits + A-Z minus I, L, O, U) — unambiguous
// and case-insensitive. 32^6 ≈ 1.07e9 combos. Codes are normalized to UPPERCASE.

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 chars, Crockford base32
export const CODE_LEN = 6;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`);

/** Uppercase a candidate so codes are case-insensitive everywhere. */
export function normalizeCode(s: string): string {
  return s.toUpperCase();
}

/** True if `s` is a well-formed invite code (after uppercasing). */
export function isRefCode(s: string): boolean {
  return CODE_RE.test(normalizeCode(s));
}

/**
 * Generate a random invite code. Uses crypto.getRandomValues with a 5-bit mask
 * over the 32-char alphabet, so the distribution is unbiased (each byte value
 * 0..255 maps uniformly onto 0..31 via & 31). Available in Node 19+ and browsers.
 */
export function generateCode(): string {
  const buf = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[buf[i] & 31];
  return out;
}
