// Make sure the connected wallet is on Celo before sending a write transaction.
// Desktop wallets (Brave Wallet, Rabby, MetaMask) keep whatever network the user
// last used, so a write would otherwise revert with a chain-mismatch error. This
// prompts the wallet to switch (and to ADD Celo first if it doesn't know it).
//
// Throws if the user rejects the switch — callers already handle that via their
// existing "user rejected" / chain-mismatch error paths. No-op when already on Celo.
import { celo } from "viem/chains";
import type { WalletClient } from "viem";

export async function ensureCelo(client: WalletClient): Promise<void> {
  let current = 0;
  try {
    current = await client.getChainId();
  } catch {
    current = 0;
  }
  if (current === celo.id) return;

  try {
    await client.switchChain({ id: celo.id });
  } catch (e) {
    // 4902 (and some wallets' messages) = chain unknown to the wallet. Add it, then switch.
    const code = (e as { code?: number })?.code;
    const msg = String((e as Error)?.message ?? "");
    if (code === 4902 || /unrecognized chain|not been added|add.*chain/i.test(msg)) {
      await client.addChain({ chain: celo });
      await client.switchChain({ id: celo.id });
    } else {
      throw e;
    }
  }
}
