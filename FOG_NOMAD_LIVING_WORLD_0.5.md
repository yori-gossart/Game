# FOG NOMAD — LIVING WORLD 0.5

## Baseline établie, non supposée

Aucune hypothèse n'a été faite sur l'état du dépôt. Il a été relevé.

| | |
| --- | --- |
| Branche de départ | `fog-nomad-living-world-0.5`, créée depuis `9457bbc` |
| Version précédente | 0.5 Identity & Tension, jouée sur téléphone Android réel |
| Tests à l'état initial | 32 + 26 + 43 + 47 + 28 + 34 = **210 vérifications** |
| Rendu 0.5 Identity (cette machine) | 16,1 FPS · 62 appels · 10 870 triangles · 66 géométries |
| GPU de l'appareil de test | Samsung Xclipse 530 — ANGLE sur Vulkan 1.3.279, OpenGL ES 3.2 |

> **Toutes les mesures de FPS de ce document viennent de SwiftShader**, le
> rendu logiciel de la machine de développement. Elles servent uniquement à
> comparer deux versions **dans la même session**. Elles ne se transposent pas
> à un GPU réel, dans aucun sens. La seule mesure d'appareil qui existe est
> celle rapportée par l'auteur : ~60 FPS en 0.4, et 60 FPS / 70 appels /
> 11 502 triangles en 0.5 avec le bois mort désactivé.

La version précédente ne comptait pas la dernière ligne de ce tableau par
hasard. Elle s'ouvre sur un défaut d'appareil.

---

## 0. Ce que l'appareil a dit avant que le travail commence

Trois relevés utilisateur ont ouvert cette session, et ils ont orienté tout le
reste.

### 0.1 L'écran devenait noir

Capture d'écran : le jeu affiché « BRUME 2 », entièrement noir. La cause n'est
pas un shader. La caméra est **13 unités derrière le joueur** : le mur de brume
l'atteignait donc une douzaine d'unités avant lui.

Mesuré, en rapprochant la brume par paliers :

| Marge annoncée au joueur | Position de la caméra |
| --- | --- |
| 14 u | déjà 1,8 u derrière le front |
| 2 u | 9,8 u **à l'intérieur** du mur |

Le joueur devenait aveugle au moment précis où il devait choisir où courir.

**Correctif.** La distance de caméra se réduit quand le front approche
(`distanceCameraUtile()`, de 13 u à 4,5 u minimum), et toute nappe de brume qui
s'intercale entre l'objectif et le personnage s'efface progressivement. Mesuré
après correctif, en fraction de pixels sombres à l'écran :

| Marge | 40 u | 20 u | 12 u | 6 u | 2 u |
| --- | --- | --- | --- | --- | --- |
| Écran sombre | 1,1 % | 2,3 % | 8,7 % | 10,3 % | 10,4 % |

Collé au mur, l'écran reste lisible à 90 %. Trois assertions de
`tests/regressions.mjs` le vérifient en continu, dont une qui mesure la
position de la caméra par rapport au front — c'est elle qui aurait attrapé le
défaut d'origine.

### 0.2 Les polygones noirs sont revenus

Trois captures : de grands polygones noirs à arêtes franches tranchant le
monde, à BRUME 15, 24 et 35. Question posée : *« as-tu vérifié les choses qui
créaient ce même défaut auparavant ? »*

Non. Je ne l'avais pas fait, et c'était l'erreur.

`AUDIT_PERFORMANCE_BUGS_0.2.md` documente ce défaut sous le nom **B0** : le
rendu instancié des fleurs se corrompait sur ce GPU, mécanisme jamais expliqué,
seul correctif connu la fusion de géométrie. La 0.5 avait ajouté **cinq
nouvelles familles instanciées** sans relire cette page. L'exposition avait
triplé.

**Isolement.** Des interrupteurs par famille ont été ajoutés à `?diag` pour que
l'appareil puisse répondre à la place du raisonnement. La réponse est venue en
une capture : `boismort` désactivé, monde correct, 60 FPS, 70 appels,
11 502 triangles. *« C'est le bois mort le problème. »*

