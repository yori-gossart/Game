# Fog Nomad — Living World 0.5

Prototype de jeu mobile bâti sur le moteur **Horizon 0.2**. Un monde beau et
mourant, une brume qui le dévore derrière vous, et un sac qui vous ralentit
d'autant plus que vous avez été avide.

- Version courante — monde vivant, génération contextuelle, modes, sac,
  mesures : **`FOG_NOMAD_LIVING_WORLD_0.5.md`**
- Étape précédente — équilibre, pression, identité visuelle, narration :
  **`FOG_NOMAD_IDENTITY_TENSION_0.5.md`**
- Tranche verticale précédente : **`FOG_NOMAD_VERTICAL_SLICE_0.4.md`**
- Règles, paramètres, architecture et équilibrage d'origine : **`FOG_NOMAD_CORE_TEST_0.3.md`**
- Résultats de jeu réels : **`CORE_TEST_RESULTS.md`**
- Audit technique du moteur : **`AUDIT_PERFORMANCE_BUGS_0.2.md`**

## Le jeu

Un mur de brume descend l'axe Z à vitesse constante. Y rester coûte de la vie.

Trois ressources jonchent le monde : le **bois** est sur l'axe de fuite, la
**pierre** un peu de côté, le **cristal** nettement à l'écart. Plus une
ressource est précieuse, plus le détour est long — et la brume ne s'arrête pas
pendant ce temps.

Une quatrième existe, mais ne pousse nulle part : la **ration** se trouve dans
les abris, un sur trois. C'est le seul moyen de récupérer des points de vie.

Tout ce qu'on ramasse pèse, et le poids ralentit. Au-delà de 58 % de charge, la
brume gagne du terrain. On peut jeter un objet : il tombe au sol, et reste
ramassable tant que son chunk vit.

Deux usages, en plus du score :

| Action | Coût | Effet |
| --- | --- | --- |
| Impulsion de cristal | 1 cristal | repousse le mur de 26 unités |
| Feu de répit | 2 bois + 1 pierre | 18 s : brume à 16 % de sa vitesse, souffle rendu |
| Manger une ration | 1 ration (6 kg) | +34 points de vie, refusée à pleine santé |

La brume ne s'arrête jamais complètement.

### La pression monte avec le temps, jamais avec votre talent

La brume accélère au fil de la run — 5,2 u/s au départ, 8,3 au bout de dix
minutes, 9,4 à trente. Cette accélération ne dépend **que du temps écoulé** :
ni de votre position, ni de votre vitesse, ni de votre avance. Deux joueurs à
la même minute subissent la même brume.

Elle ne plafonne pas non plus. Un palier plat serait un régime stable, où
l'avance une fois prise ne se perdrait plus — c'est exactement ce qu'ont montré
les runs réelles de la version précédente, avec 595 unités d'avance. Passé la
rampe, la pression continue donc de dériver : 0,054 u/s par minute,
imperceptible dans l'instant, décisif sur vingt minutes.

C'est un choix, et il est testé plutôt que promis : la vitesse est relue après
avoir téléporté le joueur à 5 000 unités et fait passer sa marge de 4 à 900,
au même instant de run. Elle ne bouge pas. Le jeu ne peut pas donner
l'impression de tricher parce que vous jouez bien.

Passé dix minutes, la brume va plus vite que la marche à vide : tenir la
distance demande de sprinter, donc du souffle, donc un sac léger. Le sprint
reste une échappatoire bien au-delà de toute run plausible — la brume ne le
rattrape qu'après une heure.

### Un monde qui vit, et qui fuit

Des nomades marchent quelque part devant. Ils ne parlent pas, ne donnent pas de
quête, n'échangent rien — ils portent la même écharpe rouge que vous, et c'est
tout ce que le jeu dira jamais de qui vous êtes.

Des animaux paissent et s'écartent quand vous approchez ; des oiseaux
s'envolent. Tout ce qui vit fuit la brume, et à des distances différentes : un
animal détale à 26 unités du mur, un nomade à 55. Rien ne naît à moins de 30.

