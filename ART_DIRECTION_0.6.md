# FOG NOMAD — DIRECTION ARTISTIQUE 0.6

Ce document existe pour une raison précise : **un personnage réaliste, un arbre
cartoon et une maison voxel dans la même image donnent un mauvais résultat**,
même si chaque élément est bon pris seul. Tout asset qui entre dans le projet
doit passer par les règles ci-dessous, ou ne pas entrer.

---

## 1. La décision de fond : un seul auteur

La 0.6 adopte **KayKit (Kay Lousberg)** comme direction unique.

Ce n'est pas un jugement esthétique isolé, c'est un choix de cohérence. Un seul
auteur signifie : mêmes proportions, même densité de facettes, même traitement
des arêtes, même logique de couleur, et surtout **un même atlas de gradient**
pour des familles entières d'objets.

Tout ce qui n'est pas KayKit doit être justifié explicitement dans
`ASSET_LICENSES.md` et jugé sur sa capacité à passer pour du KayKit à trois
mètres de distance.

> **Ce qui reste ouvert.** Aucun pack d'animaux KayKit n'existe. C'est le seul
> trou de la direction, et il est documenté dans `ASSETS_TO_IMPORT.md` plutôt
> que bouché avec un pack d'un autre style.

---

## 2. Proportions

| | Valeur | Pourquoi |
| --- | --- | --- |
| Personnage debout | 2,2 à 2,5 unités | mesuré sur les modèles, et **déjà la taille du personnage procédural 0.5** (tête à 1,99 + capuche) — le monde n'a donc pas à être remis à l'échelle |
| Tête | ~1/4 de la hauteur | proportion héroïque assumée, pas réaliste : c'est elle qui rend la silhouette lisible sur un écran de téléphone |
| Chunk | 32 unités | inchangé depuis la 0.2 |
| Arbre adulte | 4 à 7 unités | environ deux à trois fois le personnage |

**Règle de contrôle :** tout modèle importé passe par `?arttest`, qui affiche sa
hauteur mesurée. Un écart de plus de 25 % avec la fourchette ci-dessus est un
défaut à corriger à l'import, pas à l'usage.

Ce contrôle a déjà servi : `nomade_long` mesure **3,00 unités** contre 2,25 à
2,47 pour les trois autres. L'écart est réel et sera repris à l'intégration.

---

## 3. Formes

- **Low-poly facetté, arêtes franches.** Pas de lissage, pas de normales
  moyennées sur des angles vifs. Le moteur applique déjà ce parti (`faceted()`).
- **Volumes simples, silhouettes fortes.** Un objet doit se reconnaître à sa
  seule ombre portée.
- **Pas de petits détails géométriques.** À la distance de jeu ils deviennent du
  bruit, et sur un écran de téléphone du scintillement.
- **Asymétrie légère bienvenue** sur les ruines et le bois mort : c'est ce qui
  distingue une ruine d'un parallélépipède gris.

**Interdit désormais comme élément principal :** cube, cylindre, cône et sphère
Three.js bruts. Ces primitives restent légitimes pour les petites décorations,
les effets, et les replis quand un asset manque.

---

## 4. Palette

Le monde est **beau et mourant**. La palette doit tenir les deux à la fois.

| Rôle | Teinte | Usage |
| --- | --- | --- |
| Zone sûre | verts désaturés, ocres chauds | devant le joueur |
| Contamination | prune sombre, gris-violet | à l'approche du front |
| Brume | `#241a2e` corps, `#9d7fb4` crête | inchangé depuis la 0.5 |
| Accent joueur | rouge brique `#c4553f` | **l'écharpe, et rien d'autre** |
| Cristal | cyan `#63e8d6` auto-éclairé | seule source froide vive du monde |

**La règle de l'accent unique.** Le rouge de l'écharpe est la seule tache vive
chaude du jeu. Chaque fois qu'on l'accorde à autre chose, on perd la capacité de
retrouver le joueur d'un coup d'œil sur un fond de prairie ou de brume. Les
nomades la portent aussi — c'est délibéré, c'est le seul élément de récit du
jeu, et il ne s'énonce jamais.

---

## 5. Matériaux

- `MeshStandardMaterial` pour tout ce qui vient d'un pack : `roughness` ~0,85,
  `metalness` 0. Aucun métal réel dans ce monde.
- **Un atlas de gradient par famille**, jamais une texture par objet. Les 63
  modèles de structures partagent une seule image de 1024×1024 — c'est ce qui
  rend l'ensemble léger et cohérent.
- Filtrage : `NearestFilter` en magnification. Un atlas de gradient filtré en
  linéaire mélange des teintes voisines et bave sur les bords.
- **Pas de texture 4K. Pas de normal map. Pas de PBR complet.** La cible est un
  Samsung milieu de gamme.
- La géométrie fusionnée à couleurs de sommets reste le chemin par défaut pour
  la végétation dense et le décor répété.

---

## 6. La contrainte qui prime sur l'esthétique : B0

Ce dépôt documente un artefact d'affichage — grands polygones noirs à arêtes
franches — qui apparaît sur le GPU de test (**Samsung Xclipse 530**) avec
`InstancedMesh`, et **dont le mécanisme n'a jamais été expliqué**. Il a récidivé
en 0.5 sur le bois mort. Voir `AUDIT_PERFORMANCE_BUGS_0.2.md`, B0 et B0 bis.

Conséquences pour la 0.6, non négociables :

1. **L'instanciation reste limitée aux trois familles validées sur appareil en
   0.4** — troncs, houppiers, rochers. Une non-régression le vérifie.
2. **Le `SkinnedMesh` est un chemin GPU entièrement nouveau pour ce projet.**
   Rien ne dit qu'il se comporte mieux que l'instanciation sur ce GPU. Il doit
   être éprouvé sur l'appareil, via `?arttest`, **avant** que le reste de la 0.6
   ne repose dessus.
3. Aucun asset ne devient « validé » sur la foi du rendu logiciel de la machine
   de développement. La validation graphique appartient à l'appareil.

---

## 7. Éclairage et contraste

- Une lumière directionnelle chaude, une hémisphérique froide. Le contraste
  entre les deux fait la profondeur.
- **Les personnages doivent se détacher du décor.** C'est le rôle du contraste
  de valeur, pas de la saturation : un nomade sombre sur un sol clair reste
  lisible même en niveaux de gris.
- Brouillard atmosphérique conservé : il porte la profondeur et masque la
  limite du monde chargé.

---

## 8. Densité de détail

Le détail se dépense là où le joueur regarde :

| Élément | Budget indicatif |
| --- | --- |
| Personnage animé | 4 000 à 6 000 triangles (mesuré : 4 005 à 5 203) |
| Arbre | 200 à 800 |
| Structure | 300 à 1 500 |
| Repère lointain | jusqu'à 3 000 — il est vu de loin et rarement |
| Petite décoration | < 150 |

Ces nombres ne sont pas des plafonds durs. Le budget réel est **la fluidité
mesurée sur l'appareil**, pas un compte de triangles.

---

## 9. Ce qu'un nouvel asset doit vérifier avant d'entrer

1. Licence vérifiée **à la source**, chez l'auteur — jamais chez un miroir.
2. Style compatible avec le paragraphe 3, jugé côte à côte dans `?arttest`.
3. Hauteur dans la fourchette du paragraphe 2.
4. Aucune transparence non voulue (`?arttest` les liste par nom).
5. Aucune arme, aucun ennemi — le jeu n'a ni combat ni adversaire vivant.
6. Ligne ajoutée dans `ASSET_LICENSES.md`.