**Correctif.** Toutes les familles ajoutées en 0.5 sont passées en géométrie
fusionnée (`buildMerged`) : bois mort, arbustes, herbes, blocs. L'instanciation
est désormais **restreinte aux trois familles validées en 0.4 sur l'appareil** —
troncs, houppiers, rochers — et un test refuse toute nouvelle famille
instanciée :

```js
const AUTORISEES = ["troncs", "houppiers", "rochers"];
```

Le coût est nul : `buildMerged` écrit les sommets à leur position finale avec
leurs couleurs, soit un appel de rendu par famille et par chunk — exactement ce
que l'instanciation donnait.

La règle retenue, écrite dans l'audit : **sur ce GPU, une nouvelle famille
instanciée est un pari, pas une optimisation.** Elle ne se paie qu'après
validation sur l'appareil.

---

## 1. Génération contextuelle — `worlddirector.mjs`

### Le problème

Jusqu'ici chaque élément du monde était tiré indépendamment, chunk par chunk.
Un tirage indépendant produit deux défauts opposés et inévitables : des régions
entièrement vides qu'on traverse sans rien voir, et des grappes où trois
structures se touchent.

### Aucune IA distante

Il faut l'écrire explicitement, parce que le mot « intelligent » invite à le
supposer : **aucun appel réseau, aucune API, aucun modèle de langage, aucun
serveur.** Le jeu reste un site statique de quelques fichiers. Le directeur est
un jeu de règles, de pondérations et de probabilités appliqué à un contexte
local et à la graine du monde. Il tient en 368 lignes lisibles.

### `worldContext` — ce qu'un chunk sait de lui-même

Calculé **une fois, à la création du chunk**, jamais par image. Un
échantillonnage 3×3 caractérise une région sans la cartographier :

| Mesure | Ce qu'elle décrit |
| --- | --- |
| `altitude`, `pente` | relief moyen et dénivelé |
| `biome`, `rocaille` | nature dominante du sol |
| `clairiere`, `sec`, `noye` | dégagement, sécheresse, immersion |
| `fogGap`, `distance`, `elapsed` | état de la run |

### `WorldDirector.decide()` — la décision

Un seul appel par chunk créé, à la création. Rien de tout ceci ne tourne à
60 Hz.

Le point délicat est la **mémoire**. Un directeur qui se souvient de ce qu'il a
posé briserait l'invariant le plus important du projet : *la même graine
régénère le même monde*. Un joueur qui revient sur ses pas retrouverait un
monde différent, et la sauvegarde ne restituerait plus rien.

La solution est un **balayage déterministe du voisinage** : au lieu de se
souvenir, le directeur réévalue le tirage brut des 7×7 chunks alentour et
compte ce qui s'y trouve. Il obtient la même information qu'une mémoire, sans
en être une :

```js
let facteur = 1 + (vides / WORLD.videMax) * (WORLD.videBoost - 1);
if (occupes >= WORLD.tropPres) facteur *= WORLD.tropBaisse;
if (ctx.clairiere > 0.35) facteur *= 1.35;   // une clairière appelle un campement
if (ctx.pente > 5.5) facteur *= 0.45;        // on ne bâtit pas sur un versant
```

Le manque augmente la probabilité, l'excès l'écrase, le contexte oriente le
choix : une zone rocheuse et haute appelle une ruine, une clairière un
campement.

### Vérifié, pas supposé

`tests/world05.mjs` — 19 vérifications en Node pur, dont un balayage de
**500 chunks** :

| | Relevé sur 2 500 chunks |
| --- | --- |
| Cabanes | 42 |
| Camps | 38 |
| Ruines | 35 |
| Balises | 5 |
| Repères lointains | 26 |
| Nomades | 72 |
| Animaux | 1 609 |
| Oiseaux | 1 350 |
| Chunks vides | 54 % |
| Pire série vide **visible depuis l'axe** | 3 chunks |

Deux points méritent d'être signalés, parce qu'ils ont d'abord été mal mesurés.

