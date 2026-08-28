# FOG NOMAD — IDENTITY & TENSION 0.5

État du dépôt au démarrage, établi et non supposé :

| | |
| --- | --- |
| Branche de départ | `fog-nomad-identity-tension-0.5`, créée depuis `4f1f14f` |
| Baseline | 0.4, validée sur téléphone Android réel |
| Tests à l'état initial | 32 + 26 + 42 + 47 + 19 = **166/166** |
| Mesures 0.4 (appareil réel) | ~60 FPS, ~9 000 triangles, 50–60 appels, 25 chunks |
| Mesures 0.4 (cette machine) | 12,4 et 12,9 FPS · 41–42 appels · 31 géométries · 182 objets |

> La machine de test de cette session rend environ 40 % moins vite que celle de
> la session 0.4 : le même commit y passe de 21 à 12,9 FPS. **Toutes les
> comparaisons ci-dessous sont donc faites 0.4 contre 0.5 dans la même session.**

Cette version ne cherche pas à finir le jeu. Elle répond à deux reproches
précis : la menace avait cessé d'être menaçante, et le monde n'avait pas
d'identité.

---

## 1. Le cristal était devenu du consommable

### Mesure d'abord

Comptage de ce que le générateur **produit** (`spawnStats.parType`), pas de ce
qui reste en scène — le ramassage et le déchargement fausseraient la mesure.
4 seeds × 3 axes × 100 chunks, **8 734 poses** :

| | bois | pierre | **cristal** |
| --- | --- | --- | --- |
| 0.4 | 28,1 % | 47,0 % | **24,9 %** (16,4 à 30,1 selon le relevé) |

Un ramassage sur quatre. À ce taux le joueur en avait toujours un en réserve :
le cristal n'était plus une trouvaille, c'était une capacité permanente. C'est
la cause directe des 350–440 unités d'avance observées.

### Correctif

`abundance` 0,36 → **0,070**. La densité globale monte de 0,30 à 0,345 pour que
le monde ne se vide pas d'autant : c'est le cristal qui doit devenir rare, pas
les ressources. Sa valeur passe de 14 à 18 — plus rare, donc plus payant.

| | bois | pierre | **cristal** |
| --- | --- | --- | --- |
| 0.5 | 35,1 % | 58,4 % | **6,5 %** (3,1 à 8,9 selon le relevé) |

Cible de 5 à 8 % atteinte, sur 8 071 poses. Vérifié en continu par
`tests/balance05.mjs`, qui refait la mesure et échoue hors de la fourchette.

### Puissance

`pushDistance` 42 → **26 unités**. À la pression de mi-partie, un cristal
achète environ six secondes de survie : il sauve une situation, il n'en
installe plus une.

---

## 2. La brume ne menaçait plus

### Le défaut

Vitesse constante. Un joueur qui ne ramassait rien conservait +1,6 u/s et
n'était **jamais** rattrapé. La run ne s'arrêtait que par avidité ou par
lassitude.

### Ce qui a été refusé

Un rappel élastique sur la distance joueur/brume. Il punit le bon jeu et se
sent immédiatement comme une triche.

### Ce qui a été fait

```js
export function fogSpeedAt(elapsed) {
  const f = CONFIG.fog;
  const t = Math.max(0, elapsed - f.pressureDelay);
  const ramp = Math.min(1, t / f.pressureRamp);
  return Math.min(f.speedMax, f.speed + f.speedGain * Math.pow(ramp, f.pressureCurve));
}
```

Cette fonction ne lit **que** le temps écoulé. Ni la position du joueur, ni sa
vitesse, ni sa charge, ni son avance. Deux joueurs à la même minute subissent
exactement la même brume.

Ce n'est pas une intention mais une propriété testée : `balance05.mjs` relit la
vitesse après avoir téléporté le joueur à 5 000 unités et fait passer sa marge
de 4 à 900, au même instant de run. Elle ne bouge pas.

