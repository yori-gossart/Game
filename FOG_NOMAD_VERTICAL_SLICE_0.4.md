# FOG NOMAD — VERTICAL SLICE 0.4

État du dépôt au démarrage de cette version — établi, non supposé :

| | |
| --- | --- |
| Branche de départ | `fog-nomad-vertical-slice-0.4`, créée depuis `96de001` |
| HEAD au démarrage | `96de001` « Sort les captures de test du dépôt » |
| Production Vercel | `horizon-proto-ten.vercel.app` — sert **Horizon 0.2** (`e9e3641`), pas la 0.3 |
| Dernière 0.3 déployée | préversion `horizon-proto-git-fog-nomad-core-test-…` (`96de001`) |
| Référence de sûreté | `e9e3641` (Horizon 0.2 stabilisée) — **conservée, non restaurée** |
| Tests à l'état initial | `suite.mjs` 32/32 · `audit.mjs` 26/26 · `fog03.mjs` 41/41 |

Cette version ne rejoue pas la 0.3. Elle corrige trois faiblesses observées en
jeu réel, ajoute deux usages aux ressources, et donne au jeu une première
identité visuelle.

---

## 1. Ce qui a été corrigé, et pourquoi

### 1.1 Les ressources disparaissaient au bout d'un moment

**Symptôme rapporté** : après une exploration prolongée, plus rien à ramasser.

**Mesure avant de corriger.** La sonde compte les ressources réellement en
scène, chunk par chunk, en téléportant le joueur de plus en plus loin :

| Trajet | chunk 0 | 20 | 40 | 60 | 80 | 100 |
| --- | --- | --- | --- | --- | --- | --- |
| tout droit (−Z) | 58 | 47 | 51 | 44 | 65 | 65 |
| **diagonale (+X −Z)** | 58 | 31 | **0** | **0** | **0** | **0** |

En diagonale, la génération s'arrêtait complètement : **510 chunks d'affilée
vides, 4 973 tirages rejetés** par le filtre de couloir.

**Cause.** Deux décisions de la 0.3 se combinaient mal.

1. L'écart latéral qui décide de la nature d'une ressource était mesuré depuis
   `state.startX`, le X du **départ de la run**, figé.
2. Chaque type avait une bande latérale **stricte** (`lateralMin`,
   `lateralMax`) : bois 0–20, pierre 14–44, cristal 34–78. Au-delà de 78 unités
   de l'axe, aucun type n'était éligible — plus aucune ressource, jamais.

Un joueur qui s'écarte durablement sort donc du domaine de génération et n'y
revient plus. Le trajet en diagonale y arrive en une quarantaine de chunks.

**Correctif.** Les bandes strictes sont remplacées par une **pondération
gaussienne continue** : chaque type garde un écart de prédilection
(`lateralPeak`) et une largeur (`lateralSpread`), mais sa probabilité ne tombe
jamais exactement à zéro. Le tirage se fait en deux temps — d'abord
l'existence, puis le type — de sorte que la latéralité décide de **ce qu'on
trouve**, plus de **s'il y a quelque chose**.

```js
export function lateralWeights(lateral) {
  const weights = {}; let total = 0;
  for (const key of RESOURCE_KEYS) {
    const spec = CONFIG.resources[key];
    const d = (lateral - spec.lateralPeak) / spec.lateralSpread;
    const w = spec.abundance * Math.exp(-d * d);
    weights[key] = w; total += w;
  }
  return { weights, total };
}
```

En complément, l'axe de fuite n'est plus figé : il **suit lentement** le joueur
(`axisTrackSpeed` 0,9 u/s) avec un retard borné (`axisMaxLag` 70 u). Un détour
coûte donc toujours quelque chose — l'axe ne rattrape pas assez vite pour
l'annuler — mais une dérive prolongée ne laisse plus le joueur dans le vide. Le
retard est plafonné **au moment de la lecture** et non seulement à la mise à
jour, sinon une téléportation laisserait l'axe indéfiniment en arrière.