**La série vide.** La première version comptait uniquement la colonne centrale.
Elle donnait 16 chunks vides d'affilée, ce qui est faux : le joueur voit ±2
chunks de part et d'autre. En comptant ce qui est réellement visible depuis
l'axe, le pire cas tombe à 3 chunks — environ 96 mètres sans rien, ce qui est
un silence, pas un désert.

**La correction de sécheresse.** La première version relevait la probabilité
partout : 80 % des chunks se peuplaient, le monde devenait un zoo. La seconde
plaçait le seuil à 38, jamais atteint, donc inerte. Il a fallu mesurer la
distribution réelle de `sansVie` — médiane 26, p90 31, maximum 38 — pour placer
le seuil à **30**, c'est-à-dire au-dessus de neuf régions sur dix.

**Déterminisme.** 400 chunks parcourus vers l'avant puis relus à l'envers :
**0 divergence**. La densité ne dérive pas non plus avec la distance : 53 % de
chunks vides au départ, 54 % après 500 chunks.

---

## 2. Le monde vivant — `living.mjs`

Trois règles écrites en tête du fichier, parce qu'elles ne sont pas
négociables.

1. **Aucune instanciation nulle part.** Voir §0.2.
2. **Les comportements ne tournent pas à 60 Hz.** 8 Hz de près, 1,5 Hz de loin,
   rien au-delà de 95 unités.
3. **Tout meurt avec son chunk.** Aucune entité ne survit à son déchargement.

### Un seul type de personnage : le Nomade

Pas de dialogue, pas de quête, pas de combat, pas d'inventaire, pas d'échange.
Il marche, il s'arrête, il fuit la brume. Il porte **la même écharpe rouge que
le joueur** : c'est le seul élément de récit du jeu, et il ne s'énonce pas.

### Deux familles animales

Terrestres et oiseaux. Pas de chasse, pas d'élevage, pas de chaîne alimentaire.
Les animaux fuient le joueur à 11 unités, les oiseaux s'envolent à 15. Les
premiers préfèrent le couvert, les seconds le dégagé.

### La fuite devant la brume

Tout ce qui vit fuit le mur, et le fait à des distances différentes : 26 unités
pour un animal, 55 pour un nomade — qui sait ce qui arrive. Rien ne naît à
moins de 30 unités du front.

C'est la narration environnementale la plus directe du jeu : la brume n'est pas
dangereuse parce qu'un compteur le dit, elle l'est parce que **tout le reste
s'enfuit devant elle**.

### Coût

Le gel au-delà de 95 unités existait déjà. Ce qui manquait : une entité gelée
n'était plus mise à jour mais **restait dessinée**, à une distance où le
brouillard de scène la rend indistincte. Elle est maintenant éteinte au même
seuil — donc rien ne peut bouger hors champ et réapparaître ailleurs.

---

## 3. Structures et abris

Quatre familles, chacune avec sa raison d'être. Les cabanes ont **trois
variantes** — intacte, abandonnée, détruite.

Un défaut de géométrie mérite d'être noté parce qu'il illustre la limite du
travail sans appareil : le toit des cabanes était **inversé**. Une rotation de
`+0.52` sur le pan situé en −Z faisait monter les bords extérieurs au lieu de
les faire descendre — la cabane ressemblait à une boîte en carton ouverte. Un
signe.

---

## 4. La ration — le seul soin du jeu

La brume est la seule chose qui retire des points de vie, et **rien ne les
rendait**. Un passage dedans grevait le reste de la run définitivement.

La ration ne pousse pas en terrain découvert. Son abondance latérale est nulle,
ce qui la retire de l'échantillonnage sans rien changer aux trois cloches
existantes — un poids nul ne déplace ni le total ni les proportions. On la
trouve dans **un abri sur trois**, ce qui donne enfin aux structures une raison
d'être visitées plutôt que contournées.

| | Ration | Cristal |
| --- | --- | --- |
| Poids | 6 kg | 5 kg |
| Effet | +34 points de vie | repousse le mur de 26 u |
| Valeur au score | 2 | 18 |

