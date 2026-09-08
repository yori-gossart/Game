# FOG NOMAD 0.6a — CORRECTIF JOUEUR ET AUDIT HONNÊTE DE L'ART PASS

Cette version part d'un test sur appareil réel qui a conclu : **la 0.6 n'est pas
validée**. Trois reproches, tous exacts.

---

## 1. Le sac accroché au visage

### Cause

Le sac est construit dans `fognomad.mjs` aux coordonnées du **mannequin
procédural** : `y ≈ 1,36`, `z ≈ −0,4`. Sur ce mannequin, la tête est une petite
sphère à `y ≈ 1,99` et le buste à `y ≈ 1,30`. À 1,36 on est donc sur le haut du
dos, et le sac y a été juste pendant deux versions.

Le personnage KayKit a des **proportions héroïques** et une tête énorme.
Mesuré sur le modèle :

| | y |
| --- | --- |
| Maillage de tête | 1,07 → 2,20 |
| Maillage de torse | 0,35 → 1,31 |
| Os `chest` | 0,944 |

À 1,36, on n'est plus dans le dos : **on est en plein visage.**

Le correctif de la 0.6 avait pour but explicite de *préserver les coordonnées
d'origine du sac*. Il a parfaitement réussi — il a préservé fidèlement une
position devenue fausse. C'est le défaut le plus instructif de cette série :
un correctif peut être correct dans son intention et faux dans son résultat.

### Correction

L'ancrage ne décale plus rien à la main. Il **mesure le torse du modèle** et
pose le sac par rapport à lui :

- seul le maillage nommé `body`/`torso`/`chest` compte — mesurer tous les
  maillages skinnés donnait 1,94 de large, c'est-à-dire l'envergure des bras
  écartés en pose de repos, et le sac s'en trouvait deux fois trop grand ;
- hauteur d'ancrage : l'os `chest` moins 8 % de la hauteur du torse (un sac se
  porte au milieu du dos, pas sur les épaules) ;
- profondeur : juste derrière la surface arrière du torse ;
- échelle : la moitié de la largeur du buste **à vide**, sachant que
  `updateBagVisual()` fait encore grossir le sac de 32 % en largeur et 44 % en
  hauteur au dernier palier.

Mesuré après correction : torse `0,87 × 0,87 × 0,70`, ancre `y 0,90 · z −0,48`,
échelle `0,84`. Le sac vit entre `y 0,88` et `y 0,97` selon la charge, sous un
bas de tête à `1,216`.

Un autre personnage, d'autres proportions, et l'ancrage suit tout seul.

### Un défaut annexe trouvé au passage

Les **sept caisses de charge** étaient restées enfants de `player` pendant que
le sac passait sous l'os. Elles sont positionnées par `updateBagVisual()` dans
le même repère que le sac : elles divergeaient donc dès que le torse bougeait.
Elles partagent désormais le même parent.

---

## 2. Le personnage qui marche à reculons

### Cause

Le moteur oriente déjà le groupe `player` avec
`rotation.y = atan2(moveX, moveZ)`, ce qui met son `+Z` local dans la direction
de marche. Et l'avant natif des modèles KayKit **est déjà leur `+Z`**.

La 0.6 appliquait un demi-tour au modèle, « pour qu'il regarde la caméra ».
Cette valeur avait été réglée **sur le banc d'essai**, où le modèle n'a pas de
parent tourné. En jeu, ce demi-tour s'ajoutait aux 180° du groupe joueur : le
total revenait à zéro, et le personnage avançait face à la caméra.

### Correction

Aucune rotation. Et la valeur n'est pas établie par raisonnement — elle l'est
par **capture d'écran**, dans le jeu et sur le banc :

| Rotation du modèle | Ce qu'on voit, caméra en +Z |
| --- | --- |
| 0 | le personnage fait face à la caméra (banc) / montre son dos et avance (jeu) |
| π | il tourne le dos (banc) / marche à reculons (jeu) |