C'est la seule façon dont le jeu vous dit que la brume est dangereuse : **tout
le reste s'enfuit devant elle.**

### Un monde qui meurt derrière vous

Le ciel s'éclaircit devant et se referme derrière. À l'approche du mur, la
végétation se décolore et le sol vire au gris-prune : ce que vous laissez
derrière vous est perdu, pas seulement caché.

Quelques traces subsistent — un camp abandonné, une ruine, une balise qui
fonctionne encore sans qu'on sache pourquoi. Et parfois, à l'horizon, une arche
ou un arbre gigantesque qui donnent envie d'aller voir.

Le moteur reste celui décrit ci-dessous : un petit monde 3D procédural généré
par morceaux autour du joueur.

Aucun backend, aucun compte, aucune API externe : le jeu est un site statique de quelques fichiers.

## Le moteur (Horizon 0.2)

- direction artistique low-poly ;
- palette et biomes distincts, **fondus entre eux** au lieu d'être découpés au chunk ;
- eau ;
- soleil visible et profondeur atmosphérique ;
- personnage low-poly — manteau, capuche, écharpe — dont la démarche s'alourdit
  avec la charge ;
- sac à dos à cinq silhouettes : ce qui dépasse dit ce que vous portez ;
- ciel directionnel, mur de brume en quatre nappes à crête ondulée ;
- quatre familles de végétation, zones rocheuses, clairières, sols secs ;
- structures narratives rares et repères visibles de loin, placés par un
  **directeur de monde** qui lit le contexte du chunk (relief, pente,
  clairière, roche) et l'occupation du voisinage ;
- nomades, animaux terrestres et oiseaux, qui fuient le joueur et la brume ;
- contamination du monde à l'approche de la brume ;
- son synthétisé sans aucun fichier audio ;
- animation marche / course, et respiration à l'arrêt ;
- joystick tactile ;
- caméra orientable en glissant sur la partie droite de l'écran (rotation **et** inclinaison) ;
- terrain procédural en chunks ;
- création/destruction dynamique des chunks ;
- arbres, buissons, rochers et bouquets de fleurs procéduraux ;
- sauvegarde locale de la seed et des chunks découverts — la position n'est
  **pas** restaurée : elle remettrait la brume à distance de sécurité ;
- adaptation automatique de la résolution si les FPS baissent ;
- Three.js 0.185.1, servi depuis le dépôt (`vendor/three/`).

## Principe de performance

Le monde entier n'existe jamais comme géométrie active.

Seuls 5 × 5 chunks autour du joueur sont gardés en scène, soit 25 chunks. Lorsque le joueur change de zone, les nouveaux chunks sont générés et les chunks devenus trop éloignés sont retirés de la scène et leurs géométries libérées.

Trois choix portent l'essentiel du budget :

