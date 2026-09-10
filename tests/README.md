# Tests

Neuf suites exécutées sur Chromium en émulation Pixel 7 avec entrées tactiles,
une suite qui tourne en Node pur, plus un simulateur d'équilibrage sans
navigateur.

| Suite | Vérifications | Couvre |
| --- | --- | --- |
| `suite.mjs` | 32 | moteur 0.2 : démarrage, tactile, caméra, streaming de chunks, sauvegarde |
| `audit.mjs` | 26 | audit 0.2 : mémoire, quadrants, déterminisme, NOUVEAU répété, performance |
| `fog03.mjs` | 45 | Fog Nomad 0.3 : brume, dégâts, mort, restart, ressources, poids, sac, endurance, jeter |
| `fog04.mjs` | 48 | Fog Nomad 0.4 : ressources sur 100 chunks, objets jetés, cristal, feu, 10 cycles mort/restart |
| `regressions.mjs` | 31 | défauts historiques déjà corrigés, visés par leur **mécanisme** |
| `balance05.mjs` | 36 | Fog Nomad 0.5 : distribution des ressources, courbe de pression, bandes de marge, run longue, qualité |
| `world05.mjs` | 19 | Living World 0.5 : distribution du directeur de monde, déterminisme, 500 chunks — **sans navigateur** |
| `ui05.mjs` | 47 | Living World 0.5 : modes de jeu, disposition du HUD, menu de sac, ration, `?worldtest` |
| `art06.mjs` | 35 | 0.6 / 0.6a : visibilité du banc, assets, orientation du modèle, ancrage du sac, rigidité |
| `prologue07.mjs` | 45-48 | 0.7 : le prologue **joué** d'un bout à l'autre, trois profils, quinze points de contrôle — le total dépend du nombre de profils joués (`PROFILS=`) |
| `prologue_negatifs.mjs` | 22 | 0.7.1 : les **refus** — ce que le jeu ne doit PAS laisser franchir |
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
node tests/art06.mjs
node tests/prologue07.mjs               # les trois parcours : ~90 min d'horloge
PROFILS=normal node tests/prologue07.mjs   # un seul parcours, pour itérer
node tests/prologue_negatifs.mjs        # les refus
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

**Une règle apprise quatre fois.** `delta` est plafonné à 40 ms par image :
sous rendu logiciel, le temps de JEU avance moins vite que l'horloge murale.
Toute assertion écrite en secondes réelles ou en « au moins N unités » finit par
mesurer la cadence de la machine de test plutôt que la règle du jeu. On mesure
donc en temps de jeu (`state.elapsed`), ou on attend la condition.

La quatrième fois, c'était `fog03.mjs`, qui laissait 1 400 ms de montre au
moteur pour ramasser une ressource. Trois exécutions consécutives du même code,
sous charge : **45/45, 38/45, 42/45**. Rien n'avait changé dans le jeu. Quand la
collecte ne se faisait pas, sept vérifications tombaient en cascade — un sac
vide n'a plus rien à peser ni rien à jeter, et la courbe du poids sortait à
0,147 au lieu de 0,46 parce qu'une collecte en cours applique son propre
ralentissement. Ces attentes sont maintenant des attentes de CONDITION, et la
suite est revenue à 45/45.

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

**Les suites du moteur démarrent en `?sansprologue`.** Le prologue est devenu
l'ouverture par défaut du jeu en 0.7, et les six suites qui mesurent le moteur
chargeaient `index.html` sans paramètre : elles se seraient mises à mesurer un
joueur immobile pendant quarante secondes, une Brume tenue en place et un
inventaire vidé, sans que rien n'annonce que ce n'était plus le jeu qu'elles
croyaient mesurer. `regressions.mjs` vérifie désormais que la mise en scène
n'existe pas sous ce paramètre — le mécanisme, pas le symptôme. L'ouverture par
défaut est couverte par `prologue07.mjs`, qui la joue.

**`prologue07.mjs` JOUE, il ne lit pas.** Un pilote installé dans la page tient
le joystick image par image, se dirige vers le sac, appuie sur les boutons,
ramasse, jette quand le sac pèse, brûle son bois et court quand la marge se
resserre. Il ne saute aucune étape : `sauterA()` serait bien plus rapide et ne
prouverait rien, parce que la question posée est « combien de temps met-on à
traverser » et qu'une étape sautée ne dure rien.

Trois défauts sont sortis de là, et aucun n'était visible en lisant l'état du
jeu : une condition de sortie qui valait `NaN` et empêchait le prologue de se
terminer, un kit de départ identique à la recette du feu qui mettait deux beats
dans le désordre, et un joueur tué par un sac qu'il n'avait jamais choisi de
remplir. Voir `FOG_NOMAD_0.7_PROLOGUE.md`, §7.

**Un test qui ne peut pas échouer ne prouve rien.** `prologue_negatifs.mjs`
existe entièrement à cause d'une vérification verte pour la mauvaise raison. En
0.7, « le condamné a bien disparu » passait parce que l'acteur sortait du champ
et qu'une règle « trop loin devant » mettait son drapeau `vivant` à faux — la
Brume ne l'avait jamais touché, elle ne le pouvait pas. Trois parcours complets
ont été nécessaires pour s'en apercevoir.

Chaque contrôle de ce fichier met le jeu dans un état où une étape NE DOIT PAS
se franchir. Et chacun vérifie ensuite que **le refus n'est pas une panne** :
un contrôle qui refuse toujours ne prouve rien non plus.

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
