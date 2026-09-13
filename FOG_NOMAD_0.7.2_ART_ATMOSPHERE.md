# FOG NOMAD 0.7.2 — PASSE D'ART ET D'ATMOSPHÈRE

**Aucun ajout de jeu.** Pas une mécanique, pas une ressource, pas un mode, pas
une étape de prologue. La 0.7.2 ne fait qu'une chose : faire en sorte qu'une
capture d'écran montre un jeu, et non un prototype technique.

Base : `3a7a0a4`. Branche : `fog-nomad-art-atmosphere-0.7.2`. **Preview
uniquement.**

---

## 1. LE DIAGNOSTIC, AVANT TOUT AUTRE CHOSE

Trois passes d'art avaient déjà été livrées et jugées invisibles. Avant d'en
écrire une quatrième, il fallait comprendre pourquoi — et la réponse n'était
pas « le code était faux ».

### 1.1 L'instrument, construit AVANT le premier changement

`tests/captures.mjs` : six plans fixes, graine imposée, une page neuve par
plan. On capture avant, on recapture après, on compare.

| Plan | Ce qu'il doit montrer |
| --- | --- |
| `1-reveil` | la toute première image du jeu : tour, débris, sac |
| `2-brume-revelee` | le mur, vu de face, à la distance de révélation |
| `3-foret` | le monde procédural en plein jour |
| `3b-foret-brume-proche` | le même, la Brume à trente unités |
| `4-camp` | le camp du convoi |
| `5-pilier` | la structure ancienne |

> **Règle : un changement qui ne se voit sur aucune des six n'a pas eu lieu.**

### 1.2 Ce que la caméra voit réellement

| | |
| --- | --- |
| Champ horizontal, en portrait | **≈ 14°** |
| Largeur de mur de brume visible à 30 u | ≈ 15 unités |
| Profondeur de terrain visible | ≈ 40 unités |
| Élévation utile du ciel | **2° à 14°** |

Tous les effets ratés des versions précédentes avaient une période **au-delà**
de ce que ce cadre résout : crête de brume à 40 u, bandes de ciel entre 20° et
60°, relief de terrain à 30 u. Le code était juste ; il peignait hors champ.

**Règle qui en découle : toute période visuelle entre 5 et 15 unités.**

### 1.3 Le banc lui-même mesurait faux

Découvert en cours de route, et c'est le défaut le plus embarrassant de la
version : SwiftShader rend à une dizaine d'images par seconde. L'adaptation
automatique de qualité, qui ne sait pas qu'elle tourne en logiciel, descend les
paliers — jusqu'à `facteurDecor()` à **zéro**, c'est-à-dire aucune herbe et
aucune fleur **construites**. Le banc photographiait un monde dégradé.

Corrigé par `?qualite=haute|moyenne|basse`, qui fige le niveau et coupe
l'adaptation (c'est aussi le §59), imposé par le banc, et affiché dans
`HORIZON.info.qualite`. Un chiffre invisible reste un chiffre faux.

---

## 2. CE QUI A CHANGÉ

### 2.1 Le monde s'arrêtait à vingt-six mètres — §33, §34

`CHUNK_RADIUS` 2 → 3 : portée 64 → **96 unités**. C'est le changement qui a
débloqué tout le reste. La tour, la forêt et l'horizon n'existaient pas dans le
cadre ; aucun travail de couleur ne compense un monde qui s'arrête.

### 2.2 Le terrain — §16, §17

Deux champs courts (11 et 7 u) sur le relief, des plaques de teinte (9 et 5 u)
sur la couleur de sommet, les creux qui virent à la terre — plafonnés à un
quart, parce que la première version lisait aussi la pente et faisait virer
tout le terrain à l'olive.

Un tertre fixe de 4,6 u autour de (1,5 ; 1,5) : **la tour du réveil avait été
bâtie dans un lac**, et seule une capture l'a montré.

### 2.3 La lumière — §21, §22

Soleil descendu de **60° à 33°** d'élévation, réchauffé et renforcé (2.35 →
2.72) ; ambiante hémisphérique divisée par 1,7 (2.15 → 1.28). À 60° le soleil
tombait presque à la verticale et **aplatissait tout le relief**.

### 2.4 Le ciel — §23, §24

Dégradé comprimé par `pow(y, 0.34)`, lueur d'horizon rasante, bandes nuageuses
confinées entre 2° et 14°, dôme porté à 40 × 28. Les trois versions
précédentes peignaient entre 20° et 60° — jamais regardé.

### 2.5 La Brume — §9 à §13

Crête à quatre échelles, la quatrième **redressée** (`pow(sin, 1.6)`) pour
donner des pointes et non des vagues, période utile ≈ 13 u. Contact au sol
dentelé. Respiration **en profondeur, par nappe** — `pulse`, `decalage` et
`amplitudeZ` distincts — au lieu d'un balancement d'ensemble.

### 2.6 La tour-balise — §30

Réécrite entièrement : socle octogonal, quatre montants convergents dont un
rompu à 46 %, deux ceintures de contreventement, échelle à neuf barreaux,
plateforme inclinée, garde-corps à six poteaux, lanterne de pierre ouverte,
cristal suspendu, section tombée au sol, hauban rompu qui oscille encore, cinq
blocs de gravats. Treize unités de haut, lisible de loin.

### 2.7 Le camp du convoi — §32

**D'abord le sol.** En portrait, les deux tiers bas de l'écran sont de la
terre : une zone piétinée de vingt mètres remplit la moitié du cadre, un objet
posé dessus quelques dizaines de pixels.

