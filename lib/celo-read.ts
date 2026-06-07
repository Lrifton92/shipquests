// Keyless onchain completion verification (Celo explorer txlist).
// Same pattern as DropRank's keyless reads: pure, fetcher-injected for tests.

type Tx = { to: string; from: string; isError: string; timeStamp: string };
export type TxFetcher = (wallet: string) => Promise<Tx[]>;

/** Default keyless fetcher: Celo Blockscout-compatible txlist endpoint. */
export async function defaultFetcher(wallet: string): Promise<Tx[]> {
  const url = `https://explorer.celo.org/api?module=account&action=txlist&address=${wallet}&sort=desc`;
  const r = await fetch(url);
  const j = await r.json();
  return Array.isArray(j.result) ? j.result : [];
}

/**
 * True iff `wallet` has a successful tx (isError === "0") to `target`
 * with a timestamp at or after `questStart` (unix seconds; 0 = any time).
 */
export async function hasCompletedQuest(
  wallet: string,
  target: string,
  questStart: number,
  fetcher: TxFetcher = defaultFetcher,
): Promise<boolean> {
  const txs = await fetcher(wallet);
  const w = wallet.toLowerCase();
  const t = target.toLowerCase();
  return txs.some(
    (tx) =>
      tx.to?.toLowerCase() === t &&
      tx.from?.toLowerCase() === w &&
      tx.isError === "0" &&
      Number(tx.timeStamp) >= questStart,
  );
}