**Mesure après correctif**, même protocole :

| Trajet | chunk 0 | 20 | 40 | 60 | 80 | 100 |
| --- | --- | --- | --- | --- | --- | --- |
| tout droit | 60 | 51 | 43 | 45 | 52 | 46 |
| diagonale | 60 | 33 | 21 | 35 | 20 | 34 |
| latéral pur (−X) | 41 | 45 | 31 | 52 | 39 | 49 |

Les trois types sont présents sur les trois trajets, jusqu'au centième chunk.

### 1.2 Les objets jetés disparaissaient

En 0.3, jeter un objet le retirait du sac sans rien poser au sol : la décision
était testée, la récupération n'existait pas.

**Correctif.** `dropOne()` matérialise l'objet dans le chunk courant, avec un
léger éparpillement (`CONFIG.drop.scatter`) et un délai de réarmement
(`CONFIG.drop.rearmDelay` = 1,4 s) sans lequel il serait ramassé aussitôt
reposé.

**Durée de vie.** Un objet jeté existe **tant que son chunk reste actif**.
Avalé par la brume ou évacué par le streaming, il est perdu. C'est la règle la
plus simple qui évite une mémoire de monde qui grossit sans fin, et elle est
cohérente avec le reste : les feux suivent la même.

**Le piège historique a été évité.** Les objets posés sont des `Mesh`
ordinaires partageant géométrie et matériau par type — jamais d'`InstancedMesh`,
dont la corruption sur le GPU cible est documentée dans
`AUDIT_PERFORMANCE_BUGS_0.2.md`, B0. Ils passent par exactement la même
fonction (`spawnResourceMesh`) que les ressources procédurales : un seul chemin
de rendu à valider, un seul à maintenir.

### 1.3 Les ressources ne servaient qu'au score

Deux actions, pas trois, et aucune ne demande de menu.

**Impulsion de cristal** — coûte 1 cristal, repousse le mur de brume de
`CONFIG.crystal.pushDistance` = 42 unités. Mesuré : +41,4 u. C'est une sortie
de secours qui se paye avec la ressource la plus chère à aller chercher.

**Feu de répit** — coûte 2 bois + 1 pierre, dure 18 s. Tant qu'il brûle et que
le joueur reste dans son rayon (7 u), la brume avance à 16 % de sa vitesse et
le souffle remonte de 48 points.

> La brume **ne s'arrête jamais**. Mesuré, feu allumé : 1,8 u en 2,5 s au lieu
> de 11,5 u. Un feu qui l'arrêterait pour plusieurs minutes supprimerait la
> tension au lieu de l'aménager.

Les deux boutons n'apparaissent que lorsque l'action est possible : il n'y a
rien à apprendre avant de les voir.

---

## 2. Le poids reste central

Rien de la 0.4 ne permet de porter plus. Une seule formule, exportée et
testable, et aucun nombre magique ailleurs :

```js
export function speedFromWeight(ratio) {
  const r = Math.min(1, Math.max(0, ratio));
  return 1 - (1 - CONFIG.weight.speedAtFull) * Math.pow(r, CONFIG.weight.curve);
}
```

Mesuré en jeu : 0 % → 1,000 · 25 % → 0,917 · 50 % → 0,788 · 75 % → 0,634 ·
100 % → 0,460. Décroissance stricte, encore jouable à plein.

Les deux nouvelles actions **augmentent** la pression du poids plutôt qu'elles
ne la relâchent : un feu demande 2 bois + 1 pierre, soit 27 unités de charge
qu'il a fallu porter jusque-là. Le cristal pèse peu (5) mais c'est celui qu'il
faut aller chercher le plus loin de l'axe.

---

## 3. Ce que la brume est devenue