| Minute | 0–1 | 2 | 4 | 5 | 7 | 9+ |
| --- | --- | --- | --- | --- | --- | --- |
| Vitesse | 4,90 | 5,17 | 5,93 | 6,32 | 7,17 | **8,00** |

Références : joueur à 6,2 u/s à vide, 2,85 à sac plein, 11,16 en sprint.

**Le plafond passe volontairement au-dessus de la marche à vide** (croisement à
5 min 10). Sans cela, le défaut de la 0.4 reste : ne rien ramasser reste une
stratégie gagnante. Passé ce point, tenir la distance demande de sprinter, donc
du souffle, donc un sac léger. La dernière décision reste au joueur.

Un réglage mort a été trouvé par le test : `speedMax` valait 8,3 pour un
plateau réel de 8,0 (`speed + speedGain`). Le plafond ne pouvait jamais être
atteint et décrivait mal le comportement. Ramené à 8,0.

### Souffle

`drainBase` 17 → 21. À 17, l'alternance sprint/marche tenait un régime
soutenable de 7,5 u/s — assez pour distancer la brume indéfiniment avec un sac
léger. Le trou a été trouvé par la simulation, pas par raisonnement.

---

## 3. Durée des runs

Simulations sur la vraie `CONFIG` (`tests/simulate05.mjs`), moyenne sur 8 seeds :

| Profil | Durée | Distance | Ramassées | Jetées | Cristaux tr./ut. | Marge moy. | Marge max | Poids moy./max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRUDENT | 8,1 min | 2 801 | 5 | 2 | 2,8 / 1,4 | 130 | 192 | 21 / 24 |
| NORMAL | 10,2 min | 3 237 | 30 | 11 | 4,8 / 2,6 | 76 | 132 | 44 / 54 |
| GOURMAND | 6,4 min | 1 538 | 42 | 21 | 4,9 / 3,8 | 63 | 120 | 67 / 92 |
| SPRINTER | 15,4 min | 6 242 | 8 | 4 | 7,4 / 1,0 | 301 | 505 | 26 / 28 |

Fourchette 6,4 à 15,4 minutes, contre une cible de 7 à 15. Le profil gourmand
meurt plus vite — c'est le sens du jeu.

Bandes de marge du profil NORMAL : 2 % critique, 61 % tension, 36 %
confortable. Une run normale se joue en tension, pas en promenade.

### Trois défauts de MODÈLE corrigés

Ils décrivaient le simulateur, pas le jeu, et il faut le dire :

1. **Le délai de récupération du souffle était ignoré.** Le profil SPRINTER
   survivait 58,5 minutes. Avec `regenDelay`, 15,4.
2. **Le joueur ne jetait jamais rien pour survivre**, alors que c'est la
   mécanique centrale. Ajout d'une règle de délestage sous 30 unités de marge.
3. **Un détour était facturé comme un aller-retour perpendiculaire.** Une
   ressource est devant et sur le côté : on y va en diagonale et on continue de
   progresser. Le profil GOURMAND mourait en 1 min 40 ; il tient 6,4 min.

> Ces simulations ne disent **rien** du plaisir de jeu. Un modèle n'hésite pas,
> ne se lasse pas, ne change pas d'avis. Elles servent à détecter un équilibre
> absurde — une run de 40 secondes, une run infinie — et rien d'autre.

---

## 4. Identité visuelle

### Le ciel dit où est l'espoir

Le dégradé n'est plus seulement vertical, il est **directionnel** : le −Z (la
direction de fuite) s'éclaircit vers un crème chaud, le +Z se referme sur un
prune froid. Le dôme suit la caméra sans tourner avec elle, donc l'opposition
reste liée au monde. Le joueur lit « devant = espoir, derrière = menace » sans
une ligne de texte.

### Le monde meurt derrière le joueur

Une paire d'uniformes partagée, injectée par `onBeforeCompile` dans tous les
matériaux du monde. À l'approche du mur, la végétation se décolore et le sol
vire au gris-prune. Trois instructions dans le fragment shader, **une écriture
par image**, rien à recalculer quand un chunk se recrée.

