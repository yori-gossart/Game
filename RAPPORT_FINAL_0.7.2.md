# FOG NOMAD 0.7.2 — ART & ATMOSPHERE PASS

| | |
| --- | --- |
| **BASELINE** | `3a7a0a4` |
| **BRANCHE** | `fog-nomad-art-atmosphere-0.7.2` |
| **DÉPLOIEMENT** | **PREVIEW UNIQUEMENT** |
| **AJOUTS DE JEU** | **aucun** — pas une mécanique, pas une ressource, pas un mode, pas une étape |

---

## CE QU'IL FALLAIT COMPRENDRE AVANT D'ÉCRIRE QUOI QUE CE SOIT

Trois passes d'art avaient déjà été livrées et jugées invisibles. Le code était
juste à chaque fois. Le défaut était toujours le même :

> **Une longueur d'onde calibrée pour une échelle que la caméra ne voit
> jamais.**

En portrait, le champ horizontal fait **≈ 14°**. On voit environ **15 unités**
de mur de brume à trente, **40 unités** de terrain devant soi, et du ciel
seulement entre **2° et 14°** d'élévation. La crête de brume de la 0.7 avait une
période de 40 u ; les bandes de ciel de la 0.7.1 étaient peintes entre 20° et
60° ; le relief du terrain avait des périodes de 30 u.

**Règle retenue : toute période visuelle entre 5 et 15 unités.**

`tests/captures.mjs` — six plans fixes, graine imposée — a été écrit **avant**
le premier changement. On capture, on modifie, on recapture, on compare. *Un
changement qui ne se voit sur aucune des six n'a pas eu lieu.*

---

## 0.7.2

| Élément | Verdict |
| --- | --- |
| PORTÉE DU MONDE | **PASS** — 64 → **96 u**. Le déblocage de toute la version |
| TERRAIN | **PASS** — relief à 11 et 7 u, plaques de teinte à 9 et 5 u |
| LUMIÈRE | **PASS** — soleil de 51° à **27°** d'élévation, ambiante ÷1,7 |
| CIEL | **PASS** — dégradé comprimé, lueur rasante, nuages entre 2° et 14° |
| BRUME — CRÊTE | **PASS** — quatrième échelle **redressée**, pointes à 13 u |
| BRUME — CONTACT AU SOL | **PASS** — bord dentelé, elle avale le sol |
| BRUME — MASSE | **PASS** — respiration EN PROFONDEUR, par nappe, périodes incommensurables |
| BRUME — RÉACTION AU PILIER (§14) | **PASS** — recul 40 → 150 u **animé sur 1,7 s**, aucun saut > 8 u |
| TOUR-BALISE | **PASS** — réécrite : socle, montants, échelle, plateforme, lanterne, section tombée |
| CAMP DU CONVOI (§32) | **PASS** — terre battue, ornières, pas, feu froid, trépied, caisses, roue, natte, linge, bannière |
| STÈLE ANCIENNE (§31) | **PASS** — palette, géométrie et lumière **entièrement disjointes** de la tour |
| COUVERT BAS (§35) | **PASS** — 8 touffes de 44 cm par chunk → une quarantaine à hauteur de cheville |
| AMBIANCE SONORE (§42-44) | **PASS** — vent, insectes, oiseaux, bourdonnement spatialisé par cristal |
| ANIMAUX (§37-41) | **PARTIEL — PROVISIONAL** — deux silhouettes au lieu d'une, elles broutent ; aucun modèle sous licence atteignable |
| NIVEAUX DE QUALITÉ (§59) | **PASS** — `?qualite=`, et **aucune mécanique n'en dépend** |
| BANCS D'OBSERVATION (§52-53) | **PASS** — `?art072`, `?lighttest` |
| MÉMOIRE (§60) | **PASS** — 8/8 |
| VENT VISUEL (§36) | **NON FAIT** — voir LIMITES |
| POST-TRAITEMENT (§47) | **NON FAIT** — voir LIMITES |

---

## LES SEPT DÉFAUTS TROUVÉS PAR LA CAPTURE, ET PAR ELLE SEULE

Aucun n'aurait été trouvé en relisant le code. Tous étaient du code correct qui
ne produisait pas ce qu'on croyait.

