# Tests

Sept suites exécutées sur Chromium en émulation Pixel 7 avec entrées tactiles,
une suite qui tourne en Node pur, plus un simulateur d'équilibrage sans
navigateur. **279 vérifications au total.**

| Suite | Vérifications | Couvre |
| --- | --- | --- |
| `suite.mjs` | 32 | moteur 0.2 : démarrage, tactile, caméra, streaming de chunks, sauvegarde |
| `audit.mjs` | 26 | audit 0.2 : mémoire, quadrants, déterminisme, NOUVEAU répété, performance |
| `fog03.mjs` | 44 | Fog Nomad 0.3 : brume, dégâts, mort, restart, ressources, poids, sac, endurance, jeter |
| `fog04.mjs` | 47 | Fog Nomad 0.4 : ressources sur 100 chunks, objets jetés, cristal, feu, 10 cycles mort/restart |
| `regressions.mjs` | 28 | défauts historiques déjà corrigés, visés par leur **mécanisme** |
| `balance05.mjs` | 36 | Fog Nomad 0.5 : distribution des ressources, courbe de pression, bandes de marge, run longue, qualité |
| `world05.mjs` | 19 | Living World 0.5 : distribution du directeur de monde, déterminisme, 500 chunks — **sans navigateur** |
| `ui05.mjs` | 47 | Living World 0.5 : modes de jeu, disposition du HUD, menu de sac, ration, `?worldtest` |
| `simulate05.mjs` | — | quatre profils de jeu simulés sur la vraie `CONFIG`, sans navigateur |

## Lancer

```bash
npx http-server -p 8123 -c-1 .        # ou : python3 -m http.server 8123
node tests/suite.mjs
node tests/audit.mjs
node tests/fog03.mjs
node tests/fog04.mjs
node tests/regressions.mjs
node tests/balance05.mjs
node tests/ui05.mjs
node tests/world05.mjs         # pas de navigateur, exécution directe
node tests/simulate05.mjs      # pas de navigateur, exécution directe
```

Variables d'environnement : `URL` et `FOG_URL` (défaut
`http://127.0.0.1:8123/index.html`), `CHROME_PATH`, `PLAYWRIGHT_PATH`,
`SHOT_DIR` pour les captures.

## Principes

**`regressions.mjs` vise les causes, pas les symptômes.** Un test qui ne
vérifie que le symptôme laisse revenir la cause sous une autre forme. Il ne
teste donc pas « l'écran n'est pas noir » mais « aucune fleur n'est
instanciée », qui est le mécanisme réellement identifié.

**Le rendu de test est logiciel (SwiftShader).** Les FPS relevés ne transposent
pas sur un GPU réel : ils servent à comparer avant/après, pas à valider la
cible mobile. Cette validation-là se fait sur appareil, avec `?fogtest`.

**Une règle apprise trois fois.** `delta` est plafonné à 40 ms par image : sous
rendu logiciel, le temps de JEU avance moins vite que l'horloge murale. Toute
assertion écrite en secondes réelles ou en « au moins N unités » finit par
mesurer la cadence de la machine de test plutôt que la règle du jeu. On mesure
donc en temps de jeu (`state.elapsed`), ou on attend la condition.

**Une suite à la fois.** Sous SwiftShader, deux suites lancées en parallèle se
disputent le processeur : des attentes calibrées expirent, et une douzaine de
vérifications tombent pour une raison qui n'est pas dans le code. Cela s'est
produit dans cette session et a coûté une fausse piste. Les suites sont
séquentielles.

**Un échantillon rare demande un balayage.** Le cristal ne représente que
4,4 % des poses : les 25 chunks visibles n'en contiennent souvent que deux ou
trois, et conclure d'un échantillon de 3 revient à mesurer le hasard. Les
tests qui portent sur sa répartition balayent le monde jusqu'à disposer d'un
échantillon utilisable, et vérifient d'abord qu'ils l'ont.

**`simulate05.mjs` ne prouve pas que le jeu est intéressant.** Un modèle
n'hésite pas, ne se lasse pas, ne change pas d'avis. Il sert à détecter un
équilibre absurde — une run de 40 secondes, une run infinie — et rien d'autre.

**Une sonde n'est pas un détail.** `HORIZON.game` expose l'état de run ;
ajouter une seconde propriété du même nom pour exposer l'API l'a silencieusement
écrasée, et douze vérifications sont tombées d'un coup. L'API complète est
exposée sous `HORIZON.jeu`. Un objet de sonde qui grandit à chaque version est
un espace de noms : les collisions y sont aussi réelles qu'ailleurs.

**`world05.mjs` tourne sans navigateur.** Il rejoue les fonctions de terrain du
moteur en doublure et interroge le directeur de monde sur 2 500 chunks. Il
vérifie notamment qu'une même graine parcourue en avant puis à l'envers produit
exactement les mêmes décisions : c'est l'invariant qui permet à la sauvegarde de
ne stocker qu'une graine.
