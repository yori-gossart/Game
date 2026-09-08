# FOG NOMAD — ASSETS À IMPORTER À LA MAIN

Ce fichier existe à cause d'une contrainte d'environnement, pas d'un choix de
conception.

## Pourquoi

La politique réseau de la session de développement refuse **kenney.nl**,
**quaternius.com**, **poly.pizza**, **opengameart.org** et **itch.io**. Mesuré,
pas supposé :

```
https://kenney.nl/          connect_rejected (organization policy)
https://quaternius.com/     connect_rejected
https://poly.pizza/         connect_rejected
https://opengameart.org/    connect_rejected
https://itch.io/            connect_rejected
```

Seul GitHub répond — c'est par là que les trois packs KayKit ont pu être
récupérés, licence lue chez l'auteur.

**La règle du projet interdit d'utiliser un asset dont la licence n'a pas été
vérifiée à la source.** Un miroir tiers qui annonce « CC0 » ne suffit pas. Rien
n'a donc été importé de ces sources, et **rien n'a été remplacé par un modèle
procédural déguisé en asset** : le §21 du brief l'interdit explicitement, et ce
serait la façon la plus rapide de rendre le résultat impossible à juger.

---

## 1. Animaux — le seul vrai trou

C'est la lacune la plus importante de la 0.6. KayKit ne publie aucun pack
d'animaux, donc la direction artistique n'en couvre pas.

### Pack visé

| | |
| --- | --- |
| Nom exact | **Quaternius — LowPoly Animated Animals** |
| Auteur | Quaternius |
| Source | https://quaternius.itch.io/lowpoly-animated-animals — ou https://quaternius.com/ |
| Licence annoncée | CC0 — **à relire chez l'auteur avant usage**, comme pour tout le reste |
| Contenu annoncé | 6 animaux animés, clips `Idle`, `Walk`, `Run`, `Jump`, `Death` |
| Formats livrés | **FBX, OBJ, Blend** — pas de glTF |

### Ce qu'il faut faire

1. Télécharger le pack depuis un poste qui atteint le site.
2. **Lire le fichier de licence livré avec le pack** et le copier dans
   `assets/animals/`.
3. Convertir en `.glb` — le projet ne charge que du glTF. Blender fait la
   conversion à l'export sans écrire une ligne de code.
4. Déposer les fichiers ainsi :

```
assets/animals/petit_herbivore.glb     ← espèce A (§8) : lapin ou équivalent
assets/animals/grand_quadrupede.glb    ← espèce B (§8) : cerf, sanglier…
assets/animals/oiseau.glb              ← espèce C (§8), facultative
assets/animals/<PACK>-LICENSE.txt
```

5. Ajouter les trois clés au `CATALOGUE` de `assetmanager.mjs` :

```js
petit_herbivore:  { url: "assets/animals/petit_herbivore.glb",  type: "animal" },
grand_quadrupede: { url: "assets/animals/grand_quadrupede.glb", type: "animal" },
oiseau:           { url: "assets/animals/oiseau.glb",           type: "animal" },
```

6. Vérifier dans `?arttest` : hauteur, transparence, clips résolus.
7. Ajouter les lignes correspondantes dans `ASSET_LICENSES.md`.

### En attendant

Les animaux de `living.mjs` restent ceux de la 0.5 : géométrie procédurale
fusionnée, trois familles distinguées par le comportement et l'échelle. **C'est
exactement ce que le §8 du brief refuse**, et ce point est donc rapporté FAIL,
pas contourné.

Une alternative à examiner si Quaternius reste inatteignable : chercher un pack
d'animaux CC0 hébergé **sur GitHub par son auteur**, seul chemin praticable
depuis cette session — et le juger d'abord sur sa compatibilité avec KayKit,
côte à côte dans `?arttest`.

---

## 2. Compléments souhaitables, non bloquants

Ces packs amélioreraient la 0.6 sans lui manquer aujourd'hui.

| Besoin | Pack visé | Source | Pourquoi |
| --- | --- | --- | --- |
| Végétation vivante plus variée | Kenney — Nature Kit | kenney.nl/assets/nature-kit | le pack Hexagon couvre le besoin, mais ses arbres sont dessinés pour des tuiles hexagonales |
| Sons de pas, vent, feu | Kenney — Impact / Nature Sounds | kenney.nl | §19 ; l'audio synthétisé actuel suffit, aucun fichier n'est requis |

Pour chacun : même procédure — licence lue chez l'auteur, fichier de licence
copié dans le dossier, ligne ajoutée dans `ASSET_LICENSES.md`.

---

## 3. Ce qui a été fait pendant ce temps

Tout ce qui ne dépendait pas de ces téléchargements a été préparé :

- `assetmanager.mjs` charge, met en cache, clone et anime n'importe quel glTF —
  il ne connaît que des clés de catalogue, pas des packs. Ajouter les animaux
  sera une ligne de catalogue, pas une refonte ;
- `CLIPS` accepte **plusieurs noms candidats par état de jeu**, précisément
  pour qu'un pack qui nomme ses clips autrement fonctionne sans modification ;
- `?arttest` affiche un **cube magenta étiqueté MANQUANT** à la place de tout
  asset absent — un trou se voit, il ne se devine pas ;
- les dossiers `assets/animals/` et `assets/audio/` existent et attendent.
