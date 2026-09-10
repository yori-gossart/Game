# FOG NOMAD — LICENCES DES ASSETS EXTERNES

Règle du projet : **un asset dont la licence n'a pas été vérifiée n'entre pas**.
Vérifiée signifie lue chez l'auteur, pas déduite d'un miroir ou d'un article de
blog. Chaque pack ci-dessous a été récupéré depuis le dépôt GitHub **de son
auteur**, et le fichier de licence livré avec le pack est conservé à côté des
fichiers dans ce dépôt.

Aucun asset de ce dépôt ne provient d'une source dont la licence n'a pas pu être
lue directement.

---

## 1. Modèles 3D — KayKit, par Kay Lousberg

Trois packs, **un seul auteur**, ce qui est aussi la décision de cohérence de
`ART_DIRECTION_0.6.md`.

| | |
| --- | --- |
| Auteur | Kay Lousberg — www.kaylousberg.com |
| Licence | **CC0 1.0 Universal** (domaine public) |
| Texte de licence | http://creativecommons.org/publicdomain/zero/1.0/ |
| Usage commercial | **autorisé explicitement** par le fichier de licence du pack |
| Attribution | non obligatoire — faite ici quand même |

### 1.1 KayKit — Adventurers Character Pack 1.0

| | |
| --- | --- |
| Source | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
| Page de l'auteur | https://kaylousberg.itch.io/kaykit-adventurers |
| Licence livrée | `assets/characters/KayKit-LICENSE.txt` |
| Date du pack | 13/03/2023 |

| Fichier dans ce dépôt | Fichier d'origine | Modifications |
| --- | --- | --- |
| `assets/characters/nomade_capuche.glb` | `Characters/gltf/Rogue_Hooded.glb` | aucune sur le fichier ; armes retirées **au chargement** par `assetmanager.mjs` |
| `assets/characters/nomade_robuste.glb` | `Characters/gltf/Barbarian.glb` | idem |
| `assets/characters/nomade_long.glb` | `Characters/gltf/Mage.glb` | idem |
| `assets/characters/nomade_charge.glb` | `Characters/gltf/Knight.glb` | idem |

Les fichiers sont **binairement identiques à l'original**, seulement renommés.
Le retrait des armes se fait à l'exécution : Fog Nomad n'a ni ennemi ni combat,
et une arbalète dans le dos d'un nomade contredirait la seule chose que le jeu
raconte. Le faire au chargement plutôt que dans le fichier garde la provenance
vérifiable octet par octet.

### 1.2 KayKit — Halloween Bits 1.0

| | |
| --- | --- |
| Source | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 |
| Page de l'auteur | https://kaylousberg.itch.io/halloween-bits |
| Licence livrée | `assets/structures/KayKit-Halloween-LICENSE.txt` |
| Fichiers | `assets/structures/` — 63 modèles `.gltf` + `.bin`, un atlas partagé `halloweenbits_texture.png` |
| Modifications | **aucune** — dossier `Assets/gltf/` copié tel quel |

Retenu pour les arbres morts, les arches, le sanctuaire, la crypte et les
clôtures brisées : c'est un jeu d'assets de **monde qui meurt**, ce qui est
exactement le sujet de Fog Nomad. Le nom « Halloween » du pack ne se lit nulle
part dans les modèles retenus.

### 1.3 KayKit — Medieval Hexagon Pack 1.0

| | |
| --- | --- |
| Source | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 |
| Page de l'auteur | https://kaylousberg.itch.io/kaykit-medieval-hexagon |
| Licence livrée | `assets/nature/KayKit-Hexagon-LICENSE.txt` |
| Fichiers | `assets/nature/` — 42 modèles `.gltf` + `.bin`, atlas partagé `hexagons_medieval.png` |
| Modifications | **aucune** — sous-dossier `decoration/nature/` copié tel quel |

Seule la végétation et le relief décoratif sont repris (arbres, rochers,
collines). Les tuiles hexagonales et les bâtiments du pack ne sont pas utilisés.

---

## 2. Code tiers — three.js

| | |
| --- | --- |
| Auteur | three.js authors |
| Licence | **MIT** — `vendor/three/LICENSE` |
| Version | r185 (0.185.1), identique au moteur déjà vendorisé |

| Fichier | Origine | Modifications |
| --- | --- | --- |
| `vendor/three/jsm/loaders/GLTFLoader.js` | `mrdoob/three.js@r185:examples/jsm/loaders/GLTFLoader.js` | **aucune** |
| `vendor/three/jsm/utils/SkeletonUtils.js` | `mrdoob/three.js@r185:examples/jsm/utils/SkeletonUtils.js` | **aucune** |
| `vendor/three/jsm/utils/BufferGeometryUtils.js` | `mrdoob/three.js@r185:examples/jsm/utils/BufferGeometryUtils.js` | **aucune** — dépendance de SkeletonUtils |

Ces trois fichiers importent `three` en spécificateur nu. Plutôt que de patcher
leurs imports — ce qui les rendrait non comparables à l'amont — `index.html`
déclare une **importmap**. L'arborescence `jsm/loaders/`, `jsm/utils/` reproduit
celle de l'amont, parce que ces fichiers s'importent entre eux en relatif.

---

## 3. Audio

Aucun fichier audio externe. Le son de Fog Nomad est **entièrement synthétisé**
dans `audio.mjs`, sans aucun fichier — décision de la 0.5, conservée.

---

## 4. Le prologue (0.7) n'ajoute aucun asset externe

Une version qui met en scène une tour-balise, un pilier ancien, des ornières de
convoi et deux cristaux lumineux est exactement le genre de version où un
modèle non vérifié se glisse « juste pour cette scène ». Il n'y en a aucun.

| Élément mis en scène | D'où il vient |
| --- | --- |
| Tour-balise | pièces **déjà présentes** du pack Halloween : `pillar`, `fence_broken`, `grave_A_destroyed`, assemblées par `prologue.mjs` |
| Plateforme et couronne de la tour | `CylinderGeometry` hexagonale, écrite dans `prologue.mjs` |
| Cristaux de signal | `OctahedronGeometry` mise à l'échelle, écrite dans `prologue.mjs` |
| Sac au sol | trois `BoxGeometry`, écrites dans `prologue.mjs` |
| Traces du convoi | `BoxGeometry` pour les ornières, `bench` et `post_lantern` déjà présents |
| Pilier ancien | `CylinderGeometry` à six pans et trois `TorusGeometry`, écrits dans `prologue.mjs` |
| Animaux et silhouettes qui fuient | géométries de `living.mjs`, déjà en place depuis la 0.5 |
| Sons du réveil, de la disparition, du souvenir | synthétisés dans `audio.mjs`, aucun fichier |

Aucun fichier n'a été ajouté à `assets/`. Le contrôle est simple à refaire :

```bash
git diff --stat <version précédente>..HEAD -- assets/
```

Il doit ne rien renvoyer.

---

## 5. Ce qui n'a pas pu être vérifié, et n'est donc pas utilisé

L'environnement de développement de cette session **n'atteint pas** kenney.nl,
quaternius.com, poly.pizza, opengameart.org ni itch.io : la politique réseau les
refuse. Les licences de ces sources n'ont donc pas pu être lues chez leur auteur.

Conformément à la règle du projet, **aucun asset de ces sources n'a été
utilisé**, y compris via un miroir qui les annonce comme CC0. Ce qui manque est
listé dans `ASSETS_TO_IMPORT.md`.
