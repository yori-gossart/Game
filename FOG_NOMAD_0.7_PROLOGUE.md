# FOG NOMAD 0.7 — LE PROLOGUE

Une ouverture mise en scène, posée sur le jeu existant, qui s'efface quand elle
a fini de dire ce qu'elle avait à dire.

---

## 1. Ce que le prologue raconte

Le joueur est un **éclaireur**. Il précède un convoi nomade qui fuit la Brume
depuis des générations. Son travail : reconnaître le terrain, atteindre les
tours, activer les balises, confirmer que le convoi peut passer.

Il a atteint sa tour. Il a activé la balise — le signal fonctionne encore,
c'est le premier objet qu'on voit à l'écran. Puis la terre a tremblé, la tour
l'a jeté au sol, il a perdu connaissance.

Le convoi n'a pas attendu. Il ne pouvait pas : la balise était activée, les
éclaireurs travaillent en relais, et on n'arrête pas un convoi quand la Brume
avance. Personne ne sait encore qu'il est resté derrière.

C'est tout. Il n'y a pas d'élu, pas de prophétie, pas de secret gardé pour le
chapitre trois. Un homme a fait son travail, la terre a tremblé, et il s'est
réveillé seul.

### Ce qu'il ne fait pas

**Il n'explique pas la Brume.** Ni ce qu'elle est, ni d'où elle vient, ni ce
qu'il y a dedans. Le doute est le sujet. La seule chose que le jeu en dise
jamais, c'est que **tout ce qui vit s'enfuit devant elle** — et le prologue le
montre au lieu de l'écrire.

**Il n'inflige pas d'amnésie de théâtre.** Le personnage sait ce qu'est un
arbre, une pierre, un feu ; ce sont ses gestes de métier, et ils reviennent
avant les souvenirs. Ce qui lui manque, ce sont les heures qui viennent de
passer. La première réplique du jeu est « Combien de temps… », pas « Où
suis-je ».

**Il ne bloque pas le joueur.** Le contrôle revient en moins d'une minute, et
chaque étape s'ouvre sur ce que le joueur **fait**, jamais sur une minuterie
qui l'attend. La seule exception est le réveil lui-même, qui dure 3,4 secondes.

---

## 2. Les quinze points de contrôle

Ce sont les étapes du scénario, et ce sont **aussi** les points de contrôle du
banc de test. Une étape franchie est un fait observable, pas une variable
interne : elle porte un horodatage, et le banc la relit après avoir joué.

| # | Étape | Ce qui la déclenche |
| --- | --- | --- |
| 1 | `PROLOGUE_START` | le décor est posé, l'écran est noir, le son commence |
| 2 | `PLAYER_WAKE` | la vision s'ouvre, le contrôle revient |
| 3 | `BAG_VISIBLE` | le personnage remarque son sac |
| 4 | `BAG_PICKED_UP` | le joueur appuie sur **PRENDRE** |
| 5 | `FOG_REVEALED` | la silhouette lente est rattrapée — ou 6,5 s se sont écoulées |
| 6 | `RUN_OBJECTIVE` | **FUIS**. La Brume est relâchée. |
| 7 | `FIRST_RESOURCE` | le joueur a ramassé quelque chose |
| 8 | `FIRST_CRAFT_AVAILABLE` | il a de quoi faire un feu |
| 9 | `FIRST_FIRE` | il en a fait un |
| 10 | `CONVOY_TRACE_FOUND` | il atteint les ornières |
| 11 | `MAIN_OBJECTIVE_REVEALED` | *Retrouver le convoi* ; le fragment de mémoire suit |
| 12 | `ANCIENT_STRUCTURE_FOUND` | il atteint le pilier |
| 13 | `CRYSTAL_INTERACTION` | il appuie sur **APPROCHER** |
| 14 | `FOG_REACTION` | la Brume recule |
| 15 | `PROLOGUE_COMPLETE` | il franchit la frontière ; la mise en scène se retire |

