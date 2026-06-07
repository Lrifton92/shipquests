// EIP-712 claim attestation signer (server-only — uses SIGNER_PRIVATE_KEY).
//
// Domain + types MUST mirror contracts/src/QuestEscrow.sol exactly, otherwise
// the recovered signer won't match the trusted `signer` and claim() reverts:
//   domain: name="ShipQuests" version="1" chainId verifyingContract
//   Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)
import { privateKeyToAccount } from "viem/accounts";

export async function signClaim(p: {
  questId: bigint;
  wallet: `0x${string}`;
  amount: bigint;
  deadline: bigint;
  signerPk: `0x${string}`;
  contract: `0x${string}`;
  chainId: number;
}) {
  const account = privateKeyToAccount(p.signerPk);
  const domain = {
    name: "ShipQuests",
    version: "1",
    chainId: p.chainId,
    verifyingContract: p.contract,
  } as const;
  const types = {
    Claim: [
      { name: "questId", type: "uint256" },
      { name: "wallet", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  } as const;
  const message = {
    questId: p.questId,
    wallet: p.wallet,
    amount: p.amount,
    deadline: p.deadline,
  };
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "Claim",
    message,
  });
  return { signature, domain, types, message };
}
