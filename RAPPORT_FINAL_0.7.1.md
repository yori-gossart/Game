# FOG NOMAD 0.7.1 — VERTICAL SLICE COMPLETION

**Rapport final** · 11 septembre 2026
Dépôt `yori-gossart/Game` · branche `fog-nomad-vertical-slice-completion-0.7.1`

---

## DEPLOYMENT RECOVERY

| | |
| --- | --- |
| **0.7 HEAD** | `dbf1d705574f843ba2dcedec102264b13d618241` |
| **0.7 PRÉSERVÉE** | **PASS** — working tree propre, aucun commit perdu |
| **BRANCHE 0.7** | `fog-nomad-prologue-vertical-slice-0.7`, poussée à `dbf1d70` |
| **ANCIENNE PROD IDENTIFIÉE** | **PASS** — sans ambiguïté |
| **ANCIENNE PROD COMMIT** | `e9e3641949343c1f1ae95e632c45a39cf60e580c` |
| **ROLLBACK** | **NON EXÉCUTÉ — aucun moyen disponible** |
| **PRODUCTION ACTUELLE** | FOG NOMAD 0.7 (`dbf1d70`) |
| **PRODUCTION URL** | `horizon-proto-ten.vercel.app` |
| **PRODUCTION BRANCH** | `claude/new-session-nrx5d6` |

### Identification de l'ancienne production

`dpl_Bf8muKP7sptCun6RSAUSB3Ei9Xb5`, récupérée et **lue** :
`<title>Horizon Proto 0.2</title>`. C'est le déploiement de production le plus
récent antérieur à l'incident ; les deux autres candidats lui sont antérieurs.

### Pourquoi le rollback n'a pas été exécuté

Pas par ambiguïté : la cible est certaine. Par absence d'outil.

| Moyen | État |
| --- | --- |
| MCP Vercel | aucun outil de rollback, promote ou alias |
| CLI Vercel 59.15.1 | installée, mais `vercel whoami` répond `Logged out.` |
| Jeton | aucun `VERCEL_TOKEN`, aucun jeton dans la config CLI |

Fabriquer un nouveau déploiement de production depuis le code 0.2 aurait été
possible en apparence — c'est exactement ce que le §A4 interdit : il faut
restaurer le déploiement immuable existant, pas en produire un sosie.

**Commande pour une personne authentifiée**, relevée dans l'aide de la CLI :

```
vercel rollback horizon-proto-ojejmg63c-nutricyclev01a.vercel.app
```

Ou, depuis le tableau de bord : projet `horizon-proto` → Deployments → le
déploiement du commit `e9e3641` → **Instant Rollback**.

Contrôle après coup : `horizon-proto-ten.vercel.app` doit répondre
`<title>Horizon Proto 0.2</title>`.

### Cause de l'incident

`claude/new-session-nrx5d6` **est la branche de production du projet Vercel
depuis sa création**. Ce n'est pas un réglage modifié en route : les trois plus
anciens déploiements du projet la portent tous avec `target: production`, tandis
que les sept branches `fog-nomad-*` poussées ensuite ont **toutes** produit des
previews. C'était la branche de travail de l'époque Horizon 0.2.

La consigne de session imposait explicitement d'y pousser. Les deux règles
étaient contradictoires, et la contradiction n'a été vue qu'après coup.

### Mesure anti-récidive

1. Plus aucun push sur `claude/new-session-nrx5d6`.
2. Développement exclusivement sur des branches `fog-nomad-*`.
3. **Le `target` du déploiement est relu après chaque push.** C'est le contrôle
   qui manquait : le seul signe de l'incident avait été un champ dans une
   réponse d'API que personne n'avait lu.

La branche de production Vercel n'a **pas** été changée : aucun outil disponible
ici ne permet de la lire, et la remplacer à l'aveugle par `main` — qui n'existe
pas dans ce dépôt — aurait cassé le projet au lieu de le réparer.

**Rien n'a été supprimé** : aucun projet, aucun déploiement, aucun domaine,
aucune branche, aucun historique.

---

## 0.7.1

| | |
| --- | --- |
| **BASELINE** | `dbf1d70` |
| **BRANCHE** | `fog-nomad-vertical-slice-completion-0.7.1` |
| **COMMIT** | `3a7a0a4` |

