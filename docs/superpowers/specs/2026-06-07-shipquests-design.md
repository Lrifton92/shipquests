# ShipQuests — Design Spec

**Date** : 2026-06-07
**Auteur** : Soufian (lrifton92) + Claude
**Statut** : approuvé (design), spec en revue

## 1. Contexte & objectif

ShipQuests est un MiniApp **Celo / MiniPay** soumis au programme **Celo Proof of Ship** (Season 2).
- **Deadline tracking onchain** : 22 juin 2026, 23:59 GMT (on est le 7 juin → ~15 jours).
- **Scoring** : impact-driven = vraies transactions de vrais users sur MiniPay. Top 50 partagent $5 000 USDT.
- **Objectif réaliste** : entrer dans le **Top 50** (barre basse confirmée par l'analyse de ~110 projets : moyenne qualité 6.4/10, beaucoup de MVP testnet). Gain principal = réputation onchain Talent + place Top 50, pas le jackpot.
- **Critères d'éligibilité non négociables** (raisons de rejet observées) : contrat **déployé sur Celo mainnet**, repo **open source**, **activité réelle** (txs), référence Celo claire.

## 2. Concept

**Marketplace de quêtes "quest-to-earn" sponsorisées, à vérification onchain.**

Un sponsor crée une quête (« fais une action sur mon contrat `0x…` → gagne X cUSD ») et dépose la cagnotte dans un escrow onchain. Un user complète l'action sur l'app du sponsor, puis réclame sa récompense sur ShipQuests ; la complétion est **vérifiée onchain** avant le payout.

Pourquoi ce concept (analyse data-driven du repo `celo-org/Proof-of-Ship`) :
- **Créneau sous-exploité** : quest/task-to-earn est peu encombré (vs paiements/savings = 42% du champ, saturés).
- **Densité de transactions maximale et pilotable** : chaque complétion = txs onchain sur l'escrow.
- **Edge de Soufian** : réutilise directement le moteur DropRank (vérification onchain + attestation EIP-712).
- **Effet réseau** : génère des txs sur les apps des sponsors → utile à tout l'écosystème Proof of Ship (= vivier de sponsors captifs).

## 3. Décisions verrouillées

| Décision | Choix |
|---|---|
| Cœur | Quest-to-earn (marketplace de quêtes) |
| Financement | Sponsorisé par les tâches (zéro coût pour Soufian) |
| Amorçage | **C** : découverte authentique entre builders Proof of Ship (J1) → public MiniPay (scale) |
| Vérification | **A** : onchain — backend lit le RPC Celo, signe une attestation EIP-712, le contrat vérifie le signer |
| Garde-fou anti-farming | Actions à **vraie substance** (test réel d'app, vrai usage), jamais de wash/réciprocité forcée |
| Scope contrat | Complet d'emblée (`createQuest` + `claim`) |
| Scope UI | Séquencé : boucle **claim** d'abord (ce qui scorE), UI sponsor self-serve en fast-follow |

## 4. Point technique central

Un smart contract **ne peut pas** lire une transaction passée sur un autre contrat (l'EVM n'a pas accès à l'historique des txs). La vérification onchain se fait donc en deux temps — **pattern identique à DropRankBadge** (déjà codé par Soufian) :

1. **Off-chain** : le backend lit le RPC / Blockscout Celo et confirme que le user a bien exécuté l'action attendue sur le `targetContract` du sponsor.
2. **Onchain** : le backend signe une **attestation EIP-712** `(questId, wallet, deadline)` ; le user présente cette signature à `QuestEscrow.claim()` ; le contrat vérifie que le signer est le signer de confiance, puis paie.

## 5. Architecture (3 unités isolées)

### 5.1 `QuestEscrow.sol` (Celo mainnet, Solidity 0.8.x, Hardhat)
Dérivé du pattern DropRankBadge (EIP-712 + signer de confiance).
- `createQuest(targetContract, rewardToken=cUSD, rewardPerCompletion, maxCompletions)` + transfert du pot (rewardPerCompletion × maxCompletions) du sponsor vers l'escrow → **tx onchain**.
- `claim(questId, deadline, signature)` : vérifie l'attestation EIP-712 du signer de confiance, interdit le double-claim (mapping `claimed[questId][wallet]`), décrémente les places, transfère `rewardPerCompletion` cUSD au user → **tx onchain**.
- `withdrawUnclaimed(questId)` : le sponsor récupère le reliquat après expiration.
- Garde-fous : `msg.sender == wallet` signé (anti-replay cross-wallet), `block.timestamp <= deadline` (anti-replay temporel), reentrancy guard sur les transferts.

### 5.2 Backend de vérification (route Next.js, never-fail)
- Lit le RPC Celo (`forno.celo.org` ou public) + Blockscout Celo pour confirmer la tx du user sur `targetContract` (to = targetContract, from = wallet, succès, postérieure à la création de la quête).
- Si valide → signe l'attestation EIP-712 avec le `SIGNER_PRIVATE_KEY` (env serveur, jamais exposé).
- Réutilise le moteur de lecture onchain de DropRank.

### 5.3 MiniApp (Next.js, compatible MiniPay)
- **Compat MiniPay** : MiniPay injecte `window.ethereum` dans son webview → connexion directe (pas de WalletConnect classique). Le "hook MiniPay" demandé par le brief.
- Écrans : **liste des quêtes** · **détail / compléter → claim** (chemin critique, en premier) · **créer une quête** (formulaire sponsor, fast-follow).
- Stablecoin : cUSD (+ cKES si pertinent pour MiniPay).

## 6. Flux de transactions (= scoring)

1. Sponsor crée quête + dépose cUSD → **tx sur QuestEscrow**
2. User fait l'action sur l'app du sponsor → **tx sur l'app du sponsor** (aide le sponsor)
3. User claim (avec attestation) → **tx sur QuestEscrow** (payout)

→ Chaque quête complétée = **2 txs sur l'escrow ShipQuests** + 1 sur l'app du sponsor. L'écosystème transacte via ShipQuests.

## 7. Anti-sybil / conformité (critique)

Celo + Talent ont des agents anti-farming. Pour rester du bon côté **et** scorer réellement :
- Les actions sponsorisées doivent avoir une **utilité réelle** (tester une feature, premier usage sincère), jamais des txs vides réciproques.
- Pas de réciprocité forcée en boucle fermée entre 2 comptes (= wash, pénalisé).
- L'amorçage par les builders = **découverte authentique**, pas collusion.

## 8. Plan de ship (7 → 22 juin)

- **J1-2** : `QuestEscrow.sol` + tests + déploy Celo mainnet + vérif Celoscan (fork DropRankBadge)
- **J3-5** : MiniApp — liste + détail + **claim** + compat MiniPay
- **J6-7** : backend vérif onchain + attestation EIP-712
- **J8** : seed manuel de la 1ère quête + E2E sur mainnet
- **J9-12** : amorçage builders (Telegram Proof of Ship) → vraies complétions ; UI sponsor self-serve (fast-follow) ; ouverture public
- **J13-15** : itération traction, repo propre + open source, profil/projet Talent à jour, soumission campagne

## 9. Stack
Next.js (App Router) · viem · Solidity 0.8.x (Hardhat, pattern DropRankBadge) · MiniPay (window.ethereum) · RPC/Blockscout Celo · cUSD/cKES.

## 10. Critères de succès
- [ ] `QuestEscrow` déployé + vérifié sur Celo mainnet
- [ ] Repo public open source, GitHub actif sur la période
- [ ] Boucle complète fonctionnelle : créer → compléter → vérifier onchain → payout
- [ ] ≥ 1 quête seedée + premières complétions réelles (builders)
- [ ] Projet créé + enregistré sur talent.app dans la campagne Proof of Ship
- [ ] Vraies transactions de vrais users distincts d'ici le 22 juin

## 11. Risques
- **Amorçage sponsors/users** (risque #1) : mitigé par seed manuel J8 + démarchage builders Telegram + ouverture public.
- **Conformité anti-farming** : mitigé par actions à substance réelle (§7).
- **Délai 15j** : mitigé par réutilisation maximale de DropRank + scope séquencé (claim d'abord).
- **MiniPay specifics** : compat webview à valider tôt (J3-5).