Les étapes 7 à 9 ne dépendent d'aucune distance : elles s'ouvrent sur ce que le
joueur fait. Les étapes 10 et 12 dépendent de la géographie. Les autres suivent
la mise en scène.

---

## 3. La géographie, et pourquoi elle a changé

Le prologue **pose** des objets à des coordonnées fixes autour du départ et
déclenche des acteurs à des distances décidées. Il ne touche ni au
`WorldDirector`, ni à la génération de chunks, ni au déterminisme par graine :
le monde procédural continue exactement comme avant, en dessous.

| Élément | Position | Quand il est posé |
| --- | --- | --- |
| Tour-balise | x −4,5 · z −26 | au démarrage |
| Sac au sol | x +2,2 · z −6 | au démarrage |
| Traces du convoi | z −1050 | **à 220 unités devant**, sur l'axe du joueur |
| Pilier ancien | z −2550 | **à 220 unités devant**, sur l'axe du joueur |
| Frontière de sortie | z −3100 | — |

Les distances ont été **mesurées avant d'être écrites**, et deux fois plutôt
qu'une :

| Longueur du prologue | Durée d'un parcours normal, joué |
| --- | --- |
| 760 u (première version) | 2 min 46 s, course continue, sans gestion du poids |
| 1 700 u | **6 min 23 s**, marche, feu répété, sac vidé |
| 3 100 u | visé 11 à 12 min, sur une vitesse effective mesurée de 4,43 u/s |

Pas davantage. Au-delà, la marche entre deux scènes cesse d'être de la tension
pour devenir du remplissage, et un prologue court et dense vaut mieux qu'un
prologue long et vide.

### Pourquoi les deux scènes lointaines sont posées tard

Elles l'étaient d'abord au démarrage, sur l'axe du réveil. Un parcours complet
a montré pourquoi c'est faux : après quatorze cents unités de fuite, avec des
détours vers les ressources, le joueur avait **dérivé latéralement** bien
au-delà des douze unités de portée du bouton **APPROCHER**.

`ANCIENT_STRUCTURE_FOUND` se déclenchait quand même — elle ne dépendait que de
la distance parcourue — puis plus rien. Le point culminant du prologue ne se
jouait pas, et le joueur passait à côté sans jamais savoir qu'il y avait
quelque chose.

Une scène qu'on manque de soixante mètres n'est pas mise en scène : elle est
décorative.

Deux corrections, et la seconde est la vraie :

1. les deux scènes sont posées **à 220 unités devant**, sur l'axe où le joueur
   se trouve réellement. C'est assez tôt pour qu'aucun chunk concerné n'existe
   encore — le rayon de streaming est de 64 unités — donc assez tôt pour que la
   végétation soit dégagée autour d'elles comme au départ. `ZONES_DEGAGEES` est
   pour cela une liste **mutable**, et le prologue y ajoute sa zone au moment
   où il pose sa scène ;
2. leurs points de contrôle se déclenchent à la **distance de la scène**, pas à
   la distance parcourue. Les deux se confondaient tant que tout était posé sur
   l'axe du réveil ; elles cessent de se confondre dès que le joueur dérive, et
   c'est alors la distance parcourue qui ment.

Le Z, lui, ne bouge pas : c'est le rythme du prologue, et il est mesuré.

### Le cadrage de la tour, réglé à l'image et non au raisonnement

La tour doit être dans la **première image**. Elle a bougé cinq fois avant d'y
être, et chaque essai a été jugé sur une capture d'écran :

`(−6,5 · +5)` → `(−9 · −3)` → `(−5 · −9)` → `(−7 · −17)` → `(−6 · −15)` →
**`(−4,5 · −26)`**.

Ce qui a fini par trancher est une mesure, pas une intuition : la caméra est
13 unités derrière le joueur avec un champ de 55°, ce qui donne une demi-largeur
d'environ **6,8 unités** au niveau du joueur. Une tour posée à x −9 tombait
simplement hors cadre, et aucun raisonnement sur « le dos gauche » ne pouvait
le rattraper.

