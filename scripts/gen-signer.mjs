// Génère la clé EOA du signer backend (signe les attestations EIP-712, ne détient aucun fonds).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "node:fs";
const pk = generatePrivateKey();
const acct = privateKeyToAccount(pk);
writeFileSync(".signer-backend.secret", `SIGNER_ADDRESS=${acct.address}\nSIGNER_PRIVATE_KEY=${pk}\n`);
console.log("SIGNER_ADDRESS (public, = argument du constructeur QuestEscrow) :");
console.log(acct.address);
console.log("\nClé privée sauvée dans .signer-backend.secret (gitignored — JAMAIS commitée).");
