# FOG NOMAD — Résultats du Core Test

Ce fichier recueille les **résultats réels de jeu**, pas les résultats techniques.
Ceux-ci sont dans `FOG_NOMAD_CORE_TEST_0.3.md`.

État : **aucune session enregistrée.** Le prototype est techniquement prêt ;
son intérêt en tant que jeu n'est pas établi.

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
