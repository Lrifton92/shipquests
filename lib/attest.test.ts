import { it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { signClaim } from "./attest";
import { recoverTypedDataAddress } from "viem";

it("produces a signature recoverable to the signer", async () => {
  const pk = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const acct = privateKeyToAccount(pk);
  const { signature, types, domain, message } = await signClaim({
    questId: 1n,
    wallet: "0x000000000000000000000000000000000000dEaD",
    amount: 2n,
    deadline: 9999999999n,
    signerPk: pk,
    contract: "0x0000000000000000000000000000000000000001",
    chainId: 42220,
  });
  const rec = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: "Claim",
    message,
    signature,
  });
  expect(rec.toLowerCase()).toBe(acct.address.toLowerCase());
});
