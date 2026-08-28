# FOG NOMAD — Résultats du Core Test

Ce fichier recueille les **résultats réels de jeu**, pas les résultats techniques.
Ceux-ci sont dans `FOG_NOMAD_CORE_TEST_0.3.md`.

État : **deux sessions internes enregistrées, sur la 0.3 et la 0.4.** Le
prototype est techniquement prêt ; son intérêt en tant que jeu n'est pas
établi. Aucune des cinq questions n'a de réponse.

---

## Session interne — 0.3 — téléphone Android

> **Ce n'est pas une validation utilisateur externe.** Il s'agit d'une session
> de l'auteur du projet sur son propre appareil. Une seule run, un seul
> joueur, qui connaît le jeu et ses réglages. Ces chiffres servent à orienter
> le développement ; ils ne disent rien de la façon dont un joueur extérieur
> réagirait. Les cinq questions ci-dessous restent donc **sans réponse**.

**Chiffres relevés**

| Run | Durée | Distance | Ramassées | Valeur | Poids max | Jetées | Avance max | Cause |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 min 42 | 2 367 m | 8 | 61 | 54 / 100 | 2 | ~350 m | brume |

**Ce que ces chiffres montrent**

- **La run dépasse la fourchette visée** (3 à 8 min). Une avance de ~350 m
  confirme la limite déjà écrite dans `FOG_NOMAD_CORE_TEST_0.3.md`, §8 : à
  vitesse constante, un joueur qui gère sa charge n'est jamais rattrapé, et la
  run ne s'arrête que par avidité ou par lassitude.
- **8 ressources en 2 367 m, c'est très peu** — soit une tous les 300 m. Le
  poids maximum n'a atteint que 54 / 100, c'est-à-dire à peine la charge
  d'équilibre. Le compromis central n'a donc quasiment jamais été sollicité :
  le joueur n'a pas eu à choisir entre porter et fuir.
- **2 objets jetés** sur 8 ramassés — le geste existe, mais sur un échantillon
  d'une seule run, il ne prouve rien.

**Défauts observés en jeu**

| Défaut | Traité en 0.4 |
| --- | --- |
| Les ressources cessent d'apparaître au fil de la run | oui — cause identifiée et corrigée, voir `FOG_NOMAD_VERTICAL_SLICE_0.4.md` §1.1 |
| Les objets jetés disparaissent, impossible de les reprendre | oui — §1.2 |
| Les ressources ne servent qu'au score | oui — §1.3 |

Les deux premiers défauts expliquent en grande partie le troisième chiffre :
8 ressources sur 2 367 m n'est pas un réglage de densité, c'est le bug de
génération.

**Jugement porté sur la session**

> « Gameplay et graphismes encore trop basiques pour un test externe. »

C'est la raison pour laquelle la 0.4 est une tranche verticale **interne** :
elle corrige les trois défauts ci-dessus et donne au jeu une première identité
visuelle, avant tout élargissement du test.

---

## Session interne — 0.4 — téléphone Android

> **Ce n'est toujours pas une validation utilisateur externe.** Session de
> l'auteur du projet sur son propre appareil, sur une version qu'il a lui-même
> commandée. Les observations techniques sont fiables ; les jugements de
> gameplay engagent une seule personne qui connaît le jeu.

**Observations techniques**

| | Relevé |
| --- | --- |
| Fluidité | globalement fluide |
| FPS | ~60 |
| Triangles | ~9 000 |
| Appels de rendu | 50 à 60 |
| Chunks actifs | 25 |

Ce relevé est la première mesure de performance sur GPU réel depuis le début
du projet. Il établit qu'il **restait de la marge** — c'est lui qui a autorisé
la densité de végétation et le relief de la 0.5.

**Ce qui fonctionne**

Ressources générées pendant une longue exploration, objets jetés récupérables,
cristal et feu de répit opérationnels, boucle brume / collecte / poids en
place. Les trois correctifs de la 0.4 tiennent sur l'appareil.

**Ce qui ne va pas**

| Défaut observé | Traité en 0.5 |
| --- | --- |
| Trop de cristaux | oui — mesuré à 24,9 % des poses, ramené à 6,5 % (§1) |
| La brume se repousse extrêmement loin | oui — poussée du cristal 42 → 26 u (§1) |
| 350 à 440 unités d'avance observées | oui — pression temporelle (§2) ; simulé à 120–192 u pour trois profils sur quatre |
| La menace perd sa tension | oui — conséquence des trois points ci-dessus |
| Graphismes trop primitifs | oui — passe complète (§4) |
| Monde sans mystère ni identité | oui — ciel directionnel, contamination, narration (§4 et §5) |
| Quasiment aucune narration | oui — quatre types de structures et deux repères lointains (§5) |
| Ressemble encore à un prototype technique | partiellement — à rejuger sur l'appareil |

Les références en § renvoient à `FOG_NOMAD_IDENTITY_TENSION_0.5.md`.

**Ce qui n'a pas été observé**

La durée des runs n'a pas été relevée, ni le nombre de ressources ramassées,
ni la cause de mort. Les cinq questions restent donc entières : cette session
a servi à constater des défauts, pas à évaluer la boucle de jeu.

---

## Les cinq questions

Elles priment sur toute liste de fonctionnalités. Aucune ne se mesure
automatiquement.

1. Le joueur prend-il spontanément des détours pour des ressources ?
2. Le poids crée-t-il réellement une hésitation ?
3. Le joueur jette-t-il parfois volontairement des objets pour survivre ?
4. La brume crée-t-elle de la tension sans seulement être agaçante ?
5. Une run donne-t-elle envie d'en recommencer une ?

---

## Grille de session

À recopier pour chaque testeur.

### Session — <date> — <appareil> — <testeur>

*(Grille vierge à recopier. Aucune session externe n'a encore eu lieu.)*

**Contexte**

- appareil et navigateur :
- a déjà joué au prototype : oui / non
- nombre de runs :

**Chiffres** (relevés dans la console : `HORIZON.runs`)

| Run | Durée | Distance | Ramassées | Jetées | Poids max | Marge min | Détours | Cause |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |

**Les cinq questions**

| Question | Réponse | Ce qui a été observé |
| --- | --- | --- |
| 1. détours spontanés | oui / non / parfois |  |
| 2. hésitation liée au poids | oui / non |  |
| 3. abandon volontaire d'objets | oui / non |  |
| 4. tension vs agacement | tension / agacement / indifférent |  |
| 5. envie de recommencer | oui / non |  |

**Ressenti libre**

- moment le plus marquant :
- moment le plus frustrant :
- ce qui a été mal compris :

**Technique**

- artefact graphique observé : oui / non — lequel
- fluidité ressentie : fluide / acceptable / saccadé
- contrôles tactiles : joystick / caméra / bouton jeter — problèmes rencontrés

---

## Lecture des résultats

Le Core Test est **concluant** si les questions 2, 3 et 5 sont majoritairement
« oui ». Les mécaniques tiennent alors debout et l'on peut envisager la suite.

Il est **non concluant** si le joueur ne dévie jamais (question 1 « non ») ou
ne jette jamais rien (question 3 « non ») : le compromis central n'existe alors
pas, et ajouter des fonctionnalités ne le créerait pas.

Il est **à rejouer avec d'autres réglages** si la tension est perçue comme un
agacement (question 4) : c'est un problème d'équilibrage, pas de conception.
Les paramètres concernés sont dans `CONFIG` — vitesse de la brume, pénalité de
poids, durée de collecte.

Aucun système supplémentaire — ennemis, artisanat, progression, boutique — ne
doit être envisagé avant que ces réponses soient écrites ici.
