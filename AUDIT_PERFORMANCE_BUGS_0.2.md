# AUDIT — HORIZON PROTO 0.2

Performance, stabilité et bugs. Audit réalisé sur le commit `e9e04ee`, corrections incluses.

**Environnement de test.** Chromium 1194 piloté par Playwright, émulation Pixel 7 (412 × 915, DPR 2,625, tactile), WebGL 2.0 via ANGLE/SwiftShader — **rendu logiciel**. Contexte obtenu : `DEPTH_BITS = 24`, `SAMPLES = 4`, `STENCIL_BITS = 0`.

Cette différence avec la cible est déterminante et conditionne la lecture de tout ce document : un téléphone Android fournit fréquemment un depth buffer **16 bits** et une précision fragment **mediump**. Les deux mécanismes les plus suspects dans le bug signalé dépendent précisément de ces deux paramètres, et **ne peuvent donc pas se manifester ici**.

---

## 1. Résumé exécutif

L'audit ne trouve **aucune fuite mémoire**, **aucune corruption de terrain**, **aucune valeur non finie**, **aucun trou ni recouvrement de chunk**, et **aucune erreur console**. La gestion des chunks est correcte, y compris en coordonnées négatives et sous sollicitation extrême (300 sauts de chunk enchaînés). 26 vérifications automatisées passent avant comme après correction.

> **Mise à jour — cause trouvée et corrigée, confirmée sur l'appareil.** L'artefact venait de l'**`InstancedMesh` des fleurs**. Il est corrigé : les fleurs d'un chunk sont désormais fusionnées en une seule géométrie non instanciée. L'utilisateur confirme la disparition des flashs. Voir **B0**.
>
> Ce résumé a d'abord conclu à une cause non identifiée, puis a désigné à tort un attribut `uv` superflu. Les deux versions étaient fausses. Les quatre défauts décrits plus bas restent réels et corrigés, mais **aucun n'était la cause de l'artefact**. Le raisonnement initial est laissé intact : il documente des pistes mesurées et fausses, ce qui fait partie du compte rendu.

Le sujet principal — la bande horizontale noire/jaune observée sur téléphone — **n'a pas pu être reproduite** dans cet environnement. Je l'écris sans détour : la cause n'est pas *démontrée*. En revanche, l'audit a identifié et mesuré **quatre défauts structurels réels** qui, réunis, expliquent le symptôme décrit, et dont trois dépendent exactement des paramètres matériels que cet environnement ne reproduit pas :

1. la précision du depth buffer est gaspillée par un `near` très bas, au point qu'un tampon 16 bits ne sépare plus l'eau du terrain sur une bande de 5 à 30 unités ;
2. le terrain et le plan d'eau sont quasi coplanaires sur les rives plates, sans départage explicite ;
3. les facettes sont reconstruites par dérivées d'écran dans le fragment shader, ce qui est instable en incidence rasante et en précision mediump ;
4. la résolution adaptative pouvait descendre à 0,85 pixel CSS et ne jamais remonter, soit 28 % de la résolution physique sur un écran DPR 3 — ce qui est très exactement une image « fortement pixelisée ».

Les quatre sont corrigés. Chacun est un défaut à part entière, justifiable indépendamment du bug signalé.

Deux bugs secondaires ont été trouvés et corrigés au passage, dont un franc : **le soleil n'était jamais rendu**, alors que le README annonce un « soleil visible ».

---

## 2. Bugs trouvés

### B0 — Artefact noir : `InstancedMesh` des fleurs · **P0 — cause réelle, corrigée**

**Symptôme.** Grands polygones noirs opaques à arêtes rectilignes, apparaissant et disparaissant plusieurs dizaines de fois par seconde pendant le déplacement. Observé sur Android, jamais en test.