Deux pièges rencontrés :

- la matrice d'instance n'est pas dans `modelMatrix` : sans le cas
  `USE_INSTANCING`, toutes les instances d'un chunk partageaient le Z du chunk,
  soit jusqu'à 16 unités d'erreur entre arbres voisins ;
- à portée trop courte, la bande mourante était **masquée par le brouillard
  atmosphérique**, qui éclaircit précisément là où la contamination assombrit.
  Les deux effets se neutralisaient. Portée calée sur la portée de vue (62 u).

### Terrain

Un champ de zones — rocaille, clairière, sol sec — lu **au même endroit** par
la couleur du sol et par le choix des familles de végétation. C'est ce partage
qui fait qu'une zone rocheuse a l'air rocheuse : le sol grisonne *et* les
arbres cèdent la place à des blocs, sans concertation explicite.

Relief : dépressions larges et plissement court. Elles noyaient 25 % du terrain
contre 19,5 % en 0.4 ; un relèvement de 0,9 ramène à **15,1 %** — plus de
relief *et* moins d'eau qu'avant. `CHUNK_SEGMENTS` 12 → 16.

### Végétation

Quatre silhouettes distinctes au lieu d'un houppier décliné par mise à
l'échelle : conifère élancé (trois étages étroits), conifère large (deux étages
trapus), arbre mort (tronc et branches nues, sans feuillage), arbuste. Plus les
touffes d'herbe et les blocs rocheux.

Une silhouette ne se déguise pas en une autre par un facteur d'échelle — c'était
la limite de la 0.4.

Densité de props 7–23 → **16–46 par chunk** : répartis sur huit familles,
chacune recevait trop peu d'exemplaires pour se lire.

### Personnage

Manteau à basque, capuche, écharpe rouge — la seule couleur vive de la
silhouette —, bottes, mains. Marche avec roulis du buste, contre-roulis des
épaules, pieds qui restent à plat, pan d'écharpe qui traîne.

**La charge se lit dans le mouvement** : pas plus courts et buste plus penché à
sac plein.

### Sac

Cinq silhouettes, pas cinq tailles : toile roulée, rondins en travers, pierre
sanglée, cristal planté au sommet. Ce sont les charges qui dépassent qui
portent la lecture. Le gonflement du sac est plus discret qu'en 0.4, où il
doublait de largeur et effaçait le personnage.

Les charges sont filles du **personnage** et non du sac : le sac se met à
l'échelle par palier, et des enfants auraient grossi avec lui jusqu'à couvrir
la tête.

---

## 5. Narration environnementale

Aucun texte, aucune quête, aucun PNJ. Des traces.

| Type | Ce qu'on voit | Fréquence |
| --- | --- | --- |
| Camp abandonné | foyer éteint cerclé de pierres, ballots, perche plantée | ~7 % des chunks, tous types confondus |
| Ruine | pan de mur, amorce d'arche, pierres tombées | idem |
| Balise | socle de pierre, cœur lumineux qui tourne et respire | idem |
| Monument | arche à anneau suspendu, sur un tertre | grille de 6 × 6 chunks |
| Arbre gigantesque | 15 unités de haut, trois couronnes étagées | idem |

Mesuré sur ~1 000 chunks traversés : **46 petites structures, 15 repères
lointains**. La rareté est ce qui fait la question — un camp abandonné dans
chaque chunk n'est plus un camp abandonné, c'est du décor.

Les repères lointains sont tirés sur une **grille grossière** et non par chunk :
sinon ils apparaîtraient et disparaîtraient au gré du streaming, alors que leur
raison d'être est d'être visés de loin et d'orienter une traversée.

Le tirage porte sur les coordonnées de chunk : la même ruine réapparaît au même
endroit après un rechargement.

Rien n'est expliqué. La balise fonctionne encore, on ne sait pas pourquoi.

---

## 6. Retours

