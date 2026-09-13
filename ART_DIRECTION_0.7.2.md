# FOG NOMAD — DIRECTION ARTISTIQUE 0.7.2

Ce document complète `ART_DIRECTION_0.6.md`, il ne le remplace pas. La 0.6 a
fixé le **style** — bas-poly facetté, un seul auteur d'assets, couleurs par
sommet, aucune texture peinte. La 0.7.2 ne change pas ce style ; elle corrige
la raison pour laquelle il ne se voyait pas.

---

## 1. LE DÉFAUT DE FOND, ET IL S'EST RÉPÉTÉ CINQ FOIS

À cinq reprises dans ce projet, un travail visuel a été écrit correctement,
livré, et s'est révélé **invisible à l'écran** :

| Version | Ce qui a été écrit | Pourquoi on ne le voyait pas |
| --- | --- | --- |
| 0.6 | un art pass complet | *« il n'y a que le personnage qui a changé »* — retour appareil |
| 0.7 | une crête de brume | période de 40 u pour 15 u de mur visibles |
| 0.7.1 | des bandes de ciel | peintes entre 20° et 60° d'élévation, jamais regardées |
| 0.7.2 | le relief du terrain | périodes de 30 u, invisibles à 40 u de portée |
| 0.7.2 | le couvert bas | des touffes de 44 cm, huit par chunk de 32 m |

Le mécanisme est **toujours le même**, et il n'a rien à voir avec la qualité du
code : *une longueur d'onde calibrée pour une échelle que la caméra ne voit
jamais.*

### La caméra, en chiffres

C'est la seule mesure qui compte, et elle doit être vérifiée avant d'écrire une
ligne d'effet :

| | |
| --- | --- |
| Cadre | portrait, ~1080 × 2200 |
| Champ horizontal | **≈ 14°** |
| Largeur de mur de brume visible, à 30 u | **≈ 15 unités** |
| Profondeur de terrain visible devant le joueur | **≈ 40 unités** |
| Élévation utile du ciel | **2° à 14°** — au-delà, hors cadre |
| Facette du terrain | 2 unités |
| Hauteur du personnage | 1,7 unité |

**Règle qui en découle : tout motif visuel doit avoir une période comprise
entre 5 et 15 unités.** Plus court, il moire ; plus long, il se lit comme un
aplat uni. Aucune exception n'a été trouvée en 0.7.2.

---

## 2. CE QUI A CHANGÉ, ET POURQUOI

### 2.1 Le monde s'arrêtait à vingt-six mètres

`CHUNK_RADIUS` est passé de 2 à 3 : la portée de terrain passe de 64 à 96
unités. C'est le changement qui a **débloqué tout le reste** — la tour, la
forêt et l'horizon n'existaient tout simplement pas dans le cadre. Aucun
travail de couleur ne compense un monde qui s'arrête.

### 2.2 Le terrain

Deux champs courts — **11 et 7 unités** — ajoutés au relief (`mottes`), et des
plaques de teinte de **9 et 5 unités** (`plaque`) sur la couleur de sommet. Les
creux virent à la terre, plafonnés à un quart : la première version lisait
aussi la pente, et comme les mottes en créent partout, tout le terrain virait à
l'olive.

Un `tertre` fixe de 4,6 u autour de (1,5 ; 1,5) : **la tour du réveil avait été
bâtie dans un lac**, et personne ne l'avait vu avant de regarder une capture.

### 2.3 La lumière

| | avant | après |
| --- | --- | --- |
| Hémisphérique | `0xf7fbff / 0x645c42`, 2.15 | `0xdff0ff / 0x4f5c38`, **1.28** |
| Directionnelle | `0xffe5ad`, 2.35, position (−42, 60, 24) | `0xfff0d4`, **2.72**, position (−58, **33**, 26) |

Le soleil est descendu de 60 à 33 : à 60, il tombait presque à la verticale et
**aplatissait tout le relief**. Bas et chaud, il rase les mottes et les
sculpte. L'ambiante a baissé d'autant, sinon rien n'a d'ombre.

### 2.4 Le ciel

Dégradé **comprimé** par `pow(y, 0.34)`, lueur d'horizon rasante, bandes
nuageuses confinées entre 2° et 14°. Dôme porté à 40 × 28 pour que le dégradé
n'escalier pas. Trois versions précédentes peignaient entre 20° et 60°.

### 2.5 La Brume

Crête à **quatre** échelles, la quatrième **redressée** (`pow(sin, 1.6)`) pour
donner des pointes et non des vagues, période utile ≈ 13 u. Contact au sol
dentelé. Respiration **en profondeur par nappe** (`amplitudeZ`, `pulse`,
`decalage` distincts), pas un balancement d'ensemble.

### 2.6 Le sol mis en scène — la technique des NAPPES

Le camp et le pilier posent une géométrie plaquée au sol (`nappeAuSol`). Trois
règles, chacune apprise d'une capture ratée :

1. **Construire sur la grille du terrain** (2 u, alignée sur les coordonnées
   paires du monde). Une nappe échantillonnée sur la *courbe* `terrainHeight`
   passe alternativement au-dessus et au-dessous de la surface *rendue*, qui
   est un plan entre deux sommets : les ornières se découpaient en tronçons.
2. **Enroulement vu de dessus.** La première version tournait à l'envers : la
   normale pointait vers le bas, la nappe était éliminée par le culling, et
   elle ne se voyait **nulle part**. Le code était juste ; la nappe n'existait
   pas à l'écran.
3. **Jamais sur une paroi.** Une cellule dont les coins diffèrent de plus de
   1,5 u n'est pas posée, sinon la terre battue forme des falaises brunes.