| Défaut | Ce qu'on voyait | Cause réelle |
| --- | --- | --- |
| La tour bâtie dans un lac | la balise à moitié immergée | scène à coordonnée fixe sur un relief décidé par la graine |
| La terre battue du camp **absente** | rien du tout | **enroulement des triangles inversé** : normale vers le bas, éliminée par le culling |
| Ornières en tronçons | des planches sombres discontinues | échantillonnées sur la *courbe* du terrain, pas sur son *maillage* rendu |
| Falaises brunes au camp | des pans de terre dressés | camp posé en travers d'un talus |
| Frange turquoise autour de la dalle | un liseré bleu-vert | `Color.lerp` **extrapole** quand `t` est négatif |
| Un pin de 7 m au milieu du camp | la moitié du cadre bouchée | rayon de dégagement trop court |
| Un conifère dans le coin de la **première image** | un aplat orange en bas à droite | la zone dégagée du réveil ne couvrait pas la place de la **caméra** |

Et un huitième, le plus embarrassant, qui n'était pas dans le jeu mais dans
l'instrument : **le banc photographiait un monde dégradé.** SwiftShader rend à
une dizaine d'images par seconde ; l'adaptation automatique de qualité, qui ne
sait pas qu'elle tourne en logiciel, descendait jusqu'à `facteurDecor()` à
**zéro** — aucune herbe, aucune fleur **construites**. Un banc qui mesure autre
chose que ce qu'on croit est pire que pas de banc.

---

## LE BANC DE PARCOURS JOUAIT UN MONDE DIFFÉRENT À CHAQUE PASSAGE

Le premier passage complet a échoué : parcours « normal » **mort** à z −1980,
1 feu, 11 étapes sur 15, là où la 0.7.1 avait mesuré 15/15 avec 3 feux.

En cherchant à attribuer la régression, il est apparu qu'**il n'y avait rien à
attribuer** : le banc chargeait la page sans graine, et le prologue tirait la
distance de maintien de la Brume à `Math.random()`.

Or tout le parcours se décide là. Le pilote allume son premier feu quand l'écart
passe sous 55 unités ; la Brume est tenue entre **52 et 60**.

- **Sous 55** : il allume à la onzième seconde. La boucle s'amorce — il brûle,
  se rallège, ramasse, rebrûle. 11 ramassages, 3 feux, il termine.
- **Au-dessus de 55** : il n'allume pas, reste léger, prend de l'avance. Quand
  la Brume accélère, il n'a plus de quoi faire qu'un feu. Il meurt.

Deux issues, un tirage de huit unités, la dixième seconde.

`?seed=` impose désormais la graine — elle l'emporte sur la sauvegarde — et le
prologue prend son tirage du moteur comme tout le reste du monde.

### La comparaison, une fois la graine imposée

Même graine, même pilote, même profil :

| | 0.7.1 (`3a7a0a4`, copie de référence) | 0.7.2 |
| --- | --- | --- |
| Durée | 10 min 53 s | **10 min 56 s** |
| Étapes | 15/15 | **15/15** |
| Ramassages | 11 | 10 |
| Feux | **3** | **3** |
| Marge min / moy / max | 53 / 97 / 150 | 53 / 107 / 159 |
| Sac max | 45 kg | 45 kg |
| Issue | termine | **termine** |
| Vérifications | 44 PASS / 0 FAIL | 44 PASS / 0 FAIL |

**Aucune régression de jeu.** La 0.7.2 se comporte comme la 0.7.1 sur le même
monde.

### Les trois parcours, à graine imposée

`PROFILS=normal,rapide,exploration GRAINE=20260912` — **48 PASS / 0 FAIL**.