Une nappe de terre battue construite sur la grille du terrain, deux ornières
qui en naissent et s'y éteignent, des pas. Puis le camp : feu froid avec cercle
de pierres, trépied et marmite, trois caisses déchargées vite, une roue cassée
qui sous-entend la charrette qu'on ne voit pas, du bois empilé, une natte
déroulée, du linge qui sèche, une bannière qu'on voit à quarante mètres. Un
maillage par matériau : **six appels de dessin**.

### 2.8 La stèle ancienne — §31

La première version était un poteau noir de six mètres, coupé par le haut du
cadre, dans la même pierre grise que tout le reste.

| | Tour-balise (nomade) | Stèle (pré-nomade) |
| --- | --- | --- |
| Matière | bois, pierre grise | pierre **pâle, presque de l'os** |
| Construction | droite, horizontale, on voit l'assemblage | tout **penche vers le centre**, rien ne repose sur rien |
| Cristal | **suspendu** dans une lanterne | **flotte dans une ouverture**, sans support |
| Lumière | cyan | violet |
| Rythme | **bat** (2 Hz) | **respire** (0,42 Hz) |

Deux lumières au même rythme sont le même objet : c'est pour cela que la stèle
respire cinq fois plus lentement que la balise ne bat. Et la dalle claire
fendue au sol est ce qui la rend repérable de loin.

### 2.9 Le couvert bas — §35

Il existait depuis la 0.5 : des touffes de **44 centimètres**, **huit par chunk
de 32 mètres**. Une pour cent-trente mètres carrés, de trois pixels chacune.

Une passe dédiée les sème par plaques tous les 2,6 u, à hauteur de cheville,
teintées plus clair que les houppiers. Cela ne tient au budget que parce que
**l'herbe n'est affichée que sur les neuf chunks voisins du joueur** : au-delà
de quarante mètres une touffe fait moins d'un pixel.

### 2.10 L'ambiance sonore — §42 à §44

Trois couches continues, toutes synthétisées, aucun fichier : le **vent** (deux
périodes décalées, pour qu'aucune bourrasque ne revienne à intervalle
régulier), les **insectes**, les **oiseaux**.

**Les oiseaux se taisent quand la Brume approche**, et ce silence tombe avant
que le grondement ne devienne fort. C'est un avertissement, pas une décoration.
Une quatrième couche, ponctuelle : un bourdonnement par cristal en vue,
spatialisé par l'angle de l'objet au regard du joueur.

---

## 3. LES DÉFAUTS TROUVÉS PAR LA CAPTURE, ET PAR ELLE SEULE

Aucun de ceux-ci n'aurait été trouvé en relisant le code. Tous étaient du code
correct qui ne produisait pas ce qu'on croyait.

| Défaut | Ce qu'on voyait | Cause |
| --- | --- | --- |
| La tour dans un lac | la balise à moitié immergée | scène posée à coordonnée fixe sur un relief décidé par la graine |
| La nappe de terre battue absente | rien du tout | **enroulement des triangles inversé** : normale vers le bas, éliminée par le culling |
| Ornières en tronçons | des planches sombres discontinues | échantillonnées sur la *courbe* du terrain, pas sur son *maillage* |
| Falaises brunes au camp | des pans de terre dressés | camp posé en travers d'un talus |
| Frange turquoise autour de la dalle | un liseré bleu-vert | `Color.lerp` **extrapole** quand `t` est négatif |
| Un pin de sept mètres au milieu du camp | la moitié du cadre bouchée | rayon de dégagement trop court |
| Herbe invisible | un pré nu | touffes de 44 cm, huit par chunk — **et** banc en qualité basse |
| Tuple mal déstructuré | `NaN` dans une géométrie | `[[0,[x,y]], …].entries()` : l'index était déjà là |

---

## 4. CE QUI N'A PAS ÉTÉ FAIT, ET POURQUOI

### 4.1 Les animaux — §37 à §41

**ANIMAL VISUALS : PROVISIONAL.** La recherche d'un pack sous licence
vérifiable a été refaite en 0.7.2 et échoue toujours. Mesuré, pas supposé :

| Source | Résultat |
| --- | --- |
| `kenney.nl`, `quaternius.com`, `poly.pizza`, `opengameart.org` | aucune réponse — politique réseau |
| `github.com/KayKit-Game-Assets` | **403** |
| `api.github.com` (lister les dépôts d'un auteur) | *« sessions are bound to their configured repositories »* |

Il n'existe, dans cet environnement, aucun chemin pour lire une licence chez
son auteur. La règle du projet interdit d'utiliser un asset autrement. Les
animaux restent les silhouettes procédurales de `living.mjs`.

### 4.2 L'instanciation

Rien n'a été instancié. Le jeu de familles instanciées validé sur appareil est
celui de la 0.4 — troncs, houppiers, rochers. Tout ce que la 0.7.2 ajoute passe
par le chemin fusionné, qui coûte le même nombre d'appels de rendu et qui, lui,
n'a jamais produit les grands polygones noirs du Xclipse 530.

### 4.3 Les FPS

**Aucun chiffre de FPS de ce document ne transpose sur l'appareil.** Toutes les
mesures viennent de SwiftShader, un rendu logiciel. Les seules mesures qui
comptent — appels de dessin, triangles, géométries — sont indépendantes du
rendu et sont rapportées telles quelles. La validation d'images par seconde
reste celle du Galaxy A55, et elle appartient à l'utilisateur.
