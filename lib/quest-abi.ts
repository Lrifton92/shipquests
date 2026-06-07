// Typed QuestEscrow ABI + Celo read helpers (frontend/backend shared).
// ABI extracted from contracts/artifacts/src/QuestEscrow.sol/QuestEscrow.json.
// Regenerate after contract changes; do not hand-edit the ABI array below.
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";

/** Celo mainnet chain id (signing + claims target this chain). */
export const CELO_CHAIN_ID = 42220 as const;

/**
 * Deployed escrow address. Placeholder until deploy (Task 6) — read from env so
 * the same build can target the deployed contract without a rebuild.
 */
export const QUEST_ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_QUEST_ESCROW_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const QUEST_ESCROW_ABI = [
  { inputs: [{ internalType: "address", name: "_signer", type: "address" }], stateMutability: "nonpayable", type: "constructor" },
  {
    inputs: [
      { internalType: "uint256", name: "questId", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "bytes", name: "sig", type: "bytes" },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "target", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "minReward", type: "uint256" },
      { internalType: "uint256", name: "maxReward", type: "uint256" },
      { internalType: "uint256", name: "maxCompletions", type: "uint256" },
      { internalType: "uint8", name: "kind", type: "uint8" },
      { internalType: "uint64", name: "deadline", type: "uint64" },
    ],
    name: "createQuest",
    outputs: [{ internalType: "uint256", name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "domainSeparator", outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "lastClaim",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "nextId", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "quests",
    outputs: [
      { internalType: "address", name: "sponsor", type: "address" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "minReward", type: "uint256" },
      { internalType: "uint256", name: "maxReward", type: "uint256" },
      { internalType: "uint256", name: "left", type: "uint256" },
      { internalType: "uint64", name: "deadline", type: "uint64" },
      { internalType: "uint8", name: "kind", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "signer", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "uint256", name: "questId", type: "uint256" }], name: "withdrawUnclaimed", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "", type: "uint256" }], name: "withdrawn", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
] as const;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || "https://forno.celo.org"),
});

export type OnchainQuest = {
  target: `0x${string}`;
  minReward: bigint;
  maxReward: bigint;
  deadline: bigint;
  /**
   * Quest start (unix seconds) used to bound completion verification.
   * NOTE: QuestEscrow does NOT store a per-quest `start` — the `quests` getter
   * exposes {sponsor,target,token,minReward,maxReward,left,deadline,kind} only.
   * We therefore return 0, meaning ANY successful tx from the wallet to `target`
   * counts as completion. This is a deliberate, documented relaxation; tightening
   * it would require either a `start`/`createdAt` field on the contract or reading
   * the createQuest block via logs.
   */
  start: number;
};

/** Read a quest's verification-relevant fields from the escrow on Celo. */
export async function readQuestOnchain(questId: bigint): Promise<OnchainQuest> {
  const [, target, , minReward, maxReward, , deadline] = await publicClient.readContract({
    address: QUEST_ESCROW_ADDRESS,
    abi: QUEST_ESCROW_ABI,
    functionName: "quests",
    args: [questId],
  });
  return { target, minReward, maxReward, deadline: BigInt(deadline), start: 0 };
}