**Ce que les captures ont établi.** Formes pleines, opaques, à arêtes franches — pas un moucheté entrelacé, donc **pas du z-fighting**. Indice décisif : les éléments d'interface portant un `backdrop-filter` virent au noir **uniquement là où la forme passe derrière eux** (une capture montre le HUD noir avec la forme en haut ; une autre, le HUD normal et le joystick noir avec la forme en bas), texte blanc intact. Le noir était donc de la géométrie 3D, l'interface ne faisant que la flouter.

**Reproduction : impossible dans cet environnement.** Sur la seed 423135 aux quatre positions relevées, puis sur 200 emplacements de la même seed : 0 instance à couleur nulle, 0 échelle ou position aberrante, 0 valeur non finie, 0 normale dégénérée, 0 triangle d'aire nulle. Les données côté JavaScript étaient saines de bout en bout. La corruption se produisait côté pilote, hors de portée d'un rasteriseur logiciel.

**Isolation sur l'appareil.** Faute de pouvoir reproduire, un mode diagnostic (`?diag`) a été livré à l'utilisateur : il retire une famille d'objets à la fois. Couper les **fleurs** supprimait l'artefact.

Un second tour a fait défiler cinq variantes de rendu des fleurs, chacune ne modifiant **qu'une seule propriété** :

| variante | ce qu'elle change | résultat sur l'appareil |
| --- | --- | --- |
| 0 actuel | référence : instancié, couleur d'instance, sphère | artefact |
| 1 sans couleur d'instance | un maillage par teinte | artefact |
| 2 tétraèdre | géométrie 12 sommets, sans pôles | artefact |
| 3 sans instanciation | un objet ordinaire par fleur | **plus d'artefact** |
| 4 taille ×3 | fleurs non sous-pixel | artefact |

**Cause.** L'`InstancedMesh` des fleurs, et lui seul. Ni la couleur d'instance, ni la géométrie, ni la taille n'y sont pour quelque chose : seule la suppression de l'instanciation y met fin. Les troncs, houppiers et rochers restent instanciés et n'ont jamais posé problème — ce qui rend le mécanisme sous-jacent d'autant plus opaque.

**Correction.** La variante 3 n'a pas été livrée telle quelle : un objet et un appel de rendu par fleur, soit jusqu'à ~126 appels supplémentaires, aurait échangé un défaut d'affichage contre un problème de performance. À la place, les fleurs d'un chunk sont **fusionnées en une seule géométrie** (`buildFlowerPatch`) : sommets écrits à leur position finale, teinte portée par les couleurs de sommets. Un appel de rendu par chunk, aucune instanciation, et exactement le même chemin de rendu que le terrain — qui fonctionne sur l'appareil. La géométrie fusionnée est propre au chunk et libérée avec lui.

**Validation.** `instancie: false` ; attributs `position+normal+color`, identiques au terrain ; les trois teintes préservées ; géométries GPU stables sur 100 chunks (17 → 16) ; objets de scène en baisse (146 → 128) ; 32/32 et 26/26 au vert ; aucune erreur console. **Et surtout : disparition des flashs confirmée par l'utilisateur sur l'appareil.**

**Ce qui reste inexpliqué.** *Pourquoi* l'instanciation des fleurs se corrompt sur ce GPU alors que celle des arbres et des rochers tient. Cinq hypothèses vérifiables ont été formulées et éliminées : précision du depth buffer, coplanarité eau/terrain, dérivées de `flatShading`, attribut `uv` superflu, normales dégénérées. Aucune n'était la bonne. La correction est validée par le comportement observé sur le matériel, **pas par un mécanisme démontré**, et ce document ne prétend pas le contraire.

**Ce que cet épisode enseigne.** Cinq hypothèses successives, toutes mesurables et argumentées, toutes fausses. Ce n'est pas le raisonnement à distance qui a résolu le bug, c'est la bissection sur le matériel qui reproduit. Pour un artefact spécifique à un appareil, livrer un outil de bissection à l'utilisateur vaut mieux que d'accumuler les théories — et il faut le faire tôt, pas en dernier recours.