| Profil | 0.7.1 (relevé d'époque) | 0.7.2, graine 20260912 |
| --- | --- | --- |
| **RAPIDE** | 10 min 13 s · 14/15 · 1 ramassage · **0 feu** · 38 kg | **10 min 13 s** · 14/15 · 1 · **0 feu** · 38 kg |
| **NORMAL** | 10 min 53 s · 15/15 · 11 · **3 feux** · 45 kg | **10 min 55 s** · 15/15 · 10 · **3 feux** · 45 kg |
| **EXPLORATION** | 12 min 3 s · 15/15 · 65 · **8 feux** · 60 kg | **12 min 1 s** · 15/15 · 52 · **8 feux** · 60 kg |

Marges min/moy/max, 0.7.2 : rapide 54/130/171, normal 53/107/159, exploration
52/91/159. Elles ne deviennent jamais confortables et ne tuent jamais.

Le §50 demandait de vérifier que les huit feux de l'exploration ne s'étaient pas
dégradés : **huit, inchangé.** Le parcours rapide reste à 14/15 parce qu'il
n'allume aucun feu et ne franchit donc pas `FIRST_FIRE` — comportement voulu,
pas défaut.

Et la reproductibilité, maintenant qu'elle existe : deux exécutions successives
du profil normal sur la même graine ont donné **655,5 s puis 655,4 s**.

---

## TESTS

| Suite | Résultat |
| --- | --- |
| `regressions.mjs` | **31/31** |
| `suite.mjs` | **32/32** |
| `audit.mjs` | **27/27** |
| `fog03.mjs` | **46/46** |
| `world05.mjs` | **19/19** |
| `prologue_negatifs.mjs` | **23/23** |
| `art072.mjs` *(nouveau)* | **30/30** |
| `memoire072.mjs` *(nouveau, §60)* | **8/8** |
| `prologue07.mjs`, trois parcours | **48/48** |

### Mémoire (§60)

Prologue monté puis démonté, trois kilomètres de traversée par sauts de
quatre-vingts unités, dix redémarrages :

| | départ | après traversée | après 10 redémarrages |
| --- | --- | --- | --- |
| Géométries | 111 | 156 (oscille 144-163, **aucune dérive**) | 125 |
| Textures | 10 | 10 | 10 |
| Objets en scène | 572 | 543 | 521 |
| Tas JS | 58 Mo | 45 Mo | 53 Mo |

### Faux PASS et fausses mesures corrigés

Quatre de mes propres assertions mesuraient mal. Les corriger valait mieux que
de les contourner :

- **la palette des deux structures** comparait aussi des matériaux à couleurs de
  sommet, dont le `color` blanc n'est qu'un multiplicateur : tout « partageait
  du blanc » ;
- **le rythme des deux lumières** était jugé sur une amplitude, qui dépend de
  l'endroit du cycle où l'échantillonnage tombe — 3,22 puis 0,70 pour la même
  lumière. On compte maintenant les extrema, ce qui est une fréquence ;
- **la hauteur d'une touffe** était lue sur la boîte du maillage FUSIONNÉ, donc
  sur le relief du chunk : 0,35 puis 0,06 pour la même herbe. On isole les
  sommets voisins d'un sommet — 0,89 et 0,94 sur deux passages ;
- **le recul de la Brume** était lu dès l'étape franchie, ce qui donnait la
  valeur finale tant que le mur se téléportait. Depuis qu'il recule sur 1,7 s,
  la lecture tombait au milieu du mouvement — 105 u pour un recul de 110.

Et une cinquième, dans `regressions.mjs`, qui n'était pas nouvelle : elle
attendait **850 ms d'horloge** pour laisser la caméra se poser. Le couvert bas
a alourdi la scène, 850 ms ne valent plus le même nombre d'images, et
l'assertion est redevenue intermittente. **C'est la cinquième fois que ce
projet apprend qu'on n'attend pas une horloge, on attend une condition.**

---

## LIMITES

### Ce qui reste prototype

**ANIMAL VISUALS : PROVISIONAL.** La recherche d'un pack d'animaux sous licence
vérifiable a été refaite, source par source. Mesuré, pas supposé :

| Source | Résultat |
| --- | --- |
| `kenney.nl`, `quaternius.com`, `poly.pizza`, `opengameart.org` | aucune réponse — politique réseau |
| `github.com/KayKit-Game-Assets` | **403** |
| `api.github.com`, lister les dépôts d'un auteur | *« sessions are bound to their configured repositories »* |

Il n'existe, dans cet environnement, **aucun chemin** pour lire une licence chez
son auteur. La règle du projet interdit d'utiliser un asset autrement. À défaut
de modèle, la silhouette a été travaillée : le monde n'était peuplé que d'une
seule géométrie clonée, il y a maintenant deux espèces, et les bêtes à l'arrêt
broutent au lieu d'être des statues.

### Ce qui n'a pas été fait, et pourquoi

- **§36, vent visuel** — faire onduler la végétation demande soit un shader de
  sommets sur les familles fusionnées, soit une transformation par touffe et
  par image. Le §55 interdit un shader plus complexe pour un résultat
  identique, et le §64 impose de retirer ce qui coûte sans se voir : une touffe
  de cheville qui ondule de trois centimètres à trente mètres ne se voit pas.
  Non fait, délibérément.
- **§47, post-traitement** — un `EffectComposer` ajoute une passe plein écran.
  Le poste le plus coûteux de ce jeu sur GPU mobile est déjà le remplissage
  (les nappes de brume translucides). Non tenté sans appareil pour le mesurer.
- **Instanciation** — rien n'a été instancié. Le jeu de familles validé sur
  appareil reste celui de la 0.4 (troncs, houppiers, rochers) ; tout ce que la
  0.7.2 ajoute passe par le chemin fusionné, celui qui n'a jamais produit les
  grands polygones noirs du Xclipse 530.

### Bloquant

**Aucun chiffre d'images par seconde de ce document ne transpose sur
l'appareil.** Toutes les mesures viennent de SwiftShader, un rendu logiciel à
une dizaine d'images par seconde. Les seules mesures rapportées sont celles qui
ne dépendent pas du rendu : appels de dessin, triangles, géométries, textures.
**La validation d'images par seconde appartient au Galaxy A55, donc à
l'utilisateur.**

---

## COÛT DE RENDU

Mesuré sur les six plans du banc de captures, graine 20260912, qualité imposée
haute. Ces chiffres-là ne dépendent pas du rendu et transposent donc, à la
différence des images par seconde.

| Plan | Appels | Triangles | Géométries |
| --- | --- | --- | --- |
| `1-reveil` | 110 | 26 493 | 107 |
| `2-brume-revelee` | 70 | 59 957 | 195 |
| `3-foret` | 77 | 40 293 | 73 |
| `3b-foret-brume-proche` | 77 | 40 293 | 73 |
| `4-camp` | 89 | 56 253 | 147 |
| `5-pilier` | 60 | 24 903 | 109 |

Le camp entier tient en **six appels de dessin** — un maillage par matériau —
et la stèle en deux. Le couvert bas coûte une cinquantaine de touffes par chunk
mais n'est **affiché que sur les neuf chunks voisins** : au-delà de quarante
mètres une touffe fait moins d'un pixel.

Le banc de parcours vérifie par ailleurs `calls < 140` en fin de prologue, dans
le monde procédural rendu à lui-même.

---

## DÉPLOIEMENT

| | |
| --- | --- |
| Branche poussée | `fog-nomad-art-atmosphere-0.7.2` |
| Commit | `044eef6` |
| Déploiement | `dpl_AZKHLQGzDMrh46GRJTppWQfiU9Uo` |
| **Cible** | **`null` — PREVIEW** |
| État | READY |
| **URL** | https://horizon-proto-git-fog-nomad-art-atmosphere-072-nutricyclev01a.vercel.app |

Vérifié en lisant l'API, pas déduit. **Et la page a été récupérée et lue** :
HTTP 200, `x-robots-tag: noindex`, les trois étiquettes annoncent 0.7.2, le
bloc du prologue est présent. C'est le contrôle de la 0.7.1 — on ne se contente
pas d'un déploiement READY, on regarde ce qu'il sert. Les trois seuls déploiements de cible
`production` du projet restent ceux de la 0.7, sur `claude/new-session-nrx5d6`,
inchangés. Aucune branche de production, aucun alias, aucun domaine, aucun
réglage de projet n'a été touché ; rien n'a été supprimé ; aucun projet Vercel
n'a été créé.

C'est ce contrôle qui manquait en 0.7 : le seul signe de l'incident avait été
un champ dans une réponse d'API que personne n'avait lu.

---

## LES DEUX CHOSES À RETENIR

**1. Un banc qui mesure autre chose que ce qu'on croit est pire que pas de
banc.** Le banc de captures photographiait un monde en qualité basse, où
l'herbe n'est même pas construite. Le banc de parcours jouait un monde
différent à chaque passage, et l'issue du parcours normal se décidait sur un
tirage de huit unités fait à la dixième seconde. Les deux ont été réparés
avant de conclure quoi que ce soit — et c'est seulement après que la
comparaison avec la 0.7.1 a pu dire quelque chose.

**2. Sept défauts de cette version étaient du code correct qui ne produisait
rien à l'écran.** Une nappe enroulée à l'envers, des ornières échantillonnées
sur la mauvaise surface, un lerp qui extrapole, un arbre devant la caméra. Pas
un seul n'était lisible dans le fichier. Tous l'étaient sur une capture.

---

## DOCUMENTS LIÉS

- `ART_DIRECTION_0.7.2.md` — ce que la caméra voit réellement, et la règle qui
  en découle
- `FOG_NOMAD_0.7.2_ART_ATMOSPHERE.md` — le détail de la passe
- `ASSET_LICENSES.md` — la vérification refaite, et son échec documenté
- `tests/README.md` — les deux règles apprises à la dure : graine imposée,
  qualité imposée