Et une quatrième, générale : **`Color.lerp` extrapole quand `t` est négatif.**
Un coin de valeur négative retranchait un gris chaud à du vert et produisait du
turquoise tout autour de la dalle du pilier.

### 2.7 Le couvert bas

Touffes à **hauteur de cheville** (0,46–0,62 u de lame), semées par **plaques**
sur une grille jitterée de 2,6 u, teintées plus clair que les houppiers, et
**affichées seulement sur les neuf chunks voisins du joueur** : au-delà de
quarante mètres une touffe fait moins d'un pixel, et la payer serait payer pour
rien. C'est ce gate de proximité qui rend la densité abordable.

---

## 3. LES DEUX STRUCTURES DU PROLOGUE

Elles doivent être **lisibles l'une contre l'autre** : c'est là que naît la
contradiction que le §28 demande, et elle doit se voir sans une ligne de texte.

| | Tour-balise (nomade, moderne) | Stèle ancienne (pré-nomade) |
| --- | --- | --- |
| Matière | bois et pierre grise | pierre **pâle, presque de l'os** |
| Construction | montants droits, ceintures horizontales, échelle | tout **penche vers le centre** ; rien ne repose sur rien |
| Assemblage | on voit comment c'est monté | on ne voit **pas** comment c'est monté |
| Cristal | **suspendu** dans une lanterne ouverte | **flotte dans une ouverture**, sans support |
| Lumière | cyan `0x8ff0e2` | violet `0xb388ff` |
| Rythme | **bat** — 2 Hz, avec un second temps sec | **respire** — 0,42 Hz, une seule onde |
| Au sol | socle octogonal, gravats | **dalle claire fendue**, herbe reprise dans les fentes |

Deux lumières au même rythme sont le même objet. C'est pour ça que la stèle
respire cinq fois plus lentement que la balise ne bat.

**La dalle est ce qui rend la stèle visible de loin.** Une pierre claire au
milieu de l'herbe se repère à quarante mètres ; un monolithe sombre se lit
comme un poteau télégraphique — ce qu'était exactement la première version.

---

## 4. LE CAMP : D'ABORD LE SOL

Cinq objets posés sur une pelouse intacte ne racontent rien. En portrait, **les
deux tiers bas de l'écran sont de la terre** : un objet posé dessus occupe
quelques dizaines de pixels, une zone piétinée de vingt mètres remplit la
moitié du cadre.

Ordre de travail, et il est général :

1. le sol (terre battue, ornières, pas) ;
2. la silhouette visible de loin (ici la bannière du séchoir) ;
3. les objets qui se lisent en arrivant (feu froid, caisses, roue, natte) ;
4. les détails qu'on ne voit qu'en s'arrêtant (bol renversé, cordage).

Un maillage **par matériau**, fusionné : le camp entier tient en six appels de
dessin quelle que soit sa richesse.

### Chercher le sol plat

`coinPlat()` échantillonne quelques emplacements voisins et garde celui dont le
sol varie le moins. La tour avait été bâtie dans un lac ; le camp s'est posé en
travers d'un talus. C'est le même défaut, et il revient à chaque scène posée à
une coordonnée fixe sur un relief décidé par la graine.

---

## 5. LA PALETTE

| Rôle | Couleur | Où |
| --- | --- | --- |
| Herbe | `0x6d8a49` | terrain, base des nappes |
| Herbe claire (touffes) | `0x9cb356` | couvert bas |
| Terre battue | `0x60492f` | camp |
| Ornière | `0x4c3b26` | camp |
| Terre des creux | `0x6b5c3f` | terrain |
| Piste du convoi | `0x7d6a4c` | terrain |
| Lueur d'horizon | `0xffe9c4` | ciel |
| Pierre ancienne | `0xa9a2b4` | stèle |
| Dalle ancienne | `0x9c95a9` | nappe de la stèle |
| Cristal moderne | `0x8ff0e2` | balise |
| Cristal ancien | `0xb388ff` | stèle |
| Toile du convoi | `0xc4553f` / `0xc9b795` | camp |

**Les deux violets et les deux cyans ne se mélangent jamais.** Le froid vif est
réservé aux cristaux ; rien d'autre dans le monde n'en porte.

---

## 6. L'AMBIANCE SONORE

Trois couches continues, toutes synthétisées, aucun fichier :

- **le vent** — bruit filtré en passe-bande, deux périodes décalées (11 s et
  4,1 s) pour qu'aucune bourrasque ne revienne à intervalle régulier ;
- **les insectes** — une porteuse hachée par un LFO carré ; ils se taisent les
  premiers, au sol ;
- **les oiseaux** — deux ou trois notes rapides, jamais les mêmes.

**Règle : l'ambiance dit quelque chose.** Les oiseaux se taisent quand la Brume
approche, et ce silence tombe **avant** que le grondement ne devienne fort.
C'est un avertissement, pas une décoration.

Une quatrième couche, ponctuelle : un bourdonnement par cristal en vue,
spatialisé par l'angle de l'objet au regard du joueur.

---

## 7. LA RÈGLE DE TRAVAIL

`tests/captures.mjs` pose six plans fixes à graine imposée. On capture **avant**
de toucher à quoi que ce soit, on recapture après, et on compare.

> **Un changement qui ne se voit sur aucune des six n'a pas eu lieu.**
> On le retire.

Et depuis la 0.7.2, une précaution de plus : **le banc impose la qualité**
(`?qualite=haute`). SwiftShader rend à une dizaine d'images par seconde ;
l'adaptation automatique, qui ne sait pas qu'elle tourne en logiciel, descend
les paliers jusqu'à `facteurDecor()` à zéro — aucune herbe, aucune fleur
construites. Le banc a photographié un monde dégradé sans que personne s'en
aperçoive. **Un banc qui mesure autre chose que ce qu'on croit est pire que pas
de banc.**