---

### B1 — Précision de profondeur gaspillée · **P1**

**Symptôme.** Aucun sur desktop. Sur mobile 16 bits, l'eau et le terrain se disputent la profondeur sur une large bande horizontale.

**Cause.** `PerspectiveCamera(56, 1, 0.1, 122)`. La résolution du depth buffer varie en `d²·(far−near)/(2·far·near)`. Le `near` à 0,1 concentre la précision dans les 10 premiers centimètres, où il n'y a rien à afficher — la caméra est à 13 unités du joueur.

Résolution mesurée par le calcul, en unités monde :

| distance | 16 bits (mobile) | 24 bits (test) |
| --- | --- | --- |
| 20 u | 0,061 | 0,00024 |
| 40 u | **0,244** | 0,00095 |
| 62 u | **0,586** | 0,0023 |

Le facteur 256 entre les deux colonnes est la raison pour laquelle le défaut est invisible ici.

**Reproduction.** Sur un tampon 24 bits, `near = 0,000391` reproduit *exactement* la précision d'un 16 bits à `near = 0,1` (vérifié : 0,2439 u à 40 u contre 0,2439 attendu). Comparaison de framebuffer à résolution figée, même image :

```
actuel  vs  équivalent-16bits   pixels différents = 5,4490 %  (24847/455972)
actuel  vs  near0.5/far82       pixels différents = 1,1460 %  (5226/455972)
actuel  vs  actuel (contrôle)   pixels différents = 0,0000 %  (0/455972)
```

Le contrôle à 0,0000 % valide la méthode. **La perte de précision modifie 5,4 % de l'écran** — soit une zone large, pas quelques pixels de bord.

**Correction.** `CAMERA_NEAR = 0.5`, `CAMERA_FAR = FOG_FAR + 20` (82 au lieu de 122). `near` ne peut pas monter plus sans rogner un arbre que la caméra traverse.

**Validation.** Résolution 16 bits divisée par 5 : 0,244 → 0,0485 u à 40 u ; 0,586 → 0,117 u à 62 u.

---

### B2 — Facettes reconstruites par dérivées d'écran · **P1**

**Symptôme.** Scintillement d'éclairement sur les surfaces vues en rasant, sur GPU mobile.

**Cause.** Tous les matériaux utilisaient `flatShading: true`. Three.js implémente cette option dans le fragment shader :

```glsl
vec3 fdx = dFdx( vViewPosition );
vec3 fdy = dFdy( vViewPosition );
vec3 normal = normalize( cross( fdx, fdy ) );
```

Quand la surface approche l'incidence rasante, `fdx` et `fdy` deviennent colinéaires, la norme du produit vectoriel tend vers zéro, et `normalize` amplifie l'erreur relative. En `highp` (desktop) le résultat reste exploitable ; en `mediump` — 10 bits de mantisse, précision par défaut des fragment shaders sur nombre de GPU mobiles — la normale devient instable et l'éclairement bascule d'un pixel à l'autre. C'est un artefact connu, et il se manifeste par **bandes**, là où le terrain devient rasant, c'est-à-dire précisément devant le personnage.

**Reproduction.** Impossible ici : SwiftShader calcule en haute précision. Le mécanisme est établi par lecture du shader généré, pas par observation.

**Correction.** Fonction `faceted(geometry)` : dédouble les sommets (`toNonIndexed`) puis `computeVertexNormals()`, ce qui pose la normale de face sur chacun des trois sommets d'un triangle. Appliquée au terrain, aux troncs, houppiers, rochers, fleurs et à toutes les pièces du personnage. Tous les `flatShading` supprimés.

Le rendu est **strictement le même aspect facetté**, mais la normale vient de l'attribut au lieu d'être dérivée — donc insensible à la précision. C'est aussi un peu moins cher par fragment.