**Cristal.** Au sol : rotation *et* pulsation lente de l'auto-éclairage. Un
point qui respire se repère à trente unités — la distance à laquelle il faut
décider du détour. À l'usage : une onde plate part du joueur, s'élargit en
décélérant et s'efface. On **voit** la brume reculer.

**Danger.** Trois bascules simultanées à l'approche du mur : le brouillard
atmosphérique se teinte de prune, le ciel s'assombrit, la lumière faiblit.
Toutes saturent à 70 % de leur amplitude : la tension se sent avant de regarder
le compteur, sans rendre l'image illisible.

**Son.** `audio.mjs`, entièrement synthétisé par WebAudio — aucun fichier
audio, aucune étape de build. Pas, collecte, cristal, feu, jeter, mort, plus un
grondement continu dont le volume et la fréquence suivent la distance au mur.

Le son est un **confort, jamais une dépendance** : contexte créé au premier
geste (les navigateurs mobiles l'exigent), toute la surface publique protégée,
et aucune ligne de logique de jeu ne lit son état.

---

## 7. Interface

Le bandeau technique (seed, coordonnées, chunks, biome) et le bouton NOUVEAU
sont désormais des outils de développement : ils n'apparaissent qu'avec
`?fogtest` ou `?diag`. Le HUD de jeu ne montre que vie, souffle, poids,
distance à la brume, contenu du sac et actions disponibles.

---

## 8. Performances

Même machine, même monde (seed 424242), même parcours, mesures alternées.

| | 0.4 | 0.5 |
| --- | --- | --- |
| FPS moyen | 12,4 · 12,9 | 11,7 · 11,7 (**−7 %**) |
| Image médiane | 69,3 · 71,4 ms | 76,6 · 77,1 ms |
| Appels de rendu | 41 · 42 | **59 · 60** |
| Géométries | 31 | 42 · 43 |
| Triangles (en exploration) | ~7 600 | **8 200 à 12 800** |
| Textures | 0 | 0 |
| Chunks actifs | 25 | 25 |
| Objets de scène | 182 | 231 |
| Tas JS | 12,2 MB | 15,0 MB |

Budgets tenus : moins de 100 appels, quelques dizaines de milliers de triangles,
aucune texture.

> **FPS sur GPU réel : NON MESURABLE ici.** Ces chiffres viennent d'un
> rasteriseur logiciel et ne transposent pas. −7 % en logiciel pour un saut
> visuel de cette ampleur est un bon signe, pas une garantie. Le mode
> `?fogtest` affiche tout en temps réel sur l'appareil : c'est là que le
> contrôle a du sens.

**Qualité automatique.** Trois niveaux, atteints seulement si la densité de
pixels est déjà au plancher. Ordre de sacrifice : pixels, puis décorations
(herbes et fleurs), puis les deux nappes de brume arrière. La qualité ne touche
**jamais** aux mécaniques — aucune ressource, structure, distance ni vitesse
n'en dépend, et un test le vérifie. Deux joueurs sur deux téléphones jouent au
même jeu, ils ne le voient pas aussi bien.

---

## 9. Tests

**200 vérifications, 200 PASS**, plus les simulations d'équilibrage.

| Fichier | Vérif. | Objet |
| --- | --- | --- |
| `tests/suite.mjs` | 32 | moteur : démarrage, tactile, caméra, chunks, sauvegarde |
| `tests/audit.mjs` | 26 | audit 0.2 : continuité, fuites, sauts, mondes multiples |
| `tests/fog03.mjs` | 42 | règles 0.3 : brume, dégâts, mort, poids, endurance |
| `tests/fog04.mjs` | 47 | 0.4 : ressources sur 100 chunks, objets jetés, cristal, feu |
| `tests/regressions.mjs` | 19 | défauts historiques, visés par leur mécanisme |
| `tests/balance05.mjs` | 34 | **nouveau** — distribution, pression, bandes, run longue |
| `tests/simulate05.mjs` | — | **nouveau** — quatre profils sur la vraie `CONFIG` |

### Trois tests corrigés, tous pour la même raison

Ils mesuraient l'horloge murale alors que `delta` est plafonné à 40 ms par
image : sous rendu logiciel le temps de jeu avance moins vite que le temps
réel, et les seuils absolus mesuraient en fait la cadence de la machine de
test. Ils portent désormais sur le temps de jeu ou sur la condition elle-même.

### Un test réécrit plutôt qu'assoupli

`audit P4` comparait le compteur de géométries au départ de session.
`renderer.info.memory.geometries` ne compte une géométrie qu'à son **premier
rendu** : les familles de végétation et les structures n'y entrent qu'une fois
croisées. Le test confondait donc ce chargement paresseux avec une fuite.

Il parcourt maintenant 100 chunks **de plus** et compare le 100ᵉ au 200ᵉ : une
fuite continue de croître, un chargement paresseux non. Mesuré : 44 → 44.

---

## 10. Ce que la 0.5 ne fait pas

Conformément à la règle absolue : aucun combat, ennemi, arme, quête, PNJ,
multijoueur, boutique, publicité, Battle Pass, saison, compte, backend, arbre
de compétences, ni dizaines de recettes.

### Risques et limites qui restent

**Le sprinter léger reste un cas limite.** Un joueur qui garde son sac sous 30
et alterne sprint et marche tient 15,4 minutes avec une marge moyenne de 301
unités. Aucun réglage de courbe ne supprime ce cas sans punir le jeu normal, et
le rubber-banding est exclu. C'est une stratégie qui échange tout le score
contre de la survie : elle rapporte 3 de valeur contre 15 pour un profil
normal. Assumé, mesuré, consigné.

**La marge maximale dépasse encore la fourchette visée** pour ce profil (505
contre 300 « exceptionnel »). Pour les trois autres profils elle reste entre
120 et 192.

**Aucune validation sur GPU réel** de la 0.5. Tous les FPS de ce document
viennent de SwiftShader.

**Le mécanisme de l'artefact des fleurs reste inexpliqué** (voir
`AUDIT_PERFORMANCE_BUGS_0.2.md`, B0). On sait l'éviter, pas pourquoi.

