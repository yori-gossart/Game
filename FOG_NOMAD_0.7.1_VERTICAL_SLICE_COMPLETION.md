# FOG NOMAD 0.7.1 — ACHÈVEMENT DE LA TRANCHE VERTICALE

La 0.7 avait produit un prologue jouable de bout en bout. Elle n'était pas une
tranche verticale : le feu y était une respiration obligatoire, le sac se
remplissait tout seul, la Brume ne ressemblait à rien, et la version était
partie en production.

Ce document dit ce que la 0.7.1 change, ce qu'elle mesure, et ce qu'elle ne
règle pas.

L'incident de déploiement a son propre document : `DEPLOYMENT_RECOVERY_0.7.1.md`.

---

## 1. Le défaut central : quarante feux

Mesuré sur la 0.7, parcours normal : **40 feux en 11 min 30 s**, un toutes les
dix-sept secondes. Le feu avait cessé d'être un répit pour devenir une
respiration.

La cause n'était pas le feu. C'était le sac.

Les ressources jonchent l'axe de fuite — c'est le dessin du jeu depuis la 0.3 —
et elles entraient dans le sac **parce qu'on passait à côté**. Un parcours joué
d'un bout à l'autre arrivait à **96 kg sur 100** sans que le joueur ait décidé
de ramasser quoi que ce soit. À cette charge il marche à 2,9 u/s contre une
Brume à 7. Il ne survit qu'en brûlant.

Un joueur écrasé est un joueur lent, et un joueur lent brûle du bois pour
survivre. Les quarante feux étaient un symptôme.

---

## 2. La collecte devient un choix

Fog Nomad tient en une phrase : **« je choisis de prendre ce qui pourra
m'aider, et ce choix peut me ralentir. »** Le ramassage automatique retirait les
deux moitiés de la phrase — le choix, et donc la conséquence.

Depuis la 0.7.1, la proximité **arme** une cible et rien de plus. Un bouton la
prend, et il porte le nom de la ressource : le joueur doit pouvoir décider sans
s'arrêter, et « prendre » tout court ne lui dit pas s'il ramasse sept kilos de
bois ou treize de pierre.

Tout le reste est inchangé — durée de collecte, ralentissement pendant, anneau
de progression, abandon si l'on s'éloigne.

### Ce changement est GLOBAL, pas propre au prologue

Le §D3 demandait de trancher. C'est global, pour deux raisons.

La première est la cohérence : la mécanique de poids n'a de sens que si le poids
est choisi, et il n'y a aucune raison qu'elle change de nature au bout de douze
minutes.

La seconde est plus terre à terre : un ramassage volontaire dans le prologue et
automatique ensuite, ce sont deux chemins de code qui divergent, et c'est
exactement le genre de divergence qui produit un banc vert sur un jeu cassé.

Vérifié : trois secondes immobile sur une bûche ne ramassent rien, le bouton
apparaît étiqueté **BOIS**, et un appui la met dans le sac.

---

## 3. Le prologue a sa propre courbe de pression

La courbe de `fogSpeedAt()` est calibrée pour une **run**, dont le propos est de
finir par se terminer : 5,2 u/s au départ, 8,2 au bout de huit minutes — soit
au-dessus de la marche à vide, délibérément, sans quoi un joueur qui ne ramasse
rien ne serait jamais rattrapé.

Le propos du prologue est l'inverse. Sa Brume est donc calée sur la vitesse d'un
joueur léger qui va tout droit :

```
v(t) = 5,2 + 1,2 · min(1, t / 750)        →  5,2 à 6,4 u/s
```

Elle l'**accompagne** au lieu de le dépasser, et ce sont ses choix qui creusent
l'écart : chaque arrêt coûte 0,6 s à 32 % de vitesse, chaque détour coûte sa
distance, chaque kilo coûte de la vitesse.

`PROLOGUE_COMPLETE` rend la main à la courbe normale, sans transition. Le joueur
entre dans le vrai jeu avec la vraie pression — et le §C1 autorise explicitement
que celle-ci soit beaucoup plus agressive.

---

## 4. La leçon du feu, en trois temps

Le §C3 demande que le joueur découvre le bois, puis la pierre, et **seulement
ensuite** la recette. Trois répliques, chacune déclenchée par un fait, aucune
par une minuterie :

| Quand | Ce qui est dit |
| --- | --- |
| première ressource ramassée | *Du bois. Les gestes reviennent avant le reste.* |
| première pierre au sac | *Une pierre. Elle tient la chaleur.* |
| le feu devient possible | *Deux bois, une pierre. De quoi faire du feu.* |
| quatre secondes après le premier feu | *Le feu la retient. Pas longtemps.* |

La dernière arrive **après coup**, quand l'écart s'est déjà creusé sous les yeux
du joueur. Dire « ça marche » avant que ça se voie n'apprend rien.

