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

## DOCUMENTS LIÉS

- `ART_DIRECTION_0.7.2.md` — ce que la caméra voit réellement, et la règle qui
  en découle
- `FOG_NOMAD_0.7.2_ART_ATMOSPHERE.md` — le détail de la passe
- `ASSET_LICENSES.md` — la vérification refaite, et son échec documenté
- `tests/README.md` — les deux règles apprises à la dure : graine imposée,
  qualité imposée