Il a aussi fallu **dégager la végétation procédurale** autour des zones mises en
scène : `ZONES_DEGAGEES`, dans `main.mjs`, retire les arbres dans un rayon de 22
unités autour de la tour, 11 autour du réveil, 16 autour des traces, 18 autour
du pilier. Sans cela, un conifère de 7 mètres poussait devant la tour et
l'ouverture du jeu était un tronc.

---

## 4. La mise en scène, objet par objet

### La tour-balise

Assemblée de **pièces modulaires du décor**, pas de primitives grossières :
quatre `pillar` en deux étages, une plateforme hexagonale de pierre, une
couronne, un cristal de signal encore allumé avec sa lumière, un pilier couché,
et une traînée de débris qui dessine la trajectoire de la chute vers le point
de réveil.

Le pilier arrière-gauche du second étage **manque** : c'est lui qui raconte le
tremblement.

Une arche posée en couronnement avait été essayée d'abord. De profil, elle se
lisait comme un mur brun en travers de l'image. L'étagement de quatre piliers
est ce qui fait lire « tour » plutôt que « ruines ».

Le signal **tourne**, lentement. Dans une image immobile, un objet qui bouge est
le seul indice que le prologue s'autorise sans texte — et c'est lui qui attire
l'œil depuis le point de réveil.

### Le sac, au sol

Il n'est **pas** sur le dos au réveil, et c'est le premier fait de jeu que le
prologue établit : le personnage est arrivé ici sans rien. Trois boîtes de cuir,
posées de travers — tombées, pas déposées — et un halo très discret. Le §9
demande un signal, pas une fenêtre.

Ce qu'il contient est décidé au §7 ci-dessous.

### Les traces du convoi

Aucune pancarte. Des **ornières** parallèles orientées dans le sens de la
marche, un feu récemment éteint avec ses deux bûches, un banc abandonné, une
lanterne penchée, une clôture cassée, et un bout de tissu rouge — la couleur de
l'écharpe des éclaireurs.

Le joueur conclut lui-même. C'est la scène qui porte le plus de récit du
prologue, et elle ne contient pas une ligne de texte descriptif.

### Le pilier ancien

Il ne doit ressembler à **aucune** tour d'éclaireur. Là où la tour est faite de
piliers droits et d'une plateforme posée dessus — une construction qu'on
comprend —, celui-ci est monolithique, à six pans, **incliné**, sans joint
visible, gravé de trois anneaux à intervalles irréguliers, et son cristal est
**enchâssé dans la pierre** au lieu d'être suspendu.

Le §28 demande que la contradiction naisse de l'architecture. On ne dit donc
jamais « ceci n'est pas une balise d'éclaireur » comme un constat de jeu : le
personnage le pense, une fois, et l'objet le montre.

---

## 5. Ce qui fuit, et ce qui se fait rattraper

C'est la scène centrale. Quatre silhouettes traversent le champ de vision au
moment où le joueur relève la tête : deux animaux rapides, un nomade, et un
quatrième animal **qui court à 3,2 unités par seconde**.

La Brume avance à 5,2.

Il est rattrapé. Il s'efface dedans, il y a un son, puis le silence. **Aucun
corps, aucun monstre, aucune explication.** Le joueur comprend en une seconde
ce que « être rattrapé » veut dire, et c'est la seule fois du jeu où on le lui
montre au lieu de le lui faire subir.

Les silhouettes réutilisent les géométries de `living.mjs`. Deux apparences
différentes pour la même espèce serait le défaut le plus visible qui soit : un
animal du prologue et un animal du monde doivent être le même animal.

Ils fuient **la Brume**, pas le joueur. C'est ce qui en fait un signal plutôt
qu'une réaction.

---

## 6. L'interface : trois couches, aucune fenêtre

| Couche | Ce qu'elle porte | Combien de temps |
| --- | --- | --- |
| Réplique | une phrase du personnage, en bas | 2,4 à 5 s |
| Objectif | un bandeau en haut : *Récupérer son sac*, *Fuir la Brume*, *Retrouver le convoi* | tant qu'il est vrai |
| Action | un bouton unique — **PRENDRE**, **APPROCHER** | seulement à portée |

