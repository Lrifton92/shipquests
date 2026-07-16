import { network } from "hardhat";

/**
 * Deploy QuestEscrow (v1.1: events + daily streak) to the network passed via `--network`.
 *
 * Required env (configuration variables):
 *   - DEPLOYER_PRIVATE_KEY : deployer account (hardhat keystore; needs a little CELO for gas)
 *   - SIGNER_ADDRESS       : backend EIP-712 attestor (holds no funds)
 *   - CELO_RPC_URL         : RPC endpoint (e.g. https://forno.celo.org)
 *
 * v1 escrow (2026-06-07): 0x2f575fb83A3c71f7E5C482b19a3C33F8146b491f — left as-is;
 * quests already funded there stay claimable/withdrawable on v1.
 */
async function main() {
  const signerAddress = process.env.SIGNER_ADDRESS;
  if (!signerAddress || !/^0x[0-9a-fA-F]{40}$/.test(signerAddress)) {
    throw new Error("SIGNER_ADDRESS env var missing or not a valid address");
  }

  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  console.log("Chain id:", await publicClient.getChainId());
  console.log("Deployer:", deployer.account.address);
  console.log("Backend signer:", signerAddress);

  const escrow = await viem.deployContract("QuestEscrow", [
    signerAddress as `0x${string}`,
  ]);

  console.log("QuestEscrow v1.1 deployed at:", escrow.address);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Set NEXT_PUBLIC_QUEST_ESCROW_ADDRESS to this address (Vercel + lib/quest-abi.ts fallback).");
  console.log(`  2. Verify: npx hardhat verify --network celo ${escrow.address} ${signerAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