Se soigner, c'est renoncer à du butin. Elle est refusée à pleine santé : sinon
elle se gâche d'une mauvaise pression sur un bouton, et le joueur perd la seule
chose qui pouvait le sauver plus tard.

---

## 5. Modes de jeu — `modes.mjs`

Un seul mode est jouable : **NORMAL**. Les deux autres sont déclarés et
inaccessibles.

L'intérêt n'est pas d'avoir trois modes aujourd'hui. C'est que les règles
cessent d'être des constantes éparpillées. Le code de gameplay lit
`modeCourant()` en **cinq endroits** — vitesse de brume, dérive, dégâts,
densité des ressources, rareté du cristal — et **il n'existe aucun
`if (mode === ...)` dans le jeu**, ce que le brief interdisait explicitement.

Aucun multijoueur n'a été implémenté, ni préparé, ni esquissé.

---

## 6. Le menu de sac

Le brief demande un ralentissement fort, pas une pause. La différence n'est pas
cosmétique : un sac qui figerait la brume serait un abri gratuit, et le joueur
pourrait s'y réfugier indéfiniment.

`timeScale = 0.15` en NORMAL. Mesuré en navigateur, sac ouvert pendant une
seconde réelle :

| | Sac ouvert | Sac fermé |
| --- | --- | --- |
| Temps de jeu écoulé | 0,053 s | 0,43 s |
| Terrain gagné par la brume | 0,27 unité | — |

12 % du temps normal, et la brume **avance encore**. La caméra, le HUD et la
mesure de performance gardent le temps réel : l'interface doit rester vive même
au ralenti.

---

## 7. Interface modulaire — `ui.mjs`

Les positions et tailles des commandes ne sont plus écrites en dur dans la
feuille de style. Elles vivent dans une configuration et sont appliquées en
variables CSS. Déplacer le joystick, passer en **mode gaucher** ou changer
l'échelle du HUD devient un changement de données.

Le CSS conserve des valeurs de repli codées en dur : si ce module échouait,
l'écran resterait jouable.

---

## 8. `?worldtest` — contrôler ce que le monde contient vraiment

`?fogtest` mesure le coût de rendu. `?worldtest` mesure ce que le directeur a
réellement produit autour du joueur : images par seconde, appels de rendu,
triangles, géométries, tas JS, chunks, structures, repères, nomades, animaux,
oiseaux, entités vivantes, ressources.

Relevé typique en cours de partie :

```
27 fps   pire 40 ms
60 calls   11356 tris   45 géo   10.1 Mo JS
25 chunks   2 structures   0 repères
1 nomades   16 animaux   10 oiseaux
19 entités vivantes   53 ressources
```

Ces nombres sont obtenus par **parcours de la scène**, pas par un compteur tenu
à jour. Un compteur mesurerait ce que le code croit avoir posé ; un parcours
mesure ce qui est là. La différence entre les deux est précisément le genre de
défaut qu'un panneau de contrôle doit révéler — le §11 en donne un exemple
concret avec la fuite de ration.

Le relevé est pris deux fois par seconde, pas à chaque image : le parcours de
scène coûterait plus cher que ce qu'il mesure.

---

## 9. Performance — mesuré, à graine identique

Le monde vivant ajoute des structures, des cabanes à trois variantes, des
nomades, des animaux, des oiseaux et une quatrième ressource. La question
n'est pas rhétorique : combien cela coûte-t-il ?

**Protocole.** Même machine, même session, même graine (`770411`), même point
de départ, même parcours de 40 secondes en course continue vers l'avant, les
cinq premières secondes écartées (montée en régime). Deux relevés par version,
en alternance, jamais en parallèle — deux mesures simultanées se disputent le
processeur et l'écart mesuré n'est plus celui du code.

| | 0.5 Identity (`9457bbc`) | 0.5 Living World |
| --- | --- | --- |
| FPS (SwiftShader) | 14,7 · 16,2 | 14,6 · 15,5 |
| 95e centile d'image | 125 · 106 ms | 119 · 110 ms |
| Appels de rendu | 59 · 59 | 61 · 60 |
| Triangles | 11 008 · 11 008 | 11 104 · 11 258 |
| Géométries | 57 · 56 | 57 · 57 |
| Chunks actifs | 25 | 25 |