Aucune boîte de dialogue, aucun « appuyez pour continuer », aucun écran qui
s'interpose. Le bouton d'action apparaît quand on est à portée et disparaît
quand on s'éloigne : c'est la portée elle-même qui informe.

Pendant le réveil, `body.pro-fige` retire le joystick, les actions, la jauge de
brume et le sac. Ils reviennent tous ensemble, en une fois, quand le contrôle
revient.

---

## 7. Ce que le banc a trouvé, et qui n'aurait pas été trouvé autrement

Cette section est la plus utile du document. Les trois défauts ci-dessous ont
tous été trouvés en **jouant le prologue d'un bout à l'autre**, et aucun
n'aurait été trouvé en lisant l'état du jeu.

### 7.1 Le prologue ne se terminait jamais

`SCENE.fin` est un point, pas un nombre. La condition de sortie s'écrivait
`parcouru > -SCENE.fin` : `-SCENE.fin` vaut **`NaN`**, et `parcouru > NaN` est
faux à jamais.

Mesuré en parcours réel : joueur à z **−871** pour une frontière posée à −760,
`PROLOGUE_COMPLETE` jamais franchie, la mise en scène jamais démontée, le monde
procédural jamais rendu à lui-même.

Aucune vérification qui lit les étapes ne voit cela. Il faut aller jusqu'au
bout, et le seul moyen d'aller jusqu'au bout est d'y aller.

### 7.2 Le premier craft arrivait avant la première ressource

Le kit de départ valait `{ bois: 2, pierre: 1 }`. La recette du feu coûte
`{ bois: 2, pierre: 1 }`. Les deux étaient identiques, et
`FIRST_CRAFT_AVAILABLE` se déclenchait donc à la **14,5ᵉ seconde** — contre
37,5 s pour `FIRST_RESOURCE`. Les deux beats dans le désordre.

Le §22 demande que le monde enseigne. Il n'enseigne rien s'il donne la réponse
avant la question. Le kit part désormais **à un bois près** : le feu devient
possible parce que le joueur a ramassé, et l'ordre des étapes suit ce qu'il a
fait au lieu de le précéder.

### 7.3 Le poids tuait le joueur, et le prologue ne l'avait jamais dit

Le premier parcours complet est mort à z −344, **sac à 96 kg sur 100**.

Le pilote ne ramassait rien exprès. Les ressources jonchent l'axe de fuite —
c'est le dessin du jeu depuis la 0.3 — et le moteur les prend **tout seul**
quand on passe à côté. Marcher tout droit suffit à se charger jusqu'à ne plus
pouvoir courir, sans l'avoir jamais décidé.

Et le joueur n'a nulle part appris qu'on peut jeter : le bouton est un « × »
dans le sac, découvrable mais discret.

Ce n'est pas un défaut d'équilibrage. C'est **la leçon la plus importante du
jeu**, et le prologue la donnait implicitement, au moment où il est trop tard
pour l'apprendre. Une réplique est désormais dite **une fois**, à 50 % de
charge — pendant qu'il reste le temps d'agir, et avant les 58 % où la Brume
commence à gagner du terrain :

> Trop lourd. Il faut laisser quelque chose.

Et une découverte au passage, qui vaut pour le jeu entier : la boucle que Fog
Nomad propose n'est pas « ramasser puis porter » mais **« ramasser puis
brûler »**. Le feu coûte deux bois et une pierre — exactement ce que l'axe de
fuite fournit tout seul — et rend 18 secondes de Brume à 16 % de sa vitesse,
soit près de 80 unités de marge. Le bois qui pèse dans le dos vaut de l'avance
une fois posé au sol.

C'est mesuré : le parcours qui survit aux 1 700 unités a allumé **22 feux**. Le
parcours qui n'en allumait qu'un mourait à 1 141.

### 7.4 Le point culminant ne se jouait pas

