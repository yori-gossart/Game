# Horizon Proto 0.2

Deuxième prototype mobile de **Horizon**, un petit monde 3D procédural qui est généré par morceaux autour du joueur.

Aucun backend, aucun compte, aucune API externe : le jeu est un site statique de quelques fichiers.

## Contenu de la 0.2

- direction artistique low-poly ;
- palette et biomes distincts, **fondus entre eux** au lieu d'être découpés au chunk ;
- eau ;
- soleil visible et profondeur atmosphérique ;
- personnage avec sac à dos ;
- animation marche / course, et respiration à l'arrêt ;
- joystick tactile ;
- caméra orientable en glissant sur la partie droite de l'écran (rotation **et** inclinaison) ;
- terrain procédural en chunks ;
- création/destruction dynamique des chunks ;
- arbres, buissons, rochers et bouquets de fleurs procéduraux ;
- sauvegarde locale de la seed, de la position, de l'orientation caméra et des chunks découverts ;
- adaptation automatique de la résolution si les FPS baissent ;
- Three.js 0.185.1, servi depuis le dépôt (`vendor/three/`).

## Principe de performance

Le monde entier n'existe jamais comme géométrie active.

Seuls 5 × 5 chunks autour du joueur sont gardés en scène, soit 25 chunks. Lorsque le joueur change de zone, les nouveaux chunks sont générés et les chunks devenus trop éloignés sont retirés de la scène et leurs géométries libérées.

Trois choix portent l'essentiel du budget :

- **InstancedMesh par chunk.** Troncs, houppiers et rochers d'un même chunk tiennent chacun en un seul appel de rendu, quel que soit leur nombre. Les fleurs, elles, sont **fusionnées** en une géométrie unique par chunk : leur `InstancedMesh` corrompait le rendu sur certains GPU mobiles (voir `AUDIT_PERFORMANCE_BUGS_0.2.md`, B0). Un chunk coûte donc au plus 5 objets de scène.
- **Matériaux et géométries mutualisés.** Un seul matériau de terrain (la couleur de biome passe par les couleurs de sommets), un seul matériau de feuillage (la teinte passe par la couleur d'instance). Les géométries d'arbre et de rocher sont créées une fois pour tout le jeu ; celle de la fleur sert de patron recopié dans la géométrie fusionnée de chaque chunk.
- **Génération étalée.** Franchir une frontière de chunk demande jusqu'à 5 nouveaux chunks ; ils sont construits deux par image via une file d'attente, ce qui évite l'à-coup.

Ordre de grandeur mesuré en exploration, sur un rendu 412 × 915 : **20 à 35 appels de rendu, 3 000 à 7 000 triangles, aucune texture, 5 programmes de shader**.

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

### Mode diagnostic

Ajouter `?diag` à l'URL affiche un bandeau donnant les capacités réelles du GPU (bits de profondeur, MSAA, précision, densité de pixels, nom du chipset) et permet de retirer une famille d'objets à la fois — terrain, troncs, houppiers, rochers, fleurs, eau, soleil — plus l'éclairage et le flou d'arrière-plan de l'interface. Un bouton fait aussi défiler trois rendus de fleurs (fusionné, instancié, un objet par fleur).

C'est cet outil qui a permis d'isoler un artefact d'affichage impossible à reproduire hors de l'appareil concerné. Sans le paramètre `?diag`, rien de tout cela n'est construit.

## Commandes

| Action | Tactile | Clavier |
| --- | --- | --- |
| Se déplacer | joystick, moitié gauche | flèches, ZQSD/WASD |
| Tourner / incliner la caméra | glisser sur la moitié droite | — |
| Courir | bouton COURIR | Maj |
| Nouveau monde | bouton NOUVEAU | — |

## Objectif de la prochaine version

La 0.3 ne devrait pas simplement ajouter plus de décor.

Priorité suggérée :
1. premier PNJ autonome ;
2. besoins/états simples ;
3. interaction joueur-PNJ ;
4. persistance d'une modification apportée à un chunk ;
5. premier objectif de jeu.