Le kit de départ contient un bois, une pierre et une ration — **une bûche de
moins** que la recette. Le feu devient possible parce que le joueur a ramassé.

---

## 5. Ce qui a failli être mesuré à la place du jeu

Deux fois dans cette version, le banc a mesuré le banc.

**Cinquante et un feux.** Après avoir rendu la collecte volontaire, le premier
parcours en a compté 51 — pire que les 40 de la 0.7. La réserve visée du profil
normal pesait 54 kg, c'est-à-dire **au-dessus de son propre seuil de « trop
lourd »**, et le pilote gardait la clause « brûler pour s'alléger » héritée de
la 0.7. Il allumait donc un feu à la seconde où il en avait de quoi. Pas une
seule de ces flambées ne disait quoi que ce soit du jeu.

**L'ordre des étapes.** L'assertion exigeait les quinze points de contrôle dans
l'ordre du scénario. Mesuré : `FIRST_FIRE` à 367 s, `CONVOY_TRACE_FOUND` à
194 s. Ce n'est pas un défaut — un joueur dont la marge tient n'a aucune raison
d'allumer un feu avant d'arriver aux traces, et le §P dit que la chronologie
n'est pas un rail. L'assertion porte désormais sur la **colonne vertébrale**
(on ne prend pas son sac avant de se réveiller, on n'active pas le pilier avant
de l'avoir trouvé) et vérifie séparément que ressource → craft → feu se suivent.

---

## 6. Englouti n'est pas « plus vivant »

C'est le faux PASS le plus instructif du projet.

En 0.7, la vérification « le condamné a bien disparu » était **verte**. Elle
l'était parce que l'acteur finissait par sortir du champ et qu'une règle « trop
loin devant » mettait son drapeau `vivant` à faux. La Brume ne l'avait jamais
touché — elle ne le pouvait pas : il courait à 3,2 u/s devant un mur tenu en
place, et s'en éloignait.

Les deux états sont désormais distincts. `englouti` n'a qu'un seul chemin :
celui où le front l'a rejoint. Et le test négatif ne se contente pas du drapeau
— il relève l'**écart au front image par image** et exige qu'il diminue.

---

## 7. La Brume, enfin regardable

### Ce que la 0.7 laissait

Trois bandes horizontales de couleur unie, à bords parfaitement droits. Vérifié
en masquant tout le reste de la scène. Le code disait « mur à crête ondulée » et
ne mentait pas : la crête était calculée, et invisible.

| | |
| --- | --- |
| Champ horizontal, en portrait | ≈ 14° |
| Largeur de mur visible à 30 unités | ≈ 15 unités |
| Périodes des ondes de crête | 114 et 300 unités |
| Sommets du maillage | un toutes les 17,7 unités |

Sur quinze unités, une onde de période 114 est plate — et un maillage à un
sommet toutes les 17,7 unités ne pouvait de toute façon rien porter de plus
court. Le mur avait été sculpté pour être vu de loin et de face ; le joueur le
regarde toujours de près et par une meurtrière.

### Ce que la 0.7 avait essayé, et pourquoi ça n'avait rien donné

Une troisième onde de période 26 unités, à 20 % du poids, et 96 segments. Aucune
différence visible. **Ajouter ne suffisait pas** : l'amplitude de la crête est
une fraction de sa hauteur, et 20 % donnaient un frémissement de 0,6 unité —
noyé dans les cinq unités du dégradé alpha qui adoucit ce bord. Le correctif
avait été retiré : 3 900 triangles pour rien.

### Ce que fait la 0.7.1

**Répartir, pas ajouter.** Les trois périodes sont 300, 114 et **38** unités, et
c'est la courte qui porte le poids le plus fort (0,44 contre 0,26 et 0,30). Le
maillage passe à 112 segments — un sommet toutes les 4,1 unités.

**Resserrer le fondu.** `soft` tombe de 8 à 5,5 sur le corps et de 5 à 3,2 sur
l'avant-garde. Une crête qui bouge de trois unités demande un fondu plus court
qu'elle, sinon elle n'existe pas à l'écran.

**Donner de la profondeur.** C'est le vrai changement. Faire onduler la crête ne
suffit pas : vue d'en dessous, une nappe reste un plan, et un plan vu de face
est un rectangle quoi qu'on fasse de son bord supérieur. Chaque sommet est donc
reculé ou avancé en Z de quelques unités — 2,5 sur la nappe de fond, **9 sur
l'avant-garde**. Le front cesse d'être une ligne : par endroits la Brume déborde
vers le joueur, par d'autres elle creuse. **Coût : zéro triangle**, les sommets
existaient déjà.

**Assombrir la masse.** Après capture du plan de révélation : l'avant-garde
passait devant le corps sombre du mur et le lavait entièrement — la Brume se
lisait comme une nappe d'eau pâle. Son opacité et son liseré ont été baissés.
Elle doit être une masse sombre à liseré clair, pas l'inverse.

### Résultat, vérifié dans les mêmes conditions que le diagnostic

Les bords ne sont plus droits : deux crêtes courbes, déphasées, qui se croisent.
Le monde se **dissout** dans la Brume — les arbres passent de l'or au blanc
d'os puis disparaissent.

Verdict honnête : **nettement mieux, pas encore un mur qui fait peur.** Les
courbes restent de grandes arches douces plutôt que le front déchiqueté du §F4,
et la masse se lit comme un effacement du monde plutôt que comme une menace
solide. Le §F4 est donc **PARTIEL**.

---

## 8. La révélation : il fallait aussi baisser la caméra

Le §12 demande que la Brume soit révélée entre 40 et 60 mètres. En 0.7, la
caméra pivotait bien de 180° — mais elle gardait son inclinaison de jeu, 0,5, qui
la place haut et la fait regarder le sol devant le joueur.

Vérifié par capture au moment exact de la révélation : la Brume, à soixante
unités, tenait dans une bande de cent pixels tout en haut de l'image, sous une
pente d'herbe qui occupait les deux tiers du cadre. Elle était **visible**, ce
qui n'est pas la même chose qu'être **révélée**.

La caméra descend maintenant à 0,14 pendant ce plan — presque à hauteur
d'homme — et remonte quand le joueur reprend la main. Sur la capture d'après,
la Brume occupe la moitié du cadre et le personnage s'y découpe.

C'est la quatrième fois dans ce projet qu'un raisonnement de cadrage se trompe
et qu'une image tranche.

---

## 9. Le ciel : écrit, vérifié, RETIRÉ

Il était déjà un dégradé directionnel porté par des couleurs de sommets — pas
« une couleur de fond », contrairement à ce que le §36 craignait. Mais un
dégradé pur n'a aucune structure.

Des bandes nuageuses ont été écrites : dans le même attribut de couleur, sans
texture, avec un dôme passé de 32 × 14 à 48 × 20 segments. **Elles ne se voient
pas.** Vérifié trois fois, en isolant le dôme à l'écran :

| Essai | Résultat |
| --- | --- |
| amplitude 5,5 % | ciel parfaitement lisse |
| amplitude 17 % | ciel parfaitement lisse |
| enveloppe déplacée juste au-dessus de l'horizon | lisse encore |

Le troisième essai visait un diagnostic précis : l'inclinaison de caméra est
bornée à 0,12, donc la caméra regarde toujours un peu vers le bas, et la seule
portion de ciel jamais visible est une bande mince juste au-dessus de
l'horizon — là où la première enveloppe valait zéro. Corrigé, cela n'a rien
changé non plus.

**Tout a donc été retiré**, y compris les 1 024 triangles. On ne livre pas un
coût de rendu pour un changement qu'on ne voit pas : c'est exactement l'erreur
que la 0.7 avait commise sur la crête de la brume, et elle avait été retirée
pour la même raison.

Ce qu'il faudra regarder ensuite est consigné dans le code : la bande de ciel
réellement visible en portrait est très mince et largement recouverte par la
brume et la végétation lointaine. Il est possible qu'aucune structure portée
par le dôme ne puisse s'y voir, et que le §36 demande en réalité de travailler
la lumière et la profondeur atmosphérique plutôt que le ciel lui-même.

**Verdict : FAIBLE.** Rien de visible n'a été gagné.

---

## 10. Modes de mise au point

| Paramètre | Ce qu'il fait |
| --- | --- |
| `?prologuetest` | conduite du prologue : 15 étapes cliquables, chronomètre, marge et vitesse de Brume, poids, feux, ressource à portée, **état du condamné**, **distance aux traces et au pilier**, fps et appels de rendu |
| `?fogtest` | s'ajoute au panneau de performance : pose la Brume à 10, 30, 60 ou 140 unités, **retourne la caméra** — sans quoi le panneau proposerait de regarder ce qu'on ne peut pas voir — et **isole les nappes**, le geste même qui a établi que le mur était plat |
| `?introtest` | rejoue l'ouverture en boucle : le prologue redémarre quatre secondes après « FUIS » |
| `?sansprologue` | démarre directement dans le monde procédural |

Le panneau du prologue est **replié par défaut** : ouvert, il couvre le joystick
et les actions, et les deux coins bas de l'écran leur appartiennent.

---

## 11. Coût de rendu

Mesuré de la même façon sur les trois versions : Chromium en émulation Pixel 7,
rendu logiciel, six secondes de marche.

| | appels | triangles | géométries | textures | skinnés | objets |
| --- | --- | --- | --- | --- | --- | --- |
| 0.6a, monde | 57 | 44 847 | 73 | 3 | 6 | 360 |
| 0.7, monde | 37 | 14 289 | 52 | 3 | 6 | 314 |
| **0.7.1, monde** | **40** | **33 095** | **52** | **3** | **6** | **277** |
| 0.7, prologue | 59 | 16 087 | 58 | 3 | 6 | 366 |
| **0.7.1, prologue** | **70** | **43 117** | **78** | **3** | **6** | **382** |

**Ces totaux ne se comparent pas ligne à ligne, et il faut le dire.** Chaque
chargement tire une graine différente : le nombre de triangles dépend d'abord
de ce qui pousse autour du joueur, pas de la version. Un écart de 14 000 à
44 000 triangles entre deux relevés de la MÊME version est courant.

Ce qui est comparable, parce que calculé et non relevé, c'est ce que la 0.7.1
ajoute de façon déterministe :

| | avant | après | delta |
| --- | --- | --- | --- |
| Nappes de brume (4 × plan) | 26 × 7 | 112 × 8 | **+5 712 triangles** |
| Dôme de ciel | 32 × 14 | *inchangé* | **0** — voir §9, retiré |
| **Total** | | | **+5 712 triangles, 0 appel de rendu** |

Le relief de profondeur des nappes coûte **zéro** : il déplace des sommets qui
existaient déjà.

Sur un budget que le brief fixe entre 50 et 100 k triangles, +5 712 est
acceptable. Mais c'est une affirmation sur un budget, pas sur un téléphone.

**Les images par seconde relevées ici ne valent rien.** Le rendu est logiciel :
7 à 18 fps selon la version et la graine, ce qui ne prédit rien d'un GPU réel.
La cible est un Samsung Galaxy A55, et cette validation-là n'appartient qu'à
l'appareil.

### Si la Brume coûte trop cher sur l'appareil

`setFogDetail(false)` retire déjà les deux nappes de fond en qualité réduite —
elles ne portent que de la profondeur, jamais une information de jeu, et le mur
reste opaque et sa crête lisible. C'est **la moitié du coût de la brume** sans
toucher à sa lecture. Le mécanisme existait avant la 0.7.1 et n'a pas changé.

---

## 12. Ce qui n'est PAS fait

Il vaut mieux le dire que le maquiller.

| Sujet | État | Pourquoi |
| --- | --- | --- |
| §F4 front déchiqueté | **PARTIEL** | les crêtes sont courbes et déphasées, la profondeur casse le rectangle, mais le front reste fait de grandes arches douces |
| §I terrain local | **NON FAIT** | aucune passe locale sur le relief, le chemin, le sol autour des dix premières minutes |
| §J ciel | **RETIRÉ** | écrit, vérifié invisible trois fois, retiré avec son coût — voir §9 |
| §K tour-balise | **INCHANGÉE** depuis la 0.7 | elle raconte déjà la chute — quatre piliers en deux étages, un manquant, plateforme, cristal tournant, pilier couché, traînée de débris — mais elle n'a pas été retravaillée |
| §M animaux | **PROVISOIRE** | aucun pack CC0 d'animaux atteignable, voir `ASSET_LICENSES.md` |
| §N audio | **PARTIEL** | tout le paysage sonore demandé existe déjà et est synthétisé — voir ci-dessous — mais rien n'a été ajouté ni retravaillé en 0.7.1 |
| Rollback production | **NON EXÉCUTÉ** | aucun outil disponible, voir `DEPLOYMENT_RECOVERY_0.7.1.md` |

### L'audio, vérifié plutôt que supposé

Le §N demandait respiration de réveil, grondement de Brume, animaux, fuite, feu,
réaction du pilier. Vérification faite dans `audio.mjs` avant d'annoncer quoi
que ce soit : **tout existe déjà**, depuis la 0.5 pour l'essentiel et la 0.7
pour l'ouverture —

`reveil()` (acouphène, souffle, cœur) · `disparition()` (sec, coupé net,
volontairement ambigu) · `souvenir()` · `grondement` continu dont le volume ET
la fréquence suivent la marge de brume sur 150 unités · `pas()` · `collecte()` ·
`feu()` · `cristal()` · `jeter()` · `essouffle()` · `mort()`.

Aucun fichier audio externe, aucune licence à vérifier : tout est synthétisé
dans le navigateur.

Ce qui n'a pas été fait, c'est de le **retravailler**. La 0.7.1 n'a rien ajouté
à ce paysage sonore, et l'annoncer comme un chantier de cette version aurait été
malhonnête.

---

Les structures du §L, elles, sont bien **posées et visibles** : la tour, le camp
du convoi (banc, lanterne, clôture) et le pilier ancien sont dans la scène et
rencontrés en jouant, pas seulement chargés.