**Tout le monde vivant coûte environ deux appels de rendu et 2 % de temps
d'image.** Ce n'est pas de la chance, c'est le résultat de trois décisions :

1. **Géométrie fusionnée.** Une famille d'objets d'un chunk = un appel, quel
   que soit son nombre. Voir §0.2 : ce qui a été imposé par un défaut de GPU se
   trouve coûter exactement ce que l'instanciation coûtait.
2. **Décision à la création du chunk.** Le WorldDirector ne tourne pas par
   image. Il tourne 25 fois par traversée de monde.
3. **Extinction au-delà de 95 unités.** Une entité gelée ne consomme plus rien,
   ni calcul ni appel de rendu.

Contrainte du brief : **moins de 100 appels de rendu**. Mesuré entre 51 et 62
selon la graine et le relevé, dans toutes les suites. La marge est confortable.

> Répétons-le une dernière fois : **ces FPS viennent d'un rendu logiciel.** Le
> seul relevé de GPU réel qui existe pour la 0.5 est celui de l'appareil, en
> mode diagnostic : 60 FPS, 70 appels, 11 502 triangles. Les 45 FPS demandés par
> le brief ne peuvent être ni confirmés ni infirmés depuis cette machine. C'est
> à l'appareil de répondre.

---

## 10. Équilibrage — ce que la mesure dit

### Le cristal

Mesuré sur **6 393 poses**, 9 relevés (3 graines × 3 axes, 100 chunks chacun) :

| | Part du cristal dans les poses |
| --- | --- |
| 0.4 | 24,9 % |
| 0.5 Identity | 6,5 % |
| **0.5 Living World** | **4,4 %** (3,1 à 5,8 selon le relevé) |

Cible du brief : 3 à 6 %. Atteinte. Le contrôle continu est dans
`tests/balance05.mjs` et échoue hors de la fourchette.

### La pression de la brume

Le brief demande une accélération avec la durée de la run, **sans
rubber-banding visible et sans plafond artificiel**. Les deux exigences se
contredisent en apparence, et c'est ce qui rendait le réglage précédent
insatisfaisant.

- **Pas de rubber-banding** : la vitesse ne dépend que de `elapsed`. Vérifié en
  téléportant le joueur à 5 000 unités et en faisant passer sa marge de 4 à 900
  au même instant de run : la vitesse ne bouge pas.
- **Pas de plafond** : la 0.5 Identity atteignait `speed + speedGain` et n'y
  touchait plus. Un palier plat est un **régime stable** — une fois l'avance
  prise, elle ne se perd plus. C'est exactement ce que la run A a montré avec
  595 mètres d'avance.

Le correctif est une dérive lente au-delà de la rampe :

| Temps de run | 0 | 10 min | 30 min | 60 min |
| --- | --- | --- | --- | --- |
| Vitesse de la brume | 5,20 | 8,29 | 9,37 | 10,99 |

0,054 u/s par minute entre 15 et 30 minutes : imperceptible dans l'instant,
décisif sur vingt minutes. Le sprint (11,16 u/s) reste une échappatoire bien
au-delà de toute run plausible. `speedMax` existe encore mais n'est plus un
plafond de conception : c'est un garde-fou numérique qu'il faudrait deux heures
de jeu pour atteindre — un test le vérifie explicitement.

### Modèle de run

`tests/simulate05.mjs` branché sur la vraie configuration. **Ce n'est pas une
preuve que le jeu est intéressant** : un modèle n'hésite pas et ne se lasse pas.
Il sert à repérer un équilibre absurde.

| Profil | Durée | Distance | Ramassées | Jetées | Avance max |
| --- | --- | --- | --- | --- | --- |
| PRUDENT | 6,3 min | 2 209 m | 3 | 1 | 128 |
| NORMAL | 7,1 min | 2 272 m | 20 | 9 | 130 |
| GOURMAND | 4,8 min | 1 173 m | 35 | 19 | 112 |
| SPRINTER | 12,8 min | 5 211 m | 8 | 2 | **382** |