**Coût.** Terrain : 169 → 864 sommets par chunk. Avec `position + normal + color` et l'attribut `uv` supprimé (inutile, aucun matériau texturé), 31 Ko par chunk, 780 Ko pour les 25. Nombre de triangles inchangé.

**Validation.** Direction artistique préservée (captures avant/après), 26/26 vérifications au vert, aucune erreur console.

---

### B3 — Eau et terrain quasi coplanaires, sans départage · **P1**

**Symptôme.** Rive instable, contribue à la même bande que B1.

**Cause.** Le plan d'eau est à `y = −2,65`, plat, et traverse un terrain dont la pente à la ligne d'eau est faible. Mesuré sur 394 traversées échantillonnées du niveau d'eau :

- pente médiane : **0,0904 u/u**
- 10ᵉ centile : **0,0382 u/u**
- minimum : **0,00395 u/u**

Largeur de la bande où `|terrain − eau|` tient dans un pas de profondeur 16 bits :

| distance | pente médiane | rive douce (p10) |
| --- | --- | --- |
| 20 u | 1,35 u | 3,19 u |
| 40 u | 5,40 u | 12,78 u |
| 62 u | **12,97 u** | **30,70 u** |

Une bande de 13 à 31 unités vue en incidence rasante depuis une caméra à 7 unités de haut occupe une fraction importante de l'écran. L'ordre de la géométrie ne suffit pas à départager : c'est indéterminé.

**Correction.** `polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1` sur le matériau de l'eau. Le départage devient déterministe et va toujours dans le même sens — le terrain gagne, la rive est nette.

Ce n'est **pas** un masquage : le décalage ne cache rien, il lève l'ambiguïté à sa source. L'eau n'a été ni supprimée, ni déplacée, ni recolorée.

---

### B4 — Résolution adaptative : plancher trop bas, remontée inatteignable · **P1**

**Symptôme.** Image « fortement pixelisée ». C'est le seul terme du signalement qui trouve ici une explication directe et complète.

**Cause.** Deux défauts qui se composent :

1. `PIXEL_RATIO_STEPS = [1.35, 1.15, 1.0, 0.85]`. Le palier 0,85 rend **sous un pixel CSS**. Sur un téléphone à DPR 3, le rendu se fait à 0,85/3 = **28 % de la résolution physique linéaire**, puis le navigateur ré-agrandit. L'escalier est alors visible à l'œil nu, en particulier sur les arêtes à fort contraste comme la ligne d'eau.
2. La remontée exigeait `fps > 57` sur deux fenêtres. L'affichage plafonne à 60 Hz : un téléphone stabilisé entre 50 et 56 fps descendait d'un palier et **n'en remontait jamais**. L'état dégradé était donc absorbant.

**Reproduction.** Observé directement : l'audit avant correction se termine avec `pixelRatio = 0.85`, atteint et jamais quitté.

**Correction.** Plancher relevé à 1,0 (`[1.35, 1.15, 1.0]`) et seuil de remontée abaissé à 52.

**Validation.** L'audit après correction se termine à `pixelRatio = 1`.

**Contrepartie assumée.** À qualité d'image restaurée, on rend 38 % de pixels en plus. En rendu logiciel cela coûte 3,8 fps (voir §3/§4). Sur un GPU réel, une scène sans texture à 6 000 triangles n'est pas limitée par le fragment, et le compromis penche nettement du côté de l'image.

---

### B5 — Le soleil n'était jamais rendu · **P2**

**Symptôme.** Aucun soleil visible, alors que le README annonce « soleil visible et profondeur atmosphérique ».

**Cause.** Deux exclusions cumulées :

- distance depuis la caméra **128 u** pour un plan far à **122 u** : coupé par le clipping ;
- élévation **23,6°** alors que la caméra, entre `pitch` 0,12 et 0,98 et avec un demi-FOV vertical de 28°, ne regarde jamais au-dessus de **+21,1°**.

