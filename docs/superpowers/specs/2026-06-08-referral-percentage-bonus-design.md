# Referral — bonus 10% des gains des filleuls (design)

Date : 2026-06-08 · Statut : à valider

## But

Activer le referral déjà poussé (code KV anti-sybil + branche attest + onglet Invite)
en câblant le **claim du bonus** et en passant à un modèle **« le parrain touche 10 %
des gains cUSD de ses filleuls »**. Affichage dans l'onglet Invite : bonus dû, barre
cooldown 24 h (+ montant), nombre de parrainés, taux 10 %.

Contexte vérifié :
- Contrat `QuestEscrow` (Celo, `0x2f57…491f`) : `OneShot` = 1 claim/wallet à vie ;
  `Daily` = 1 claim / 24 h. `amount` borné onchain à `[minReward, maxReward]`. Escrow =
  `maxReward × maxCompletions`, `left` global décrémenté à chaque claim.
- La quête referral doit donc être **Daily** pour des bonus récurrents.
- `lib/referral.ts`, branche referral de `/api/attest`, capture `?ref`, onglet Invite,
  i18n EN/FR/ES/PT : déjà en place. Le **claim du bonus n'était pas câblé** (page
  `/quest/[id]` incompatible avec une quête cachée) → c'est le trou qu'on ferme ici.

## Modèle économique

- Taux `PCT` = 10 %, configurable via `NEXT_PUBLIC_REFERRAL_PCT` (défaut "10").
- Filleul complète une **vraie** quête → l'attest signe un montant `A` → on crédite le
  parrain de `PCT% × A` (« earned »).
- **Dû** du parrain = `floor(earned × PCT%) − paid`, clampé ≥ 0.
- Le parrain réclame via une **quête referral Daily** ; chaque claim paie
  `min(dû, maxReward)` (≥ minReward exigé), 1 fois / 24 h.

## KV (schéma)

Adresses en minuscules. Montants stockés en **micro-cUSD** (entier, 1e-6 cUSD) et non en
wei : `INCRBY` Redis/Upstash est int64 ; les wei (≈1e17) débordent au bout de ~90 claims.
Conversion : `micro = wei / 1e12`, `wei = micro × 1e12` (précision perdue < 1e-6 cUSD,
négligeable).

| Clé | Type | Rôle |
|---|---|---|
| `ref:sponsor:<filleul>` | string (SET NX) | parrain immuable du filleul (existant) |
| `ref:active:<parrain>`  | set | filleuls actifs → **nombre de parrainés** (existant) |
| `ref:earned:<parrain>`  | int (micro) | gains cumulés des filleuls (nouveau) |
| `ref:paid:<parrain>`    | int (micro) | bonus déjà versé au parrain (nouveau, remplace `ref:rewarded`) |

Fallback sans KV : toutes les fonctions restent **no-op / défaut** (comme aujourd'hui).

## Flux

1. **Filleul complète une vraie quête** (`POST /api/attest/{questId}`, branche normale) :
   - vérif onchain `hasCompletedQuest` (existant)
   - `markRefereeActive(filleul)` (existant)
   - **`accrueEarning(filleul, A)`** : `earned[parrain] += weiToMicro(A)` (nouveau)
2. **Parrain consulte Invite** (`GET /api/referral/stats?wallet=`) → renvoie
   `{ active, earnedWei, owedWei, pct }`.
3. **Parrain réclame** (bouton Réclamer dans Invite → `POST /api/attest/{REFERRAL_QUEST_ID}`) :
   - `owed = owedWei(parrain)` ; si `owed < q.minReward` → `409` (pas encore assez)
   - `amount = min(owed, q.maxReward)` (pas de tirage aléatoire pour la quête referral)
   - signe l'attestation EIP-712, **`incrPaid(parrain, amount)`**
   - le front broadcast `claim(...)` onchain (24 h cooldown ensuite)

## Changements code

**`lib/referral.ts`**
- Garder : `linkSponsor`, `getSponsor`, `markRefereeActive`, `countActive`.
- Retirer le modèle « compte » (`getRewarded`, `incrRewarded`, `eligibleBonuses`).
- Ajouter : `accrueEarning(referee, amountWei)`, `getEarnedMicro`, `getPaidMicro`,
  `owedWei(sponsor)`, `incrPaid(sponsor, amountWei)`, helpers `weiToMicro`/`microToWei`,
  `REFERRAL_PCT` (lit `NEXT_PUBLIC_REFERRAL_PCT`, défaut 10).

**`app/api/attest/[questId]/route.ts`**
- Branche referral : remplacer le check `eligibleBonuses` (compte) par `owedWei ≥ minReward` ;
  `amount = min(owed, maxReward)` au lieu de `pickBoundedReward` ; `incrPaid` au lieu de
  `incrRewarded`.
- Branche normale : après calcul de `amount`, `accrueEarning(wallet, amount)`.

**`app/api/referral/stats/route.ts`**
- Renvoyer `{ active, earnedWei, owedWei, pct }` (au lieu de `{ active, eligible }`).

**`app/invite/page.tsx`**
- Afficher : **bonus dû** (cUSD), **barre cooldown 24 h** avec montant dedans (lit
  `lastClaim[REFERRAL_QUEST_ID][wallet]` onchain), **nombre de parrainés**, **taux 10 %**.
- Remplacer le lien `/quest/[id]` par un bouton **Réclamer** : `attest` → `claim` onchain
  (réutilise le pattern de `app/quest/[id]/page.tsx`). Désactivé si cooldown actif ou `owed=0`.

**i18n** : clés bonus / cooldown / « Réclamer » / parrainés / taux, en EN/FR/ES/PT.

**Env (Vercel prod)** : `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
`NEXT_PUBLIC_REFERRAL_QUEST_ID`, `NEXT_PUBLIC_REFERRAL_PCT=10`.

## Opérationnel (Soufian, après le code)

1. Provisionner un store **Vercel KV** (Storage → injecte `KV_REST_API_URL/TOKEN`).
2. Créer la quête referral via `/sponsor` : `target` = adresse de l'escrow (la cache de la
   grille), `token` = cUSD, `min` = 0.01, `max` = 0.10, `maxCompletions` = au choix (finance
   le pot), `kind` = **Daily**, échéance 30 j. Noter l'`id`.
3. Poser `NEXT_PUBLIC_REFERRAL_QUEST_ID = <id>` et `NEXT_PUBLIC_REFERRAL_PCT = 10` en env Vercel.
4. Redéployer.

## Tradeoffs assumés

- **Accrual à la signature** : on crédite le parrain quand l'attest signe le gain du
  filleul, même si le filleul ne broadcast pas sa tx. Même tradeoff MVP que le code existant.
- **Précision micro-cUSD** : arrondi sous 1e-6 cUSD ignoré (anti-overflow int64).
- **Race** : double-claim simultané du parrain théoriquement possible entre `owedWei` et
  `incrPaid` ; borné par le cooldown 24 h onchain + le plafond `maxReward`. Acceptable MVP.

## Tests

- `lib/referral.test.ts` : `weiToMicro`/`microToWei` (round-trip + overflow), `owedWei`
  (earned×pct − paid, clamp ≥ 0, sous-minReward), no-op sans KV.
- Typecheck + `vitest run` verts avant push.
