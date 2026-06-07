import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { linkSponsor, resolveCode } from "@/lib/referral";
import { isRefCode } from "@/lib/ref-code";

// POST { wallet, ref } — attach `ref` as the sponsor of `wallet`. `ref` may be a
// short invite code (resolved to the sponsor wallet via KV) or a raw wallet
// address (legacy links). Anti-abuse: inputs validated, self-referral rejected,
// and an existing sponsor is NEVER overwritten (SET NX inside linkSponsor).
// Returns { ok } where ok reflects whether a *new* link was actually written; a
// no-op (already linked / self / unknown code / KV absent) returns ok:false and
// is not an error.
export async function POST(req: NextRequest) {
  let body: { wallet?: unknown; ref?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { wallet, ref } = body;
  if (typeof wallet !== "string" || !isAddress(wallet)) {
    return NextResponse.json({ error: "bad wallet" }, { status: 400 });
  }
  if (typeof ref !== "string" || !(isAddress(ref) || isRefCode(ref))) {
    return NextResponse.json({ error: "bad ref" }, { status: 400 });
  }

  // Resolve a code to its sponsor wallet; an address is used as-is.
  const sponsor = isAddress(ref) ? ref : await resolveCode(ref);
  if (!sponsor) return NextResponse.json({ ok: false }); // unknown code / KV absent

  const ok = await linkSponsor(wallet, sponsor);
  return NextResponse.json({ ok });
}