C'est la troisième fois dans ce projet qu'un raisonnement d'orientation se
trompe et qu'une image tranche. La constante vit désormais dans
`assetmanager.mjs`, avec la connaissance du modèle, parce que la 0.6 avait
livré un banc et un jeu qui l'avaient réglée **différemment** — le banc juste à
l'œil, le jeu à reculons. Une seule source, une seule chance de se tromper.

---

## 3. Un troisième défaut, trouvé en regardant l'image

Une **plaque verte plate** flottait à côté du personnage. C'est la cape : dans
ces packs, elle est un **plan rigide non skinné** accroché à un os. Elle ne se
déforme pas avec l'animation et reste une surface plate qui traverse le corps.

Retirée au chargement, avec les armes. Une non-régression interdit désormais
tout maillage rigide accroché à un os.

---

## 4. Pourquoi mes tests ne voyaient rien

C'est le point le plus important de ce document.

| Ce que le test affirmait | C'était vrai | Et pourtant |
| --- | --- | --- |
| « sac derrière, z négatif » | oui, z = −0,40 | le sac était sur le visage |
| « état marche » | oui | le personnage reculait |
| « pieds au sol, y min ≈ 0 » | oui | — |

Aucune de ces assertions ne **regardait le personnage**. Elles vérifiaient des
nombres cohérents entre eux dans un repère, sans jamais demander à quoi cela
ressemblait.

Trois assertions ajoutées, qui mesurent ce qui manquait :

1. **orientation** — le produit scalaire entre le « devant » du moteur et le
   regard du modèle vaut `+1` s'ils sont d'accord, `−1` à reculons ;
2. **anatomie** — le sac doit être **sous le bas de la tête**, mesuré sur le
   maillage, et non au-dessus d'un nombre écrit à la main. La borne `y > 0,9`
   de la 0.6 était héritée du mannequin et laissait passer un sac plaqué sur le
   visage ;
3. **rigidité** — aucun maillage non skinné accroché à un os.

Et un banc dédié, `?playertest`, qui monte le joueur **par le même module que
le jeu** — un banc qui l'assemblerait autrement ne prouverait rien du jeu. Il
affiche une flèche au sol dans la direction que le moteur considère comme
« devant », et une vue de profil stricte où un sac mal ancré saute aux yeux.

---

## 5. Audit honnête : qu'est-ce qui avait réellement changé en 0.6 ?

Le troisième reproche était : **« il n'y a que le personnage qui a changé »**.

Vérification factuelle, pas d'impression : le catalogue d'assets ne contenait
que les **quatre personnages**. Les 42 modèles de nature et les 63 de
structures étaient dans le dépôt et **référencés par rien**. `living.mjs` et
`worlddirector.mjs` ne touchaient pas au gestionnaire d'assets. Le monde
rendait intégralement la géométrie procédurale de la 0.5.

### État au moment du test utilisateur

| Catégorie | Verdict |
| --- | --- |
| Joueur | **changement fort** |
| Arbres | **quasi nul** |
| Végétation basse | **quasi nul** |
| Cabanes | **quasi nul** |
| Ruines | **quasi nul** |
| Landmarks | **quasi nul** |
| Animaux | **quasi nul** |
| Ambiance générale | **quasi nul** |

La perception rapportée était exacte. La 0.6 avait produit une bibliothèque
d'assets, une direction artistique et un gestionnaire de chargement — de
l'infrastructure, pas un art pass.

---

## 6. Ce que la 0.6a change réellement dans le monde

`decors.mjs` branche enfin les modèles au monde, sous trois contraintes.

1. **Le budget d'appels de rendu ne bouge pas.** Les arbres d'un chunk sont
   fusionnés en une géométrie **par atlas** : un appel par atlas et par chunk,
   exactement ce que coûtait la version instanciée qu'ils remplacent.