| Élément | Verdict |
| --- | --- |
| PROLOGUE COMPLET | **PASS** — 15/15 sur normal et exploration |
| RÉVEIL | PASS |
| TOUR-BALISE | **PARTIEL** — visible et racontant la chute, mais inchangée depuis 0.7 |
| SAC | PASS |
| RÉVÉLATION BRUME | **PASS** — la caméra pivote **et descend** à l'horizon |
| SILHOUETTE RÉELLEMENT HAPPÉE | **PASS** — écart au front 3,6 → 2,7 u, puis `englouti` |
| MESSAGE FUIS | PASS |
| COLLECTE VOLONTAIRE | **PASS** — 3 s immobile sur une bûche ne ramassent rien |
| POIDS = CHOIX | **PASS** — sac max 38 / 45 / 60 kg, contre 96 en 0.7 |
| PREMIER FEU ENSEIGNÉ | **PASS** — bois, puis pierre, puis la recette |
| FEUX PARCOURS RAPIDE | **0** |
| FEUX PARCOURS NORMAL | **3** |
| FEUX PARCOURS EXPLORATION | **8** |
| TRACES DU CONVOI | PASS |
| OBJECTIF CONVOI | PASS |
| STRUCTURE INTERMÉDIAIRE | PASS — camp du convoi posé et rencontré |
| PILIER ANCIEN | PASS |
| INTERACTION CRISTAL | PASS |
| RÉACTION VISUELLE BRUME | **PARTIEL** — recul net au chiffre, peu spectaculaire à l'image |
| TRANSITION PROCÉDURALE | PASS |

---

## DURÉES

| Profil | Durée | Étapes | Ramassées | Feux | Marge min/moy/max | Sac max |
| --- | --- | --- | --- | --- | --- | --- |
| **RAPIDE** | **10 min 13 s** | 14/15 | 1 | 0 | 55 / 129 / 160 | 38 kg |
| **NORMAL** | **10 min 53 s** | 15/15 | 11 | 3 | 55 / 94 / 150 | 45 kg |
| **EXPLORATION** | **12 min 3 s** | 15/15 | 65 | 8 | 47 / 88 / 150 | 60 kg |

**NO-FIRE :** *termine*. Le parcours rapide finit sans un seul feu. Je n'ai
**pas** mesuré de profil qui refuse le feu *sous pression* — ce cas n'est pas
couvert par la 0.7.1.

Le parcours rapide est à 14/15 parce qu'il n'allume aucun feu : `FIRST_FIRE` ne
se franchit donc pas. C'est le comportement voulu, pas un défaut.

Les marges ne deviennent jamais confortables et ne tuent jamais.

**Comparaison 0.7 → 0.7.1, parcours normal :** 40 feux → **3**.

---

## ART PASS

| Sujet | Verdict |
| --- | --- |
| **BRUME** | **PARTIEL** |
| **BORD BRUME** | **ORGANIQUE** — courbes déphasées vérifiées à l'image, mais pas encore déchiqueté |
| **TERRAIN** | **FAIBLE** — non traité |
| **CIEL** | **FAIBLE** — écrit, vérifié invisible trois fois, retiré |
| **TOUR** | **PARTIEL** |
| **STRUCTURES** | **PARTIEL** — tour, camp du convoi, pilier posés et rencontrés en jouant |
| **ANIMAL** | **PROVISOIRE** |
| **AUDIO** | **PARTIEL** |

---

## PERFORMANCE

| | |
| --- | --- |
| DRAW CALLS | **48** |
| TRIANGLES | **23 987** |
| GEOMETRIES | **52** |
| TEXTURES | **3** (plus grande : 1024 px) |
| SKINNED MESHES | **6** |
| FPS ENVIRONNEMENT DE TEST | **15,7** |
| **VALIDATION SAMSUNG A55** | **EN ATTENTE UTILISATEUR** |

**Ces totaux ne se comparent pas d'une version à l'autre.** Chaque chargement
tire une graine différente : un écart de 14 000 à 44 000 triangles entre deux
relevés de la **même** version est courant.

Ce qui se compare, parce que calculé et non relevé :

| | avant | après | delta |
| --- | --- | --- | --- |
| Nappes de brume (4 plans) | 26 × 7 | 112 × 8 | **+5 712 triangles** |
| Dôme de ciel | 32 × 14 | *inchangé* | **0** — retiré |
| **Total** | | | **+5 712 triangles, 0 appel de rendu** |

Le relief de profondeur des nappes coûte **zéro** : il déplace des sommets qui
existaient déjà.

