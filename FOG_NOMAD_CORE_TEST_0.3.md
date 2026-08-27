# FOG NOMAD — CORE TEST 0.3

Baseline : `e9e3641` (Horizon 0.2 stabilisée). Branche : `fog-nomad-core-test`.

## 1. Objectif

Cette version ne cherche pas à construire un jeu. Elle teste **une seule hypothèse** :

> Le compromis entre exploration, avidité, poids du sac et fuite devant une brume mortelle produit-il une boucle de jeu intéressante pendant quelques minutes ?

Tout ce qui ne sert pas à répondre à cette question a été écarté : pas d'ennemis, pas de combat, pas d'artisanat, pas de cycle jour/nuit, pas de progression permanente, pas de compte, pas de backend.

Les cinq questions auxquelles le prototype doit permettre de répondre — et qui comptent plus que la liste de fonctionnalités :

1. le joueur prend-il spontanément des détours pour des ressources ?
2. le poids crée-t-il réellement une hésitation ?
3. le joueur jette-t-il parfois volontairement des objets pour survivre ?
4. la brume crée-t-elle de la tension sans seulement être agaçante ?
5. une run donne-t-elle envie d'en recommencer une ?

Aucune ne se mesure en test automatisé. Elles se répondent manette en main.

## 2. Règles

Un mur de brume descend l'axe Z à vitesse constante, derrière le joueur. Y rester coûte de la vie ; la vie tombée à zéro termine la run.

Des ressources jonchent le monde. Les communes sont sur l'axe de fuite, les rares nettement sur les côtés. S'en approcher déclenche une collecte automatique de 0,6 s pendant laquelle le joueur est ralenti à 32 % — **le détour coûte du temps, et la brume ne s'arrête pas pendant ce temps**.

Chaque objet pèse. Plus le sac est lourd, plus le joueur est lent et plus le sprint coûte de souffle. Jeter un objet allège immédiatement.

Il n'y a pas d'objectif de score imposé : la run s'arrête quand la brume rattrape le joueur.

## 3. Paramètres

Tout ce qui s'équilibre vit dans `CONFIG`, en tête de `fognomad.mjs`. Aucun nombre magique n'est dispersé dans le code.

| Groupe | Clé | Valeur | Rôle |
| --- | --- | --- | --- |
| brume | `startDistance` | 58 | marge initiale, en unités |
| | `speed` | 4.6 | u/s, constante |
| | `acceleration` | 0 | réservé — voir §8 |
| | `damagePerSecond` | 32 | ≈ 3 s de survie dans la brume |
| | `warnDistance` | 22 | seuil d'alerte visuelle |
| poids | `max` | 100 | capacité du sac |
| | `speedAtFull` | 0.46 | vitesse relative à sac plein |
| | `curve` | 1.35 | courbure de la pénalité |
| endurance | `drainBase` / `drainPerWeight` | 17 / 15 | par seconde, à vide / supplément à plein |
| | `regen` / `regenDelay` | 21 / 0.6 | récupération |
| collecte | `radius` / `duration` / `slowFactor` | 2.7 / 0.6 s / 0.32 | portée, durée, ralentissement |
| ressources | `spawnAttemptsPerChunk` | 9 | densité |

Ressources :

| Type | Poids | Valeur | Écart latéral | Fréquence |
| --- | --- | --- | --- | --- |
| Bois | 7 | 1 | 0 – 20 | 55 % |
| Pierre | 13 | 4 | 14 – 44 | 32 % |
| Cristal | 5 | 14 | 34 – 78 | 13 % |

L'écart latéral est mesuré depuis **l'axe de la run** (le X de départ), pas depuis l'origine du monde : une run lancée n'importe où retrouve le même couloir.

## 4. Équilibrage, et comment il a été choisi

La vitesse de la brume n'a pas été réglée à l'oreille. La vitesse du joueur vaut `6.2 × (1 − 0.54 · r^1.35)` où `r` est le taux de charge. En égalant à la vitesse de la brume, on obtient la **charge d'équilibre** : la charge maximale à laquelle le joueur tient encore la distance.

| Brume | Charge d'équilibre | Marge à vide | Perte à sac plein | Survie depuis 58 u |
| --- | --- | --- | --- | --- |
| 3,15 | 93 % | +3,05 u/s | −0,30 u/s | 195 s |
| 4,00 | 73 % | +2,20 u/s | −1,15 u/s | 51 s |
| **4,60** | **58 %** | **+1,60 u/s** | **−1,75 u/s** | **33 s** |
| 5,20 | 41 % | +1,00 u/s | −2,35 u/s | 25 s |

4,6 a été retenue : le joueur peut porter un peu plus de la moitié de son sac sans perdre de terrain, et au-delà la brume gagne. Chaque ramassage coûte en plus ~1,7 unité de marge.

Mesuré en jeu : à 55 de charge, le facteur de vitesse tombe à 0,76.

## 5. Architecture

Trois modules, aucune refonte du moteur.

```
main.mjs          moteur Horizon 0.2 — terrain, chunks, caméra, personnage
  └─ appelle la couche de jeu en 5 points seulement :
       populateChunk()    peuplement d'un chunk en ressources
       onChunkDisposed()  oubli des ressources d'un chunk libéré
       update()           brume, dégâts, endurance, collecte, télémétrie
       speedFactor()      facteur de vitesse dû à la charge et à la collecte
       canSprint()        autorisation de sprint selon l'endurance

fognomad.mjs      règles, état, configuration, télémétrie
fognomad-ui.mjs   liaison de l'interface — ne décide de rien
```

`CONFIG` et `speedFromWeight()` sont exportés, donc testables et ajustables depuis la console (`HORIZON.config`).