Trois profils sur quatre tiennent la fourchette de 3 à 8 minutes. Le profil
SPRINTER reste hors fourchette — c'est un joueur qui ne ramasse rien et court
sans arrêt, et le modèle ne sait pas se lasser. Son avance maximale est
toutefois passée de 450 à 382, et la dérive de pression garantit qu'elle finit
par se refermer.

Le profil NORMAL passe **57 % du temps en bande « tension » et 2 % en
« critique »**, 0 % en « avance ». C'est la répartition visée.

---

## 11. Tests

| Suite | Ce qu'elle vérifie | Vérifications |
| --- | --- | --- |
| `suite` | moteur, chunks, caméra, sauvegarde | 32 |
| `audit` | intégrité géométrique, fuites, caméra | 26 |
| `fog03` | boucle de jeu, ressources, brume, mort | 44 |
| `fog04` | densité, objets jetés, cycles longs | 47 |
| `regressions` | défauts déjà corrigés — dont B0 et l'écran noir | 28 |
| `balance05` | rareté, pression temporelle, bandes de marge | 36 |
| `world05` | distribution du directeur, déterminisme, 500 chunks | 19 |
| `ui05` | modes, disposition, sac, ration, `?worldtest` | 47 |
| | | **279** |

### Trois défauts que les tests ont attrapés dans cette session

Ils méritent d'être cités, parce qu'ils montrent ce que les suites servent
réellement à faire.

**Une sonde qui en écrasait une autre.** L'ajout de `HORIZON.jeu` avait d'abord
été écrit `HORIZON.game`, nom déjà pris par l'état de run. Douze vérifications
de `fog03` et `fog04` sont tombées d'un coup.

**Une fuite de ration.** `populateChunk` faisait `chunkResources.set(key, …)`,
écrasant le registre du chunk. La ration, posée juste avant par le moteur, y
devenait orpheline : encore comptée active, plus jamais listée, donc **jamais
libérée avec son chunk**. Le contrôle `ressourcesListees === ressourcesActives`
de `fog04` l'a désigné immédiatement. Le registre est désormais complété, pas
écrasé.

**Trois assertions qui décrivaient l'ancien monde.** `balance05` vérifiait le
plafond de brume de la 0.4. Elles ont été réécrites sur le comportement de 0.5
— non pas assouplies, mais **reformulées sur ce que la conception affirme
maintenant** : montée continue, dérive imperceptible, sprint encore viable,
garde-fou hors de portée. Une quatrième annonçait « cible 5 à 8 % » alors
qu'elle testait 4 à 9 : le message disait autre chose que l'assertion.

---

## 12. Ce qui n'a pas été fait, et pourquoi

- **Aucun ennemi, aucun combat.** Le brief l'interdit, et le jeu n'en a pas
  besoin : la brume est l'antagoniste.
- **Aucun multijoueur.**
- **Aucune IA distante, aucun appel réseau, aucun serveur, aucune API payante.**
- **ENDLESS et HARDCORE ne sont pas développés** — déclarés seulement.
- **Aucune validation utilisateur externe.** Personne d'extérieur au projet n'a
  joué à cette version.

---

## 13. Statut

**Pré-alpha interne.** Aucune des cinq questions de `CORE_TEST_RESULTS.md` n'a
de réponse, et personne d'extérieur au projet n'a joué à cette version. Les
deux runs enregistrées sont celles de l'auteur, sur une version qu'il a
lui-même commandée : elles orientent l'équilibrage et ne valident rien.

La seule validation qui compte pour cette version est celle de l'appareil. Deux
des trois défauts les plus importants corrigés ici — l'écran noir et la
récidive de B0 — ont été signalés depuis le téléphone, et le second a été
**isolé par l'utilisateur lui-même** avec les interrupteurs de `?diag`. Aucun
test automatisé de ce dépôt n'aurait pu le faire.
