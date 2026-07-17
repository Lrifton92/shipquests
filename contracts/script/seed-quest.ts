import { network } from "hardhat";
import { getAddress, parseUnits } from "viem";

/**
 * Seed one real, funded quest on the v1.1 QuestEscrow (Celo mainnet).
 * Does approve(cUSD → escrow) then createQuest in a single signed run.
 *
 * Signer: DEPLOYER_PRIVATE_KEY (hardhat keystore) — this wallet is the sponsor
 * and must hold `MAX_REWARD × COMPLETIONS` cUSD plus a little CELO for gas.
 *
 * Defaults reproduce the "Claim your daily G$" DAILY box from docs/seed-quests.md
 * (the quest that exercises the streak UI). Override any field via env:
 *   TARGET, TOKEN, MIN_REWARD, MAX_REWARD, COMPLETIONS, KIND(0=OneShot,1=Daily),
 *   DEADLINE_DAYS, ESCROW.
 *
 * Run:
 *   CELO_RPC_URL=https://forno.celo.org \
 *   npx hardhat run script/seed-quest.ts --network celo
 */

const CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a"; // canonical Celo dollar
const ESCROW_V11 = "0x5fe1c9c7fd942245f0145204f6285310a466d6bf";

const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const ESCROW_ABI = [
  {
    type: "function",
    name: "createQuest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "token", type: "address" },
      { name: "minReward", type: "uint256" },
      { name: "maxReward", type: "uint256" },
      { name: "maxCompletions", type: "uint256" },
      { name: "kind", type: "uint8" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "nextId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

async function main() {
  const target = getAddress(env("TARGET", "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A").toLowerCase());
  const token = getAddress(env("TOKEN", CUSD).toLowerCase());
  const escrow = getAddress(env("ESCROW", ESCROW_V11).toLowerCase());
  const minReward = parseUnits(env("MIN_REWARD", "0.02"), 18);
  const maxReward = parseUnits(env("MAX_REWARD", "0.15"), 18);
  const completions = BigInt(env("COMPLETIONS", "4"));
  const kind = Number(env("KIND", "1")); // 1 = Daily
  const deadlineDays = Number(env("DEADLINE_DAYS", "30"));

  const fund = maxReward * completions;

  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const sponsor = wallet.account.address;

  const now = Number((await publicClient.getBlock()).timestamp);
  const deadline = BigInt(now + deadlineDays * 86400);

  console.log("Chain id:", await publicClient.getChainId());
  console.log("Sponsor :", sponsor);
  console.log("Escrow  :", escrow);
  console.log("Target  :", target);
  console.log(
    `Reward  : ${env("MIN_REWARD", "0.02")}–${env("MAX_REWARD", "0.15")} × ${completions}  →  fund ${(Number(fund) / 1e18).toFixed(4)} cUSD`,
  );
  console.log("Kind    :", kind === 1 ? "Daily" : "One-shot", "| deadline in", deadlineDays, "days");

  const bal = (await publicClient.readContract({
    address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [sponsor],
  })) as bigint;
  if (bal < fund) {
    throw new Error(
      `Sponsor holds ${(Number(bal) / 1e18).toFixed(4)} cUSD but the quest locks ${(Number(fund) / 1e18).toFixed(4)}. Top up ${sponsor} first.`,
    );
  }

  const allowance = (await publicClient.readContract({
    address: token, abi: ERC20_ABI, functionName: "allowance", args: [sponsor, escrow],
  })) as bigint;
  if (allowance < fund) {
    console.log("approve cUSD → escrow …");
    const approveHash = await wallet.writeContract({
      address: token, abi: ERC20_ABI, functionName: "approve", args: [escrow, fund],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log("  approve tx:", approveHash);
  } else {
    console.log("allowance already sufficient, skipping approve");
  }

  console.log("createQuest …");
  const hash = await wallet.writeContract({
    address: escrow, abi: ESCROW_ABI, functionName: "createQuest",
    args: [target, token, minReward, maxReward, completions, kind, deadline],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const nextId = (await publicClient.readContract({
    address: escrow, abi: ESCROW_ABI, functionName: "nextId",
  })) as bigint;

  console.log("");
  console.log("Quest created — tx:", hash, "(block", receipt.blockNumber + ")");
  console.log("New quest id:", (nextId - 1n).toString());
  console.log("Verify in the app: /quest/" + (nextId - 1n).toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