Voir §3 ci-dessus, « Pourquoi les deux scènes lointaines sont posées tard ».
Le pilier ancien était posé au démarrage sur l'axe du réveil ; à quatorze cents
unités de là, le joueur avait dérivé hors de portée du bouton **APPROCHER** et
la scène ne se jouait jamais.

C'est le défaut le plus instructif des quatre : les quatorze premiers points de
contrôle passaient, la scène était bâtie, l'objet était dans la scène, et le
joueur ne l'a jamais vu.

---

## 8. Le banc automatique

`tests/prologue07.mjs` ne regarde pas des variables : il **joue**.

Un pilote installé dans la page tient le joystick image par image, convertit une
direction monde en commande de joystick — `move()` est exprimé dans le repère de
la caméra, et la caméra tourne —, se dirige vers le sac, appuie sur les boutons
quand ils apparaissent, se détourne vers les ressources, vide son sac quand il
devient lourd, allume un feu, et court quand la marge se resserre.

Il ne saute **aucune** étape. `sauterA()` existe et serait beaucoup plus
rapide ; il ne prouverait rien. La question posée par le §30 n'est pas « les
étapes existent-elles » mais « combien de temps met-on à les traverser », et une
étape sautée ne dure rien.

**Le temps mesuré est du temps de jeu.** Sous rendu logiciel, `delta` est
plafonné à 40 ms et le temps de jeu avance moins vite que la montre : une durée
chronométrée mesurerait la machine de test. C'est une règle apprise trois fois
dans ce projet.

---

## 9. Le panneau `?prologuetest`

Le prologue dure une dizaine de minutes et ses étapes ne s'atteignent que dans
l'ordre. Vérifier la douzième en la jouant coûte onze étapes à chaque essai —
et c'est ainsi qu'on finit par ne plus la vérifier du tout.

Le panneau donne trois choses, et rien d'autre : ce que le prologue croit, un
moyen d'aller directement à une étape, et un moyen de le refaire.

Il **ne contourne rien**. Un saut franchit réellement toutes les étapes
intermédiaires, avec leurs effets : le sac est ramassé, la Brume est relâchée,
l'objectif est posé. Un saut qui se contenterait d'écrire un nom d'étape
mentirait sur l'état du jeu — et le premier défaut qu'il masquerait serait
exactement celui qu'on cherchait.

Il est **repliable**, et replié par défaut. Le panneau complet couvre le
joystick et les boutons d'action : les deux coins bas de l'écran leur
appartiennent, et il n'y a pas de troisième coin. Un panneau de test qui
empêche de jouer ne sert à rien — c'est très exactement le défaut de la 0.6, où
le banc s'affichait sous l'écran de chargement et où personne ne s'en est
aperçu avant l'appareil.

---

## 10. La sortie

Passé la frontière, le prologue se retire : les quatre objets mis en scène sont
retirés de la scène et leurs géométries libérées, les acteurs disparaissent, le
bandeau d'objectif et les répliques s'effacent.

**Rien n'est réinitialisé.** L'inventaire, le poids, la santé, le souffle, la
position de la Brume, la graine du monde : tout continue. Il n'y a ni écran de
chargement, ni coupure, ni fondu, parce qu'il n'y a rien à charger — le monde
procédural tournait dessous depuis la première image.

Le vrai critère de réussite de cette transition est négatif : **le joueur ne
doit pas pouvoir dire à quel instant le prologue s'est arrêté.** S'il existe un
moment identifiable où « le jeu commence », elle a raté.

---

## 11. Aucun asset externe ajouté

Une version qui met en scène une tour-balise, un pilier ancien, des ornières de
convoi et deux cristaux lumineux est exactement le genre de version où un modèle
non vérifié se glisse « juste pour cette scène ». Il n'y en a aucun : tout est
soit une pièce **déjà présente** des packs KayKit, soit une géométrie écrite
dans `prologue.mjs`, soit une géométrie de `living.mjs`.

Le détail est dans `ASSET_LICENSES.md`, §4, avec la commande qui le vérifie.