Le rendu de test est logiciel (SwiftShader). **Ces fps ne prédisent rien d'un
GPU réel.** Repli disponible si la brume coûte trop cher sur l'appareil :
`setFogDetail(false)` retire les deux nappes de fond — la moitié du coût — sans
toucher à la lecture du mur.

---

## TESTS

| Suite | Résultat |
| --- | --- |
| `suite.mjs` | 32 / 32 |
| `audit.mjs` | 27 / 27 |
| `fog03.mjs` | 46 / 46 |
| `fog04.mjs` | 48 / 48 |
| `regressions.mjs` | 31 / 31 |
| `balance05.mjs` | 36 / 36 |
| `world05.mjs` | 19 / 19 |
| `ui05.mjs` | 47 / 47 |
| `art06.mjs` | 35 / 35 |
| **SUITE (total)** | **321 / 321** |
| **TESTS PROLOGUE** (`prologue07.mjs`) | **48 / 48** |
| **TESTS NÉGATIFS** (`prologue_negatifs.mjs`) | **23 / 23** |
| **ERREURS CONSOLE** | **0** |
| **RÉGRESSIONS** | **AUCUNE** |

### Faux PASS détectés et corrigés

1. **« le condamné a bien disparu »** validait `!vivant`, que la règle « trop
   loin devant » mettait à faux toute seule. La Brume n'avait jamais rattrapé
   personne pendant toute la 0.7. `englouti` a désormais un seul chemin, et le
   test relève l'écart au front image par image.
2. **Le pilote du banc** visait une réserve de 54 kg, au-dessus de son propre
   seuil de « trop lourd » : il allumait un feu dès qu'il en avait de quoi.
   51 feux mesurés, pire que la 0.7. Le banc mesurait sa propre politique.
3. **Deux de mes assertions** dans les tests négatifs : signe de l'écart au front
   inversé, et un seuil qui mesurait en réalité la cadence de sondage.

---

## DÉPLOIEMENT FINAL

| | |
| --- | --- |
| **TARGET** | **PREVIEW** — `target: null` vérifié sur le déploiement **et** sur le projet |
| **VERCEL PREVIEW** | `https://horizon-proto-git-fog-nomad-vertical-slic-15c69f-nutricyclev01a.vercel.app` |
| **PRODUCTION MODIFIÉE APRÈS RECOVERY** | **NON** |

Aucun déploiement de production n'a été créé depuis l'incident. Les trois
domaines de production sont inchangés.

---

## LIMITES

### Éléments encore prototype

- **Terrain local (§I)** — non traité.
- **Ciel (§J)** — bandes nuageuses écrites, **vérifiées invisibles trois fois**
  (5,5 %, 17 %, enveloppe déplacée à l'horizon), puis retirées avec leurs
  1 024 triangles.
- **Tour-balise (§K)** — inchangée depuis la 0.7.
- **Animaux (§M)** — aucun pack CC0 atteignable ; silhouettes procédurales.
- **Audio (§N)** — le paysage sonore demandé existe déjà et est entièrement
  synthétisé, mais rien n'a été retravaillé en 0.7.1.
- **Front de brume (§F4)** — courbes et profondeur acquises, mais grandes arches
  douces plutôt que découpe franche.

### Bloquants

**Un seul : le rollback de production**, qui demande une personne authentifiée
chez Vercel.

---

## LES DEUX CHOSES À RETENIR

**Les quarante feux n'étaient pas un problème de feu.** Ils venaient d'un sac
qui se remplissait tout seul jusqu'à 96 kg sur 100 : un joueur écrasé est lent,
et un joueur lent brûle pour survivre. Rendre la collecte volontaire les a
ramenés à trois.

**Le ciel a suivi exactement le chemin que la 0.7 avait pris sur la crête de la
brume** — du code juste, un coût de rendu réel, et rien à l'écran. Il a été
retiré plutôt qu'annoncé.

---

## DOCUMENTS LIÉS

| Fichier | Contenu |
| --- | --- |
| `FOG_NOMAD_0.7.1_VERTICAL_SLICE_COMPLETION.md` | le détail technique des quatre chaînes de cause |
| `DEPLOYMENT_RECOVERY_0.7.1.md` | l'incident de déploiement, sa cause et sa réparation |
| `PROLOGUE_TEST_PLAN.md` | comment juger le prologue sur un téléphone |
| `tests/README.md` | les onze suites et leurs principes |
