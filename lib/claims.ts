// Claim history via QuestEscrow v1.1 RewardClaimed events — exact amounts and
// streaks, straight from the logs (the v1 contract emitted nothing, forcing a
// lastClaim brute-scan; v1.1 fixed that). Pure parsing is separated from I/O so
// it can be unit-tested without a network.
import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import { celo } from "viem/chains";
import { QUEST_ESCROW_ADDRESS } from "./quest-abi";

/** Celo block the v1.1 escrow was deployed in (2026-07-17) — logs start here. */
export const ESCROW_V11_DEPLOY_BLOCK = 72672539n;

export const REWARD_CLAIMED_EVENT = parseAbiItem(
  "event RewardClaimed(uint256 indexed questId, address indexed wallet, uint256 amount, uint256 streak)",
);

export type ClaimEntry = {
  questId: string;
  amount: bigint;
  streak: number;
  blockNumber: bigint;
  /** unix seconds; 0 until the block timestamp is resolved */
  claimedAt: number;
};

type RewardClaimedLog = Log<bigint, number, false, typeof REWARD_CLAIMED_EVENT>;

/** Pure: decoded logs → entries (no timestamps yet), newest block first. */
export function parseClaimLogs(logs: RewardClaimedLog[]): ClaimEntry[] {
  return logs
    .map((l) => ({
      questId: (l.args.questId ?? 0n).toString(),
      amount: l.args.amount ?? 0n,
      streak: Number(l.args.streak ?? 0n),
      blockNumber: l.blockNumber ?? 0n,
      claimedAt: 0,
    }))
    .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));
}

const client = createPublicClient({
  chain: celo,
  transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org"),
});

/** Fetch the wallet's claims from v1.1 logs and resolve block timestamps. */
export async function fetchClaims(wallet: `0x${string}`): Promise<ClaimEntry[]> {
  const logs = await client.getLogs({
    address: QUEST_ESCROW_ADDRESS,
    event: REWARD_CLAIMED_EVENT,
    args: { wallet },
    fromBlock: ESCROW_V11_DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const entries = parseClaimLogs(logs as RewardClaimedLog[]);
  // resolve timestamps, one lookup per distinct block
  const times = new Map<bigint, number>();
  for (const e of entries) {
    if (!times.has(e.blockNumber)) {
      const b = await client.getBlock({ blockNumber: e.blockNumber });
      times.set(e.blockNumber, Number(b.timestamp));
    }
    e.claimedAt = times.get(e.blockNumber) ?? 0;
  }
  return entries;
}

/** Read the wallet's current daily streak for one quest (v1.1 getter). */
export async function fetchStreak(questId: bigint, wallet: `0x${string}`): Promise<number> {
  try {
    const s = (await client.readContract({
      address: QUEST_ESCROW_ADDRESS,
      abi: [
        {
          type: "function",
          name: "streak",
          stateMutability: "view",
          inputs: [{ type: "uint256" }, { type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ] as const,
      functionName: "streak",
      args: [questId, wallet],
    })) as bigint;
    return Number(s);
  } catch {
    return 0; // never-fail: pre-v1.1 escrow or RPC hiccup → just hide the badge
  }
}