Autrement dit, même sans le clipping, il était hors champ à tous les angles atteignables.

**Correction.** Rapproché à 59,7 u (dans le volume visible), abaissé à ~11° d'élévation, taille apparente conservée (rayon 3,5 → 1,71, rapport rayon/distance constant), placé sur le **même azimut que la lumière directionnelle** pour rester cohérent, et il suit désormais le joueur en Y comme en X/Z — auparavant son altitude était absolue, si bien que sa hauteur apparente changeait selon le relief.

**Validation.** Capture `apres-soleil2.png` : disque visible en levant la caméra. À noter — mon premier test de validation par filtre de couleur a répondu « invisible » à tort : le tone mapping ACES décale la teinte rendue, le filtre était calé sur la couleur source.

---

### B6 — Allocations dans la boucle de rendu · **P2**

**Cause.** `new THREE.Vector3(...)` construit à chaque image pour la position caméra désirée, et `keyboardMovement()` retournant un objet littéral neuf à chaque image. Sur mobile, cela fait tourner le ramasse-miettes en continu.

**Correction.** Les deux objets sont hissés au niveau module et réutilisés.

**Validation.** Mesure avec `--expose-gc` et collecte forcée avant échantillonnage : **628 octets/image en course**. Le reliquat vient des chaînes du HUD (6 écritures/seconde, pas par image) et des allocations internes de Three.js.

---

### B7 — Ensemble `discovered` non borné en mémoire · **P2 — non corrigé, documenté**

La sauvegarde est plafonnée à 1500 clés (mesuré : 11,4 Ko, 0,15 ms par écriture — coût négligeable, vérifié, aucune correction nécessaire). Mais le `Set` en mémoire, lui, n'est pas plafonné : 1 574 entrées après ~150 chunks. Sur une session très longue, quelques dizaines de milliers de chaînes courtes, soit quelques centaines de Ko.

Non corrigé volontairement : plafonner le `Set` fausserait le compteur « découverts » affiché, ce qui est un choix de conception et non un correctif d'audit.

---

### B8 — Le joueur marche sur l'eau · **P2 — non corrigé, signalé**

`player.position.y = Math.max(ground, −2.45)` place le joueur au-dessus du plan d'eau (−2,65) partout où le terrain descend plus bas. Le personnage traverse donc les étendues d'eau à pied sec, en surface.

C'est une **décision de conception**, pas un bug de rendu, et la corriger (nage, blocage, enfoncement) relèverait du gameplay — hors périmètre d'un audit. Signalé pour arbitrage.

---

## 3. Performances avant correction

Rendu logiciel, exploration en course, 15 secondes :

| Mesure | Valeur |
| --- | --- |
| FPS moyen | 30,7 |
| FPS minimum | 11,3 |
| frame time moyen | 32,6 ms |
| p50 / p95 / max | 31,9 / 55,9 / 88,4 ms |
| draw calls | 18 |
| triangles | 2 824 |
| géométries | 21 |
| textures | 0 |
| programmes shader | 5 |
| chunks actifs | 25 |
| **pixelRatio atteint** | **0,85** (plancher, jamais quitté) |

## 4. Performances après correction

| Mesure | Valeur | Écart |
| --- | --- | --- |
| FPS moyen | 26,9 | −3,8 |
| FPS minimum | 10,9 | −0,4 |
| frame time moyen | 37,2 ms | +4,6 |
| p50 / p95 / max | 36,9 / 66,3 / 91,7 ms | — |
| draw calls | 33 | échantillon plus dense |
| triangles | 5 536 | échantillon plus dense |
| textures | 0 | = |
| programmes shader | 5 | = |
| **pixelRatio atteint** | **1,0** | **+38 % de pixels rendus** |