- **InstancedMesh, mais seulement pour trois familles.** Troncs, houppiers et rochers d'un même chunk tiennent chacun en un seul appel de rendu, quel que soit leur nombre. **Tout le reste est fusionné** en une géométrie unique par chunk — fleurs, bois mort, arbustes, herbes, blocs. Ce n'est pas une préférence esthétique : l'`InstancedMesh` corrompt le rendu sur le GPU mobile de test, en grands polygones noirs à arêtes franches (voir `AUDIT_PERFORMANCE_BUGS_0.2.md`, B0 et B0 bis). Le défaut a récidivé en 0.5 sur le bois mort, et a été isolé sur l'appareil via `?diag`. **Une nouvelle famille instanciée est un pari, pas une optimisation** : `tests/regressions.mjs` refuse toute famille instanciée hors des trois validées. Le coût de la fusion est identique — un appel de rendu par famille et par chunk.
- **Matériaux et géométries mutualisés.** Un seul matériau de terrain (la couleur de biome passe par les couleurs de sommets), un seul matériau de feuillage (la teinte passe par la couleur d'instance). Les géométries d'arbre et de rocher sont créées une fois pour tout le jeu ; celle de la fleur sert de patron recopié dans la géométrie fusionnée de chaque chunk.
- **Génération étalée.** Franchir une frontière de chunk demande jusqu'à 5 nouveaux chunks ; ils sont construits **un par image** via une file d'attente. Deux par image suffisaient en 0.4 ; un chunk de 0.5 coûte nettement plus cher (terrain en 16 segments, structures, monde vivant) et en construire deux produisait des à-coups visibles — 19 images au-dessus de 120 ms contre 7 en 0.4.
- **Le monde vivant ne tourne pas à 60 Hz.** Les comportements sont réévalués à 8 Hz de près, 1,5 Hz au-delà de 45 unités, et pas du tout au-delà de 95 — où les entités sont aussi retirées du rendu.

Ordre de grandeur mesuré en exploration, sur un rendu 412 × 915 : **50 à 60 appels de rendu, 8 200 à 12 800 triangles, aucune texture, 8 programmes de shader**.

La 0.4 tournait à ~60 FPS sur un Android réel pour ~9 000 triangles et 50 à 60
appels. La 0.5 utilise cette marge : plus de végétation, plus de relief, des
structures. Elle coûte 7 % de plus en rendu logiciel — ce qui ne présage pas du
comportement sur un vrai GPU, où le remplissage se paie différemment.

Deux points appris en mesurant la brume de la 0.4, valables partout ailleurs :

- un matériau **transparent et double face** est rendu en deux passes par
  Three.js, donc coûte deux appels de rendu par objet. `forceSinglePass: true`
  le ramène à un quand la géométrie ne se replie pas sur elle-même ;
- ce qui coûte cher dans un grand plan en fondu alpha n'est pas l'appel mais le
  **remplissage** : les nappes de brume masquées par une nappe opaque ont été
  raccourcies au niveau du sol, pour une image identique.

Si les FPS descendent sous 38, la densité de pixels est abaissée par paliers (1.35 → 1.15 → 1.0) avant toute réduction de la qualité visuelle ; elle remonte d'elle-même au-delà de 52 FPS. Le plancher est un pixel CSS : descendre en dessous rendait l'image visiblement en escalier sur les écrans à forte densité.

## Distance de vue et brouillard

Le terrain chargé couvre au minimum `CHUNK_RADIUS × CHUNK_SIZE` unités autour du joueur. Le brouillard doit devenir opaque **avant** cette limite, faute de quoi le bord du monde apparaît à l'horizon. `FOG_FAR` est donc dérivé de la taille des chunks plutôt que réglé à la main : en changeant `CHUNK_SIZE` ou `CHUNK_RADIUS`, le brouillard suit.

Le plan d'eau suit le joueur et dépasse la portée du brouillard, pour la même raison.

## Test

Le projet doit être servi via HTTP/HTTPS (c'est un module ES).

```bash
npx http-server -p 8123 -c-1 .
# puis http://127.0.0.1:8123/
```

Il est directement adapté à un hébergement statique Vercel : aucune étape de build.

### Sonde de diagnostic

Une fois la page chargée, `window.HORIZON` expose l'état courant depuis la console : `chunks`, `discovered`, `seed`, `pos`, `yaw`, `pitch`, `biome`, `queued`, `instances`, `kindVisibility`, `info` (appels de rendu, triangles, géométries), `objectsInScene`, `camPos`, `heapMB`, `depthBits` (capacités réelles du contexte WebGL) et `chunkKeys`.

Pour piloter sans les doigts : `move(x, y)`, `setRun(bool)`, `setYaw(v)`, `setPitch(v)`, `teleport(x, z)`, `setSeed(seed, x, z)`, `newWorld()`. Pour contrôler : `scanNonFinite()` cherche des NaN/Infinity dans toutes les géométries et matrices d'instance, `speckle()` mesure la proportion de pixels voisins discordants, `terrainAt(x, z)` donne l'altitude du terrain.

### Mode contrôle du monde

Ajouter `?worldtest` affiche un second panneau qui compte ce que le monde
contient réellement autour du joueur : images par seconde, appels de rendu,
triangles, géométries, tas JS, chunks, structures, repères, nomades, animaux,
oiseaux, ressources.

Ces nombres sont obtenus par **parcours de la scène**, pas par un compteur tenu
à jour. Un compteur mesurerait ce que le code croit avoir posé ; la différence
entre les deux est précisément ce qu'un panneau de contrôle doit révéler.

### Mode diagnostic

Ajouter `?diag` à l'URL affiche un bandeau donnant les capacités réelles du GPU (bits de profondeur, MSAA, précision, densité de pixels, nom du chipset) et permet de retirer une famille d'objets à la fois — terrain, troncs, houppiers, rochers, fleurs, eau, soleil — plus l'éclairage et le flou d'arrière-plan de l'interface. Un bouton fait aussi défiler trois rendus de fleurs (fusionné, instancié, un objet par fleur).

Depuis la 0.5, un interrupteur existe aussi pour chaque nouveauté susceptible
de mal se comporter sur un GPU mobile : contamination, ambiance de danger,
nappes de brume profondes, ciel, audio.

C'est cet outil qui a permis d'isoler un artefact d'affichage impossible à reproduire hors de l'appareil concerné. Sans le paramètre `?diag`, rien de tout cela n'est construit.

## Commandes

| Action | Tactile | Clavier |
| --- | --- | --- |
| Se déplacer | joystick, moitié gauche | flèches, ZQSD/WASD |
| Tourner / incliner la caméra | glisser sur la moitié droite | — |
| Courir (consomme du souffle) | bouton COURIR | Maj |
| Ramasser | automatique à proximité | — |
| Ouvrir le sac | bouton SAC | — |
| Jeter un objet | croix, dans le menu du sac | — |
| Manger une ration | bouton, dans le menu du sac | — |
| Nouveau monde | bouton NOUVEAU | — |

| Impulsion de cristal | bouton, visible seulement si un cristal est porté | — |
| Feu de répit | bouton, visible seulement si la matière est portée | — |

Le bandeau technique et le bouton NOUVEAU sont des outils de développement :
ils n'apparaissent qu'avec `?fogtest` ou `?diag`.

Les tests se lancent avec `node tests/<suite>.mjs` — voir `tests/README.md`.

| Suite | Ce qu'elle vérifie | Vérifications |
| --- | --- | --- |
| `suite` | moteur, chunks, caméra, sauvegarde | 32 |
| `audit` | intégrité géométrique, fuites, caméra | 26 |
| `fog03` | boucle de jeu, ressources, brume, mort | 43 |
| `fog04` | densité, objets jetés, cycles longs | 47 |
| `regressions` | défauts déjà corrigés — dont B0 et l'écran noir | 28 |
| `balance05` | rareté du cristal, pression temporelle, bandes | 36 |
| `world05` | distribution du directeur de monde, déterminisme | 19 |
| `ui05` | modes, disposition, menu de sac, ration, `?worldtest` | 47 |

`world05` tourne en Node pur, sans navigateur : il interroge le directeur sur
2 500 chunks et vérifie notamment qu'une même graine régénère exactement le même
monde parcouru à l'envers.

## Suite

Rien ne s'ajoute avant que le Core Test ait répondu à ses cinq questions dans
`CORE_TEST_RESULTS.md`. Si le compromis central ne fonctionne pas, aucune
fonctionnalité supplémentaire ne le fera fonctionner.

La 0.4 a levé trois obstacles qui empêchaient de poser ces questions
honnêtement : un monde qui se vidait, des objets jetés introuvables, des
ressources sans usage.

La 0.5 Identity & Tension en a levé deux autres : une menace qui avait cessé de
menacer, et un monde sans identité.

La 0.5 Living World en lève trois : un monde généré sans cohérence d'ensemble,
un monde inhabité, et un artefact d'affichage qui avait récidivé sur
l'appareil. Elle reste une **pré-alpha interne** — aucune des cinq questions
n'a encore de réponse, et **personne d'extérieur au projet n'a joué à cette
version**.