### Rendu des ressources : un choix, pas un réflexe

Les ressources sont des **objets individuels** partageant géométrie et matériau par type. Ni `InstancedMesh`, ni géométrie fusionnée. Trois raisons :

1. l'instanciation des fleurs se corrompait sur le GPU cible (`AUDIT_PERFORMANCE_BUGS_0.2.md`, B0) et rien n'établit que le défaut se limitait aux fleurs ;
2. une ressource doit disparaître à l'unité quand on la ramasse, ce qu'une géométrie fusionnée rendrait coûteux ;
3. le Mesh ordinaire est le chemin de rendu déjà validé sur l'appareil.

Le coût a été mesuré, pas supposé : **65 ressources actives, 41 draw calls, soit exactement le chiffre de la baseline**. Le tronc de cône de vue en élimine la grande majorité.

## 6. Tests

`tests/fog03.mjs` — **41 vérifications, 41 PASS** :

- brume : progression mesurée à 4,6 u/s, conforme à la configuration
- dégâts : la vie baisse dans la brume, la mort survient en ~3 s
- mort : écran affiché, six statistiques, run enregistrée localement
- restart : vie, sac, brume, ressources et chunks réinitialisés
- ressources : trois types, latéralité croissante vérifiée (bois 10 < pierre 29 < cristal 53), aucun cristal dans le couloir central
- collecte : ramassage automatique à proximité, inventaire mis à jour
- poids : 0 % → 1,000 · 25 % → 0,917 · 50 % → 0,788 · 75 % → 0,634 · 100 % → 0,460 — décroissance monotone, encore jouable à plein
- sac : cinq paliers visuels distincts
- jeter : poids réduit immédiatement, compteur incrémenté
- endurance : consommation, récupération, sprint bloqué à vide
- quadrants : ressources générées dans les quatre (38 chacun), aucune valeur non finie
- seed : changement pris en compte, ressources régénérées
- **10 runs successives** : géométries 24 → 23, objets de scène stables, chunks bornés, télémétrie plafonnée à 20

`tests/suite.mjs` — 32/32 · `tests/audit.mjs` — 26/26.

**Un test a changé de sens, volontairement.** La position n'est plus restaurée au rechargement : la restaurer remettrait la brume à distance de sécurité, soit une échappatoire gratuite. La seed reste sauvegardée, donc le monde est identique et la run repart du départ. Les deux assertions concernées vérifient désormais ce comportement-là.

## 7. Performances

Mesuré en course, rendu **logiciel** (SwiftShader), émulation Pixel 7 :

| | Baseline 0.2 | Fog Nomad 0.3 |
| --- | --- | --- |
| FPS moyen | 41,9 | 39,3 |
| Draw calls | 41 | 41 |
| Triangles | 7 258 | 4 380 |
| Géométries | 29 | 29 |
| Textures | 0 | 0 |
| Chunks actifs | 25 | 25 |
| Objets de scène | ~150 | ~223 |

Aucune dégradation significative. Les +73 objets de scène sont les ressources ; elles ne coûtent rien en draw calls grâce au culling.

Les FPS ci-dessus viennent d'un rasteriseur logiciel et **ne transposent pas** sur un GPU réel. Ils servent à comparer avant/après.

## 8. Limitations

**Une run purement prudente ne se termine jamais.** La brume avance à vitesse constante, comme demandé pour le Core Test ; un joueur qui ne ramasse rien conserve +1,6 u/s et ne sera jamais rattrapé. La run ne s'arrête donc que par avidité. C'est une conséquence directe et assumée de la contrainte « vitesse constante » — et le seul levier pour borner les runs existe déjà : `CONFIG.fog.acceleration`, actuellement à 0. Le passer à ~0,004 u/s² ajoute une unité de vitesse toutes les quatre minutes.

**La durée cible de 3 à 8 minutes n'est donc pas garantie**, elle dépend entièrement du comportement du joueur. Elle n'a pas pu être mesurée : simuler une run de cinq minutes en rendu logiciel prend cinq minutes réelles, et un robot ne joue pas comme un humain.

**Les objets jetés disparaissent** : ils ne sont pas matérialisés au sol. Le Core Test porte sur la décision, pas sur la récupération.

**Aucune validation sur appareil réel** à ce stade. Les FPS, le confort tactile du ramassage automatique et la lisibilité du mur de brume ne sont pas validés hors émulation.

**Le multi-touch réel n'est pas testé** — joystick et caméra simultanés restent à confirmer sur un vrai écran.

## 9. Résultats

Les résultats de jeu réels sont consignés séparément dans `CORE_TEST_RESULTS.md`, vide à ce stade : le prototype est techniquement prêt, le gameplay n'est pas validé.

Ce document ne dit **pas** que le jeu est bon. Il dit que les mécaniques fonctionnent et que le coût est maîtrisé.

## 10. Mode test

`?fogtest` (ou `?diag`) affiche un bandeau de métriques temps réel — FPS, pire image, densité de pixels, draw calls, triangles, géométries, textures, chunks, objets, ressources — et réactive le HUD de développement hérité.

Depuis la console, `HORIZON` expose l'état de jeu (`game`, `config`, `fogGap`, `bagTier`, `speedFactor`, `canSprint`, `runs`, `resourceSample`) et de quoi piloter (`drop`, `kill`, `restartRun`, `setFogGap`, `teleport`, `setSeed`).

La télémétrie locale garde les 20 dernières runs sous `fog-nomad-runs-0.3` : durée, distance, ressources ramassées et jetées, poids maximum, temps de sprint, marge minimale à la brume, détours, cause de mort. Aucun envoi, aucun serveur.