**Lecture.** La baisse de FPS est **entièrement imputable à la correction B4** : on rend 38 % de pixels en plus. En rendu logiciel, le coût est proportionnel au nombre de fragments, donc l'écart est attendu. Les écarts de draw calls et de triangles reflètent des positions et seeds différentes entre les deux campagnes, pas une régression : les deux séries oscillent dans les mêmes plages (18–34 appels, 2 800–6 700 triangles).

**Ces chiffres ne préjugent pas des performances sur Android.** Voir §10.

## 5. Analyse mémoire

Ressources échantillonnées au démarrage puis après 10, 25, 50 et 100 chunks parcourus.

**Avant correction**

| Étape | chunks | géométries | objets 3D | découverts | heap JS |
| --- | --- | --- | --- | --- | --- |
| départ | 25 | 16 | 138 | 25 | 5,53 Mo |
| 10 chunks | 25 | 17 | 147 | 73 | 6,39 Mo |
| 25 chunks | 25 | 19 | 121 | 268 | 6,70 Mo |
| 50 chunks | 25 | 17 | 145 | 691 | 10,73 Mo |
| 100 chunks | 25 | **17** | 151 | 1 540 | 41,68 Mo |

**Après correction**

| Étape | chunks | géométries | objets 3D | découverts | heap JS |
| --- | --- | --- | --- | --- | --- |
| départ | 25 | 17 | 148 | 25 | 8,89 Mo |
| 10 chunks | 25 | 18 | 137 | 73 | 12,71 Mo |
| 25 chunks | 25 | 18 | 143 | 268 | 18,33 Mo |
| 50 chunks | 25 | 17 | 128 | 691 | 17,95 Mo |
| 100 chunks | 25 | **17** | 145 | 1 540 | 37,21 Mo |

**Conclusion : aucune fuite GPU.** Le compteur de géométries est stable (16 → 17, puis 17 → 17) alors que 100 chunks ont été traversés et que plusieurs centaines de chunks ont été construits puis détruits. Les objets de scène oscillent autour de 140 sans tendance. Les chunks actifs ne dépassent jamais 25.

**Huit appuis successifs sur NOUVEAU** : géométries constantes à 11, programmes shader constants à 5, 8 seeds distinctes. Rien ne subsiste d'un monde à l'autre.

**Écouteurs d'événements** : tous enregistrés une seule fois à l'initialisation du module. `startNewWorld()` n'en ajoute aucun. Pas de multiplication possible.

**Sur le heap JS.** La croissance jusqu'à ~37–42 Mo est du **déchet de construction non encore collecté**, pas une fuite : le protocole de test téléporte le joueur 100 fois sur de longues distances, ce qui force la reconstruction complète des 25 chunks à chaque saut, soit ~2 500 constructions de chunk. En jeu normal, franchir une frontière n'en reconstruit que 5. La mesure isolée avec collecte forcée donne **628 o/image en course**, ce qui est sain.

## 6. Analyse chunks

| Vérification | Résultat |
| --- | --- |
| Continuité de `terrainHeight` aux frontières `X = n·32` et `Z = n·32` | discontinuité max **3,4 × 10⁻⁷** (précision flottante) |
| Chunks dupliqués | 0 |
| Grille pleine, sans trou | 25 chunks sur 5 × 5 |
| Valeurs non finies (NaN/Infinity) en scène | **0** sur toutes les géométries, matrices d'instance et positions |
| Aller-retour sur 25 chunks | terrain identique, **écart max exactement 0** |
| 300 sauts de chunk enchaînés | géométries 17 → 17, retour à 25 chunks |

**Arrondi en coordonnées négatives.** `Math.floor(x / 32)` est correct pour les quatre quadrants — c'est bien `Math.floor` et non une troncature, qui aurait fait collisionner les chunks 0 et −1 :

