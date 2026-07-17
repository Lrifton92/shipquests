# ShipQuests Arcade — « Gas Chase » (Pacman-like old school)

**Date** : 2026-07-17 · **Statut** : validé (Soufian)
**But produit** : page `/arcade` dans l'app ShipQuests — mini-jeu nostalgique old school, habillage crypto léger. Zéro onchain.
**But campagne** : feature réelle + commits publics pendant Celo Proof of Ship (1-27 juil.).

## Expérience

Pacman classique, nostalgie assumée : labyrinthe arcade, « READY! » avant chaque vie,
sons 8-bit, fantômes qui passent bleus et clignotent avant de redevenir dangereux,
animation de mort, high-score persistant. Habillage ShipQuests :

- Pastilles = **cUSD** (points) · Power pellet = **airdrop** (fantômes vulnérables)
- Fantômes = **gas spikes** (4, couleurs distinctes, yeux old school)
- Fruits bonus = logos crypto pixel (CELO…) apparaissant au centre
- Overlay CRT léger (scanlines + vignette), police pixel, palette sombre ShipQuests

## Architecture (approche A validée)

- `lib/arcade/engine.ts` — état pur du jeu : grille (chaîne ASCII → murs/pastilles/tunnel),
  tick(dt) → positions, collisions, score, vies, niveaux. Aucune dépendance DOM.
- `lib/arcade/ghosts.ts` — IA fantômes simplifiée fidèle : modes scatter/chase alternés
  par timer, frightened sur airdrop, retour maison une fois mangés. Cibles par fantôme
  (style Blinky/Pinky) sans le pathfinding exact d'origine.
- `lib/arcade/engine.test.ts` + `ghosts.test.ts` — vitest : mouvements, collisions,
  cooldowns frightened, score, transitions de vie/niveau.
- `app/arcade/page.tsx` + `Arcade.tsx` (client) — canvas, boucle rAF, rendu pixel
  (integer scaling), inputs clavier (flèches/WASD) + tactile (swipe n'importe où sur
  le canvas ; pas de D-pad visible — swipe only validé implicitement mobile-first).
- `lib/arcade/sfx.ts` — sons 8-bit WebAudio générés (waka, power, eat-ghost, death,
  jingle d'intro) ; muet par défaut, bouton son. Pas d'assets externes.
- High-score : `localStorage("sq-arcade-hiscore")`.
- Entrée nav : carte/lien dans le menu existant (même pattern que les autres pages).

## Hors scope (YAGNI)

Onchain (streak/quêtes/cUSD réels), niveaux procéduraux, leaderboard serveur,
multijoueur, i18n au-delà des libellés existants EN/FR.

## Critères de succès

- Jouable au doigt dans MiniPay/mobile ET clavier desktop.
- Une partie complète : 3 vies, niveaux qui accélèrent, game over, hi-score sauvegardé.
- `npx tsc --noEmit` clean, tests moteur verts, aucune régression des 17 tests existants.