**Le son n'a pas été écouté**, seulement exécuté sans erreur. Un test
automatisé ne juge pas un mixage.

**La 0.5 reste une pré-alpha interne.** Aucune des cinq questions du Core Test
n'a de réponse : elles se répondent manette en main, et personne n'a encore
joué à cette version.

---

## 11. Paramètres ajoutés en 0.5

| Groupe | Clé | Valeur | Rôle |
| --- | --- | --- | --- |
| brume | `speed` | 4,9 | vitesse au démarrage |
| | `pressureDelay` | 60 s | grâce avant toute montée |
| | `pressureRamp` | 480 s | durée de la rampe |
| | `pressureCurve` | 1,25 | douce au début, plus franche ensuite |
| | `speedGain` | 3,1 | ajout au bout de la rampe |
| | `speedMax` | 8,0 | plafond dur |
| ressources | `cristal.abundance` | 0,070 | 6,5 % des poses (mesuré) |
| | `cristal.value` | 18 | plus rare, donc plus payant |
| | `spawnDensity` | 0,345 | compense la raréfaction du cristal |
| cristal | `pushDistance` | 26 u | recul imposé à la brume |
| | `waveRadius` / `waveDuration` | 26 u / 0,9 s | onde visible |
| | `pulseSpeed` / `pulseAmount` | 2,1 / 0,42 | pulsation au sol |
| endurance | `drainBase` | 21 | ferme le régime de sprint perpétuel |
| contamination | `range` | 62 u | largeur de la bande mourante |
| danger | `DANGER_DISTANCE` | 95 u | début de la bascule d'ambiance |
| repères | `LANDMARK_GRID` / `LANDMARK_CHANCE` | 6 / 0,42 | densité des repères lointains |
