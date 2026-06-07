import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { linkSponsor } from "@/lib/referral";

// POST { wallet, ref } — attach `ref` as the sponsor of `wallet`.
// Anti-abuse: both addresses are validated, self-referral is rejected, and an
// existing sponsor is NEVER overwritten (SET NX inside linkSponsor). Returns
// { ok } where ok reflects whether a *new* link was actually written; a no-op
// (already linked / self / KV absent) returns ok:false and is not an error.
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
  if (typeof ref !== "string" || !isAddress(ref)) {
    return NextResponse.json({ error: "bad ref" }, { status: 400 });
  }

  const ok = await linkSponsor(wallet, ref);
  return NextResponse.json({ ok });
}