```
(1,1)→[0,0]   (1,−1)→[0,−1]   (−1,1)→[−1,0]   (−1,−1)→[−1,−1]
(−0.001,−0.001)→[−1,−1]   (−32,−32)→[−1,−1]   (−33,−33)→[−2,−2]   (31.999,31.999)→[0,0]
```

**Raccord géométrique.** Le chunk `cx` couvre `[cx·32, cx·32+32]`. Deux chunks voisins partagent exactement une arête ; les sommets de bord sont calculés depuis les mêmes coordonnées monde, donc à la même altitude. Ni trou, ni recouvrement.

## 7. Analyse rendu WebGL

| Élément | État |
| --- | --- |
| Contexte | WebGL 2.0, 24 bits de profondeur, 4 échantillons MSAA (environnement de test) |
| Textures | **0** — aucune bande passante texture |
| Programmes shader | **5**, constants sur 8 mondes |
| Draw calls | 18 à 34 selon la densité du biome |
| Triangles | 2 800 à 6 700 |
| Objets par chunk | 5 au maximum : terrain + troncs + houppiers + rochers + fleurs |
| Erreurs / warnings console | **aucun** |
| Perte de contexte WebGL | **NON MESURABLE** — non provoquable de façon fiable ici |
| Transparence | un seul objet transparent, le plan d'eau (2 triangles) |
| Frustum culling | actif ; les `InstancedMesh` exposent `boundingSphere`, donc culling par chunk correct |

## 8. Optimisations appliquées

1. `near` 0,1 → 0,5 et `far` 122 → 82 : précision de profondeur ×5 sur tampon 16 bits.
2. Normales de face portées par les sommets à la place de `flatShading` : supprime `dFdx`/`dFdy` du fragment shader, insensible à la précision, légèrement moins cher.
3. `polygonOffset` sur l'eau : départage déterministe eau/terrain.
4. Plancher de résolution relevé à 1,0 pixel CSS, seuil de remontée 57 → 52.
5. Suppression de l'attribut `uv` du terrain (aucun matériau texturé) : 7 Ko par chunk économisés, 173 Ko sur les 25, et l'attribut n'est plus dupliqué par le dédoublement des sommets.
6. Objets temporaires de la boucle de rendu réutilisés (`Vector3` caméra, vecteur clavier).
7. Soleil ramené dans le volume visible et solidaire du joueur en Y.

## 9. Optimisations rejetées, et pourquoi

| Rejetée | Raison |
| --- | --- |
| `logarithmicDepthBuffer` | Coût par fragment sur mobile, et inutile : le rapport `far/near` corrigé suffit largement pour une portée de 82 unités. |
| Instancing global inter-chunks | Le compteur est déjà à 18–34 draw calls. Gain nul, complexité du cycle de vie des chunks fortement accrue. |
| Réduire `CHUNK_SEGMENTS` | Aucun signe de limitation par la géométrie : 6 000 triangles, 0 texture. On dégraderait le relief pour rien. |
| Object pooling des chunks | Mesuré précédemment : les images qui construisent un chunk coûtent **32 ms contre 37 ms** pour les autres. Il n'y a pas d'à-coup à supprimer. |
| Supprimer l'eau | Explicitement écarté. Le problème est un départage de profondeur, pas la présence de l'eau. |
| Raccourcir le brouillard pour masquer la bande | Explicitement écarté : masquer un symptôme n'est pas corriger une cause. |
| Réduire la sauvegarde périodique | Mesurée avant de décider : 11,4 Ko et 0,15 ms par écriture, plafonnée. Rien à gagner. |
| Aligner l'élévation de la lumière sur celle du soleil | Changerait l'éclairement de toutes les faces, donc la direction artistique. Hors périmètre. |

## 10. Risques encore présents