La brume était une teinte grise uniforme au-dessus de l'horizon : de la météo,
pas une menace. Elle est maintenant l'élément visuel signature.

**Quatre nappes, aucune particule.** Un système de particules aurait coûté des
milliers de quads pour un résultat moins lisible sur un écran de téléphone. Le
relief vient de trois choses qui ne coûtent rien par image :

- **la géométrie** — chaque nappe est pleinement opaque jusqu'à une hauteur
  `crestY`, puis s'efface sur `soft` unités ; cette hauteur **ondule** le long
  du mur (deux sinusoïdes de périodes incommensurables), ce qui remplace un
  bord rectiligne par un front de nuage ;
- **l'étagement en Z** — quatre nappes de +30 à −8 autour du plan de la brume,
  de la plus haute et sombre à une avant-garde basse et translucide qui déborde
  vers le joueur et **avale les objets progressivement** au lieu de les couper ;
- **la dérive** — chaque nappe glisse à sa propre vitesse ; comme leurs crêtes
  se croisent, la silhouette du front change en permanence sans qu'un seul
  sommet ne soit recalculé.

L'alpha et les traînées voyagent dans un attribut de couleur à **4
composantes**, accepté nativement par Three.js : aucun shader, aucune texture.

**Le corps est un prune très sombre** (`0x241a2e`) et la crête s'éclaircit vers
un lavande malsain (`0x9d7fb4`). Le contraste avec le ciel pâle et le sol vert
est franc, et les objets encore éclairés par le brouillard atmosphérique se
découpent en clair sur la masse sombre.

**Deux défauts de mon propre code, trouvés en mesurant :**

1. Un matériau transparent **double face** est rendu en deux passes par
   Three.js. Chaque nappe coûtait donc **deux** appels de rendu au lieu d'un.
   `forceSinglePass: true` donne exactement la même image pour quatre appels au
   lieu de huit.
2. Le recentrage de la dérive était appliqué **par image** et non par unité de
   temps : l'amplitude aurait été trois fois plus grande à 20 FPS qu'à 60.
   Intégré sur `delta`, l'équilibre est de ~21 unités quelle que soit la
   cadence (mesuré, stabilisé en moins de 20 s).

---

## 4. Le reste de la passe graphique

| Élément | Ce qui a changé | Coût |
| --- | --- | --- |
| Ciel | Dôme à dégradé vertical par couleurs de sommets, suivant la caméra | +1 appel |
| Terrain | Grain de teinte par sommet (deux ondes) et assombrissement selon l'altitude | 0 |
| Arbres | Facteur d'élancement et mise à l'échelle non uniforme du houppier | 0 |
| Rochers | Mise à l'échelle non uniforme | 0 |
| Personnage | Buste effilé, épaules, chevelure, membres pivotant à la hanche et à l'épaule | +3 objets |
| Sac | Cinq paliers : gonflement borné et trois caisses de débordement | +3 objets |
| Ressources | Géométries assemblées reconnaissables — rondins croisés, bloc et éclats, cristal élancé visible de loin | 0 |
| Collecte | Anneau de progression et étiquette `+N` montante | 0 |