2. **Aucune instanciation.** Règle B0 — sur le GPU de test, l'`InstancedMesh`
   produit de grands polygones noirs, mécanisme jamais expliqué, récidive
   constatée en 0.5. La fusion coûte le même prix et n'a jamais échoué.
3. **La contamination s'applique.** Le décor importé se décolore devant la
   brume comme le reste du monde ; un décor resté vert vif aurait cassé la
   signature visuelle construite en 0.5.

### Arbres — cinq familles, dix modèles

| Famille | Modèles | Hauteur visée |
| --- | --- | --- |
| Conifère haut | `tree_pine_yellow_large`, `tree_pine_orange_large` | 7,2 · 6,4 |
| Conifère dense | `tree_pine_orange_medium`, `tree_pine_yellow_small` | 5,4 · 3,8 |
| Feuillu | `trees_B_medium`, `trees_A_medium` | 4,6 · 4,2 |
| Isolé | `tree_single_A` | 3,6 |
| Bois mort | `tree_dead_large/medium/small` | 5,0 · 4,0 · 2,8 |

Une découverte de mesure a rendu ce mélange possible : **les arbres du pack
Hexagon sont des décorations de tuile** hautes de 1,1 à 1,3 unité, alors que
ceux de Halloween sont à l'échelle du monde, de 2,7 à 5,4. Chaque modèle est
donc normalisé à une hauteur visée avant d'entrer en scène.

**Le placement ne change pas.** Les positions, rotations et échelles restent
exactement celles que la 0.5 produisait : seule la silhouette posée à chaque
emplacement change. Une graine donnée reste le même monde.

### Rochers

`rock_single_A` et `rock_single_C`, formes réelles au lieu de dodécaèdres.

### Coût mesuré, rendu logiciel, plusieurs graines

| | Appels | Triangles |
| --- | --- | --- |
| 0.6 (procédural) | 56 à 81 | 16 000 à 20 000 |
| 0.6a (modèles réels) | **34 à 60** | 19 000 à 44 000 |

Les appels de rendu **baissent** — la fusion par atlas remplace plusieurs
familles instanciées. Les triangles montent, dans la fourchette de 50 à 100 k
que le brief autorise explicitement.

---

## 7. Ce qui reste insuffisant, et n'est pas marqué PASS

| Catégorie | Verdict 0.6a | Pourquoi |
| --- | --- | --- |
| Arbres | **changement fort** | 10 modèles, 5 silhouettes distinctes, échelles normalisées |
| Rochers | changement moyen | 2 modèles réels |
| Ambiance générale | changement moyen | la palette d'automne et le bois mort donnent une identité, mais le terrain, le ciel et la brume sont inchangés |
| **Cabanes** | **quasi nul** | toujours procédurales — aucun modèle de maison dans les packs retenus |
| **Ruines, camps, landmarks** | **quasi nul** | les modèles sont chargés (`pillar`, `arch`, `arch_gate`, `crypt`, `shrine`, `bench`, `post_lantern`) mais **pas encore posés par le directeur de monde** |
| **Animaux** | **quasi nul** | aucun pack CC0 d'animaux atteignable — voir `ASSETS_TO_IMPORT.md` |
| Terrain, éclairage, ombres, brume | **quasi nul** | non traités |

Les structures sont le prochain gain évident : les modèles sont déjà chargés,
normalisés et contaminables ; il ne manque que le branchement dans
`addStructure()`.

---

## 8. Les animaux, et pourquoi ils restent un trou

`kenney.nl`, `quaternius.com`, `poly.pizza`, `opengameart.org` et `itch.io`
sont refusés par la politique réseau de l'environnement de développement —
mesuré, pas supposé. KayKit, seul auteur atteignable, ne publie aucun pack
d'animaux.

La règle du projet interdit d'utiliser un asset dont la licence n'a pas été
vérifiée chez son auteur, et le brief interdit de fabriquer un faux équivalent
procédural en prétendant que c'est pareil. Les animaux restent donc ceux de la
0.5, et ce point est rapporté **FAIL**, pas contourné.