1. **L'artefact noir est corrigé et confirmé sur l'appareil, mais son mécanisme reste inexpliqué** (voir B0). L'instanciation reste utilisée pour les troncs, houppiers et rochers, sans incident constaté — mais rien ne garantit qu'un autre GPU ne présentera pas le même défaut sur ces objets-là. Si cela arrivait, le mode `?diag` permet de l'isoler en quelques secondes, et la fusion par chunk employée pour les fleurs est directement transposable.
2. **Aucune mesure de FPS sur GPU réel.** Tous les chiffres viennent d'un rasteriseur logiciel et ne transposent pas. La performance mobile est **NON MESURABLE** ici.
3. **Multi-touch réel non testé.** Les contrôles sont validés par événements pointer synthétiques ; joystick et caméra simultanés sur un vrai écran restent à confirmer.
4. **Perte de contexte WebGL non testée**, et non gérée dans le code : aucun `webglcontextlost`/`restored`. Sur mise en veille prolongée ou pression mémoire, la page resterait figée. Risque réel, non corrigé (hors périmètre : c'est un ajout, pas un correctif).
5. **Croissance du heap sous téléportation intensive** (§5). Sans effet en jeu normal, mais le protocole de test montre que la construction de chunk produit du déchet ; à surveiller si la 0.3 augmente le rayon de chunks.
6. **`discovered` non borné en mémoire** (B7) et **joueur marchant sur l'eau** (B8) : signalés, non corrigés, en attente d'arbitrage.

---

## Annexe — Instrumentation

`window.HORIZON` expose l'état et les outils d'audit depuis la console :

`chunks`, `discovered`, `seed`, `pos`, `yaw`, `pitch`, `biome`, `queued`, `instances`, `info`, `objectsInScene`, `camPos`, `heapMB`, `depthBits`, `nearFar`, `waterY`, `chunkKeys`
`move()`, `setRun()`, `setYaw()`, `setPitch()`, `teleport()`, `newWorld()`, `setNearFar()`, `terrainAt()`, `timeSave()`
`scanNonFinite()` — cherche NaN/Infinity dans toutes les géométries et matrices d'instance
`speckle()` — proportion de pixels voisins discordants
`compareNearFar(a, b)` — compare deux réglages de profondeur sur la même image
`jitterTest(delta)` — instabilité sous micro-déplacement de caméra

---

## B0 bis — récidive en 0.5, sur une autre famille

La 0.5 a ajouté cinq familles instanciées sans que B0 soit relu. L'artefact
est revenu : grands polygones noirs à arêtes franches découpant le monde,
signature identique.

**Isolé sur l'appareil**, avec le nouvel interrupteur par famille du mode
`?diag` — Samsung Xclipse 530, ANGLE sur Vulkan 1.3.279, OpenGL ES 3.2 :
c'est le **bois mort**, et lui seul. L'instanciation restait active pour tout
le reste pendant le test, donc ce n'est pas l'instanciation en général.

**Les données JS sont saines**, comme pour les fleurs : 252 sommets, 0 triangle
dégénéré, 0 normale nulle, 0 valeur non finie, attributs `position+normal`
identiques aux familles qui fonctionnent. Le mécanisme reste **inexpliqué**,
exactement comme en 0.2.

Exposition mesurée, 25 chunks, même seed :

| | 0.4 (validée) | 0.5 (artefact) | 0.5 corrigée |
| --- | --- | --- | --- |
| InstancedMesh en scène | 59 | 92 | 50 |
| instances totales | 359 | 584 | 364 |
| familles à couleur d'instance | 1 | 3 | 1 |

**Règle retenue** : seules les trois familles instanciées validées sur appareil
en 0.4 — troncs, houppiers, rochers — le restent. Tout ce qui a été ajouté
depuis passe par le chemin fusionné. Ce n'est pas une préférence esthétique :
fusionner coûte le même nombre d'appels de rendu (mesuré : 45 contre 46 en
fusionnant absolument tout), et c'est le seul chemin qui n'ait jamais échoué
sur cet appareil.

Une non-régression l'impose désormais : toute famille instanciée hors de cette
liste fait échouer les tests.