Les variations d'arbres, de rochers et de terrain passent toutes par des
attributs déjà transmis (couleur d'instance, couleur de sommet, matrice
d'instance) : elles ne coûtent **aucun appel de rendu supplémentaire**. C'était
la condition pour les retenir.

**Les caisses du sac ne sont pas filles du sac.** Le sac se met à l'échelle par
palier ; des caisses filles auraient grossi avec lui jusqu'à couvrir la tête du
personnage. Elles sont filles du personnage et repositionnées sur le dessus réel
du sac à chaque image. Le gonflement lui-même est borné : au dernier palier le
sac doit rester un sac sur un dos, pas un bloc qui avale la silhouette.

---

## 5. Performances

### 5.1 Comparaison 0.3 / 0.4

Même machine, même monde (seed 424242), même parcours de 14 s, mesures
**alternées** entre les deux versions pour que la dérive du rasteriseur frappe
les deux également. Deux passes chacune :

| | 0.3 | 0.4 | Écart |
| --- | --- | --- | --- |
| FPS moyen | 23,6 · 23,2 | 21,4 · 21,9 | **−8 %** |
| Image médiane | 43,4 · 44,3 ms | 46,1 · 48,9 ms | +8 % |
| 95ᵉ centile | 71,7 · 73,8 ms | 80,8 · 78,0 ms | +10 % |
| Appels de rendu | 36 · 37 | 38 · 38 | **+1 à +2** |
| Triangles | ~7 300 | ~7 300 | 0 |
| Géométries | 25 | 30 | +5 |
| Textures | 0 | 0 | 0 |
| Chunks actifs | 25 | 25 | 0 |
| Objets de scène | 186 | 182 | −4 |
| Tas JS | 11,0–11,7 MB | 11,9–12,2 MB | +1 MB |

### 5.2 Coût du mur de brume, face à lui

Configurations **alternées en boucle dans la même page**, 96 images utiles
chacune, joueur face au mur à 28 unités — le pire cas de remplissage :

| Configuration | Image médiane | Appels |
| --- | --- | --- |
| aucune nappe | 44,5 ms | 38 |
| 2 nappes | 46,6 ms | 40 |
| 3 nappes | 46,6 ms | 41 |
| **4 nappes (retenu)** | **51,0 ms** | **42** |

Avant optimisation, le passage de 2 à 4 nappes coûtait 11,3 ms. Deux mesures
l'ont ramené à 4,4 ms :

- `forceSinglePass` (voir §3) — huit appels ramenés à quatre ;
- les deux nappes arrière **s'arrêtent au niveau du sol** au lieu d'être
  enterrées à −11 : sous cette limite la nappe centrale est totalement opaque,
  donc les fragments dessinés là étaient invisibles. Image identique, vérifiée
  par capture avant/après.

### 5.3 Ce que ces chiffres ne disent pas

**Tous les FPS de ce document viennent d'un rasteriseur logiciel
(SwiftShader).** Ils ne transposent pas sur un GPU réel et ne servent qu'à
comparer 0.3 et 0.4 entre elles.

Le surcoût mesuré est presque entièrement du **remplissage** — quatre grands
plans en fondu alpha plus un dôme de ciel. C'est exactement la charge qu'un
rasteriseur logiciel paie le plus cher, et c'est aussi celle à laquelle un GPU
mobile est le plus sensible. Les deux effets vont en sens contraire et je ne
sais pas lequel domine.

> **Objectif « 30 FPS minimum » : NON MESURABLE ici.** Il ne pourra l'être que
> sur le téléphone. Le mode `?fogtest` affiche FPS, pire image, densité de
> pixels, appels, triangles, géométries, textures, chunks, objets et ressources
> en temps réel, précisément pour que ce contrôle se fasse sur l'appareil.

Les garde-fous restent en place : résolution adaptative par paliers
(1,35 → 1,15 → 1,0) avant toute réduction de qualité, 25 chunks bornés, aucune
texture.

---

## 6. Mémoire, sur dix cycles mort / recommencer

Chaque cycle allume un feu, consomme un cristal, jette un objet, tue le joueur
et relance. C'est le cycle qui accumule le plus d'état.

| | Départ | Après 10 cycles |
| --- | --- | --- |
| Géométries GPU | 33 | 32 |
| Objets de scène | 176 | 176 |
| Ressources actives / listées | 35 / 35 | 35 / 35 |
| Objets jetés au sol | 0 | 0 |
| Feux actifs / registres de feu | 0 / 0 | 0 / 0 |
| Chunks au registre de ressources | 13 | 12 |
| Tas JS | 11,26 MB | 12,37 MB |
| Runs stockées | — | 10 / 20 (plafond) |

Les deux **registres par chunk** sont contrôlés, pas seulement les objets
qu'ils contiennent : un registre qui grossit sans fin serait une fuite même si
la scène restait propre.

---

## 7. Tests

**166 vérifications, 166 PASS.**

| Fichier | Vérifications | Objet |
| --- | --- | --- |
| `tests/suite.mjs` | 32 | moteur : démarrage, tactile, caméra, chunks, sauvegarde |
| `tests/audit.mjs` | 26 | audit 0.2 : continuité, fuites, sauts, mondes multiples |
| `tests/fog03.mjs` | 42 | règles 0.3 : brume, dégâts, mort, poids, endurance |
| `tests/fog04.mjs` | 47 | **nouveau** — les trois correctifs et les deux actions |
| `tests/regressions.mjs` | 19 | **nouveau** — défauts historiques, par leur mécanisme |

### Deux tests de la 0.3 ont changé, volontairement

**`ressources: aucun cristal dans le couloir central`** supposait les bandes
latérales strictes — c'est-à-dire précisément le mécanisme qui vidait le monde.
Il devient : **le cristal reste rare dans le couloir central** (≤ 25 % des
cristaux à moins de 30 unités de l'axe ; mesuré 0 %). C'est la rareté qui fait
le détour, pas une frontière.

**`mort: déclenchée après séjour prolongé`** attendait une durée fixe de 4,1 s
en temps réel. Or `delta` est plafonné à 40 ms par image : sous rendu logiciel,
le temps de jeu avance moins vite que le temps réel, et la 0.4 rendant ~8 %
moins vite, l'attente est passée juste sous le seuil. Le test attend désormais
**la mort**, pas une durée, et une assertion s'ajoute sur ce qui compte
réellement : la mort survient en 2 à 4,5 s de brume (mesuré 2,54 s).

C'était un défaut du test, pas du jeu : la règle « ~3 s de survie dans la
brume » est vérifiée, en temps de jeu.

### `tests/regressions.mjs` vise les causes, pas les symptômes

Un test qui ne vérifie que le symptôme laisse revenir la cause sous une autre
forme. Chaque contrôle vise donc le mécanisme documenté :

| Défaut historique | Ce qui est vérifié |
| --- | --- |
| Artefact noir des fleurs | aucune fleur instanciée ; présentes en géométrie fusionnée |
| Coordonnées négatives | 25 chunks à (−1500, −1500), aucune couleur de sommet hors bornes, aucune exception |
| Bord du monde visible | le brouillard sature (62 u) avant la portée du terrain (64 u) ; l'eau (92 u) le dépasse |
| Tirer-pour-rafraîchir | `touch-action: none` sur html, body, `#game`, `#joystick` |
| `setPointerCapture` | aucune exception sur un identifiant de pointeur invalide |
| Soleil invisible | présent, visible, à 53,7 u de la caméra pour un plan lointain à 82 |
| Résolution adaptative | jamais sous un pixel CSS, valeur prise dans les paliers configurés |
| Sac mal monté | Z local négatif (dos), plus large que le torse |
| Écran de mort au démarrage | `hidden` **et** `display: none` |

---

## 8. Ce que la 0.4 ne fait pas

Conformément à la règle absolue : aucun monstre, aucun combat, aucune arme,
aucune quête, aucun PNJ, aucun multijoueur, aucune boutique, aucune publicité,
aucun Battle Pass, aucune saison, aucun compte, aucun backend, aucun arbre de
compétences, aucune architecture de service en ligne.

**Deux actions, pas un système d'artisanat.** Le feu a une recette fixe de deux
ingrédients et le cristal n'en a pas. Il n'y a ni menu, ni établi, ni
déblocage.

### Limites qui restent

- **Une run purement prudente ne se termine toujours pas.** La brume avance à
  vitesse constante ; un joueur qui ne ramasse rien conserve +1,6 u/s. Le seul
  levier existe déjà et vaut 0 : `CONFIG.fog.acceleration`.
- **La durée de 3 à 8 minutes n'est pas garantie** et n'a pas été mesurée en
  automatique : simuler cinq minutes en rendu logiciel prend cinq minutes, et
  un robot ne joue pas comme un humain. La seule run humaine consignée dure
  8 min 42 — au-delà de la fourchette visée — et se trouve dans
  `CORE_TEST_RESULTS.md`.
- **Aucune validation sur GPU réel** de la 0.4 à ce stade.
- **Le multi-touch réel** (joystick et caméra simultanés) reste à confirmer sur
  un vrai écran.
- **Le mécanisme de l'artefact des fleurs reste inexpliqué.** On sait ce qui le
  déclenche et comment l'éviter ; on ne sait pas pourquoi. Voir B0.

---

## 9. Paramètres ajoutés en 0.4

Tout reste dans `CONFIG`, en tête de `fognomad.mjs`.

| Groupe | Clé | Valeur | Rôle |
| --- | --- | --- | --- |
| ressources | `lateralPeak` / `lateralSpread` | 0/30 · 32/28 · 64/32 | écart de prédilection et largeur, par type |
| | `abundance` | 1,00 · 0,78 · 0,36 | fréquence relative, bois / pierre / cristal |
| | `spawnDensity` | 0,30 | densité globale, indépendante du type |
| | `axisTrackSpeed` / `axisMaxLag` | 0,9 u/s / 70 u | suivi de l'axe de fuite et retard maximal |
| cristal | `pushDistance` | 42 u | recul imposé à la brume |
| feu | `cost` | 2 bois + 1 pierre | recette, fixe |
| | `duration` / `radius` | 18 s / 7 u | durée et rayon d'abri |
| | `fogSlowFactor` | 0,16 | vitesse de la brume à l'abri — jamais 0 |
| | `staminaBonus` | 48 | souffle rendu |
| jeter | `scatter` / `rearmDelay` | 1,6 u / 1,4 s | éparpillement et délai avant reprise |
| brume | `color` / `edgeColor` | `0x241a2e` / `0x9d7fb4` | corps et crête |
| | `sink` | 11 u | enfoncement sous le terrain |
| | `driftSpeed` / `driftReturn` | 1,4 / 0,05 | dérive des nappes et rappel — équilibre ~21 u |
| | `breathe` | 0,9 u | souffle vertical |

---

## 10. Déploiement

La 0.4 part en **préversion Vercel uniquement** :

```
https://horizon-proto-git-fog-nomad-vertical-slice-04-nutricyclev01a.vercel.app/
```

État `READY`, commit `c059c1b`.

**Ce qui a été vérifié sur le déploiement**, et comment : la page servie et le
module `fognomad-ui.mjs` ont été récupérés depuis la préversion et comparés aux
fichiers du dépôt — identiques. Le projet est un site statique sans étape de
build : ce qui est servi est le commit.

**Ce qui n'a pas pu l'être** : la politique réseau de l'environnement de
développement refuse les connexions sortantes vers ces hôtes depuis un
navigateur. Les 166 vérifications ont donc été exécutées contre un serveur
local servant le même commit, **pas contre l'URL déployée**. C'est une limite
de l'environnement, pas un résultat.

**La production n'est pas touchée.** Un point à corriger dans la lecture
initiale : `horizon-proto-ten.vercel.app` ne sert pas la 0.3 mais toujours
**Horizon 0.2** — la 0.3 n'a jamais été promue en production, elle n'a existé
qu'en préversion. La production restera sur la 0.2 tant que la 0.4 n'aura pas
été validée sur le téléphone réel ; c'est alors la 0.4, et non la 0.3, qui la
remplacera.

Le mode `?fogtest` doit être utilisé lors de ce test : c'est le seul endroit où
les FPS mesurés auront un sens.
