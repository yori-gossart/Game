# PLAN DE TEST DU PROLOGUE — 0.7

Ce document sert à **une** chose : permettre à quelqu'un qui n'a pas écrit le
prologue de décider s'il est bon, sur son téléphone, en une session.

Il est écrit après le constat de la 0.6 : une version peut passer trois cents
vérifications automatiques et être rejetée en trente secondes sur l'appareil,
parce que le sac était accroché au visage et que le personnage marchait à
reculons. Les tests regardaient des nombres cohérents entre eux. Personne ne
regardait l'écran.

Donc : **tout ce qui suit se juge à l'œil, sur un vrai téléphone.** Le banc
automatique n'y remplace rien ; il n'est là que pour attraper les régressions
entre deux séances.

---

## 0. Ce dont on a besoin

| | |
| --- | --- |
| Appareil | un téléphone Android ou iOS réel — **pas** un émulateur |
| Adresse | l'URL de prévisualisation, sans paramètre |
| Durée | environ 35 minutes pour le plan complet |
| À noter | tout ce qui surprend, même sans savoir pourquoi |

Trois paramètres d'URL existent, et servent à des choses différentes :

| Paramètre | Ce qu'il fait |
| --- | --- |
| *(aucun)* | le jeu tel qu'un joueur le reçoit — **c'est le test principal** |
| `?prologuetest` | ajoute le panneau de conduite : état, sauts d'étape, relance |
| `?sansprologue` | démarre directement dans le monde procédural |

---

## 1. Les trente premières secondes

C'est le seul moment qu'on ne rejoue pas. Il se juge une fois, et l'impression
qu'il laisse ne se corrige plus ensuite.

**Ouvrir la page et ne rien faire.** Ne pas toucher l'écran.

| # | À vérifier | Attendu |
| --- | --- | --- |
| 1.1 | Le premier instant | l'écran est **noir**, et il y a du **son** avant qu'il y ait une image |
| 1.2 | L'ouverture | la vision revient **depuis le centre**, pas par un fondu uniforme |
| 1.3 | Ce qu'on voit d'abord | la **tour-balise**, entière, dans le cadre — pas coupée, pas hors champ |
| 1.4 | Le signal | un cristal **tourne** en haut de la tour ; c'est la seule chose qui bouge |
| 1.5 | Les dégâts | un pilier est **couché**, des débris tracent une ligne vers le joueur |
| 1.6 | Le sac | il est **par terre**, devant, faiblement lumineux — **pas sur le dos** |
| 1.7 | Les commandes | le joystick est **absent** tant que le personnage n'a pas repris ses esprits |
| 1.8 | Le retour du contrôle | il revient **en moins d'une minute**, sans qu'on ait rien à faire |

> **Question à se poser, et à noter :** en regardant cette première image,
> est-ce qu'on comprend qu'il s'est passé quelque chose ici ? Sans lire une
> seule ligne de texte ?

---

## 2. Le sac

| # | À vérifier | Attendu |
| --- | --- | --- |
| 2.1 | L'objectif | un bandeau annonce **Récupérer son sac** |
| 2.2 | Le chemin | on trouve le sac **sans avoir à chercher** |
| 2.3 | Le bouton | **PRENDRE** apparaît en approchant, et disparaît en s'éloignant |
| 2.4 | Après | le sac **est sur le dos du personnage**, à sa place, pas sur sa tête |
| 2.5 | L'inventaire | ouvrir le sac : il contient **1 bois, 1 pierre, 1 ration** |
| 2.6 | Le feu | à cet instant, le feu n'est **pas encore** possible — il manque un bois |

> **2.6 est délibéré.** Un sac qui contient déjà la recette donne la réponse
> avant la question. Il faut avoir ramassé quelque chose pour que le feu
> devienne possible.

---

## 3. La Brume, et ce qu'elle fait

C'est la scène centrale. Si elle rate, le prologue rate.

| # | À vérifier | Attendu |
| --- | --- | --- |
| 3.1 | Ce qui passe | des **animaux** traversent le champ, en fuyant **dans la même direction** |
| 3.2 | La révélation | on voit la Brume **entre 40 et 60 mètres**, pas collée, pas à l'horizon |
| 3.3 | La silhouette | **une** silhouette court moins vite que les autres |
| 3.4 | Ce qui lui arrive | elle est **rattrapée**. Elle disparaît. Il y a un son. Puis plus rien. |
| 3.5 | Ce qu'on ne voit pas | **aucun corps**, aucun monstre, aucune explication |
| 3.6 | L'ordre | **FUIS**, en gros, une fois |

> **Questions à noter :**
> - Est-ce qu'on a compris ce qui vient d'arriver à cette silhouette ?
> - Est-ce qu'on a **envie** de courir, ou est-ce qu'on obéit à un texte ?
> - Est-ce que la Brume fait peur, ou est-ce qu'elle ressemble à un brouillard ?

---

## 4. La fuite, et ce qu'elle enseigne

Le prologue n'a **aucun tutoriel écrit**. Ce qui suit doit s'apprendre en
jouant. Si une de ces lignes demande une explication, c'est un défaut à noter.

| # | À vérifier | Attendu |
| --- | --- | --- |
| 4.1 | Ramasser | on ramasse **sans qu'on nous l'ait expliqué**, en s'arrêtant à côté |
| 4.2 | Le poids | le sac **grossit** visiblement à mesure qu'il se remplit |
| 4.3 | Le poids, suite | on **sent** qu'on ralentit — avant de lire un chiffre |
| 4.4 | Le feu | dès qu'on a deux bois et une pierre, l'action devient possible |
| 4.5 | Ce que le feu fait | la Brume **ralentit** — elle ne s'arrête pas |
| 4.6 | Le souffle | la course s'épuise, et se récupère près du feu |

> **Question :** à quel moment a-t-on compris que le poids est le vrai
> problème ? Avant ou après avoir été rattrapé une première fois ?

---

## 5. Les traces du convoi

Environ 1 050 unités après le départ, soit trois à quatre minutes de marche.

| # | À vérifier | Attendu |
| --- | --- | --- |
| 5.1 | Ce qu'on voit | des **ornières**, un feu éteint, un banc, une lanterne, un tissu rouge |
| 5.2 | Ce qu'on comprend | **des gens sont passés par là, récemment, en groupe** |
| 5.3 | Ce qui n'est pas là | aucune pancarte, aucun journal, aucun cadavre |
| 5.4 | L'objectif | il devient **Retrouver le convoi** |
| 5.5 | Le fragment | une phrase courte revient, quelques secondes plus tard |
| 5.6 | Ce qu'elle explique | **rien**. Elle donne une image, pas une réponse. |

> **Question :** est-ce qu'on a conclu tout seul que le convoi est parti sans
> nous, ou est-ce qu'il a fallu qu'on nous le dise ?

---

## 6. La structure ancienne

Environ 2 550 unités après le départ.

| # | À vérifier | Attendu |
| --- | --- | --- |
| 6.1 | À distance | elle **ne ressemble pas** à la tour-balise du début |
| 6.2 | La différence | monolithique, **penchée**, sans joints ; son cristal est **dans** la pierre |
| 6.3 | Le bouton | **APPROCHER** apparaît |
| 6.4 | La réponse | le cristal **répond** |
| 6.5 | La Brume | elle **recule franchement**, et c'est visible sans regarder de chiffre |
| 6.6 | Combien de temps | quelques secondes seulement — puis elle repart |

> **Question, et c'est la plus importante du document :** est-ce que cette
> structure pose une question ? Est-ce qu'on se demande qui l'a bâtie ?
> Si la réponse est « c'est juste un autre objet à toucher », le §28 a raté.

---

## 7. La sortie

| # | À vérifier | Attendu |
| --- | --- | --- |
| 7.1 | Le passage | il n'y a **ni écran de chargement, ni coupure, ni fondu** |
| 7.2 | Ce qui disparaît | plus aucun bandeau d'objectif du prologue, plus aucune réplique |
| 7.3 | Ce qui reste | l'inventaire, le poids, la santé, le souffle — **rien n'est réinitialisé** |
| 7.4 | Le monde | il continue : arbres, ressources, abris, nomades |
| 7.5 | Le doute | **on ne sait pas dire à quel moment exact le prologue s'est arrêté** |

> 7.5 est le vrai critère. S'il y a un instant identifiable où « le jeu
> commence », la transition a raté.

---

## 8. Rejouer

| # | À vérifier | Attendu |
| --- | --- | --- |
| 8.1 | Mourir pendant le prologue, puis relancer | ça repart proprement |
| 8.2 | Recharger la page en plein prologue | ça repart proprement |
| 8.3 | Deuxième partie | un joueur qui sait où il va va **nettement plus vite** |

---

## 9. Performance — et ce que ce chiffre vaut

**Les images par seconde relevées en test automatique ne valent rien.** Le banc
tourne en rendu logiciel ; il compare un avant et un après, il ne prédit pas un
téléphone. Cette mesure-là ne peut être faite que sur l'appareil.

Ouvrir `?prologuetest` et relever, à trois moments :

| Moment | fps | appels | à surveiller |
| --- | --- | --- | --- |
| Au réveil, tour dans le cadre | | | c'est le pic : quatre piliers, une lumière, des débris |
| En fuite, Brume proche | | | quatre nappes de brume à pleine largeur |
| Au pilier ancien | | | deuxième source lumineuse |

Repère : la 0.6a mesurait 34 à 60 appels de rendu en monde procédural.
Le prologue ajoute sa mise en scène **par-dessus** — s'il ajoute plus d'une
vingtaine d'appels, c'est à regarder.

---

## 10. Le panneau `?prologuetest`

Il existe pour une raison simple : le prologue dure une dizaine de minutes et
ses étapes ne s'atteignent que dans l'ordre. Vérifier la douzième en la jouant
coûte onze étapes à chaque essai — et c'est ainsi qu'on finit par ne plus la
vérifier du tout.

**Il est replié par défaut.** Toucher la zone de lecture l'ouvre et le referme.
Ouvert, il couvre le joystick et les boutons d'action : les deux coins bas de
l'écran leur appartiennent et il n'y a pas de troisième coin, donc c'est au
testeur de décider quand il veut les commandes plutôt que le jeu.

| Bouton | Effet |
| --- | --- |
| ⟲ | rejouer le prologue depuis le début |
| ⏭ | franchir l'étape suivante |
| ⛏ | sauter à la structure ancienne **et s'y téléporter** |
| ✦ | déclencher le pilier et la réaction de la Brume |
| ⇥ | terminer : passer au monde procédural |

Les quinze étapes sont affichées ; chacune est cliquable.

**Ce panneau ne contourne rien.** Un saut franchit réellement toutes les étapes
intermédiaires, avec leurs effets : le sac est ramassé, la Brume est relâchée,
l'objectif est posé. Un saut qui se contenterait d'écrire un nom d'étape
mentirait sur l'état du jeu — et le premier défaut qu'il masquerait serait
exactement celui qu'on cherchait.

---

## 11. Le banc automatique

```bash
npx http-server -p 8123 -c-1 .
node tests/prologue07.mjs
```

Il **joue** le prologue trois fois, avec un pilote installé dans la page qui
tient le joystick, se dirige, s'arrête sur les ressources et appuie sur les
boutons. Il ne saute aucune étape : la question posée est « combien de temps
met-on à traverser », et une étape sautée ne dure rien.

Les durées sont mesurées en **temps de jeu**, jamais à l'horloge. Sous rendu
logiciel, `delta` est plafonné à 40 ms et le temps de jeu avance moins vite que
la montre : une durée chronométrée mesurerait la machine de test.

Trois profils, parce qu'un seul chiffre ne dit rien d'une durée de jeu :

| Profil | Ce qu'il fait |
| --- | --- |
| `rapide` | court tout droit, ne se détourne pas, ne fait pas de feu |
| `normal` | marche, ramasse ce qui est sur son chemin, fait un feu |
| `exploration` | se détourne jusqu'à 26 unités, remplit son sac, fait un feu |

Les trois arrêtent de ramasser au-delà de 55 % de charge. Ce n'est pas une
commodité : à cette charge le joueur marche moins vite que la Brume n'avance,
et un pilote qui continuerait ne mesurerait plus une façon de jouer mais une
mort annoncée.

---

## 12. Ce qu'on rapporte

Pour chaque point : **OK**, **DÉFAUT**, ou **PAS VU**.

« PAS VU » est une réponse valable et utile. Un point qu'on n'a pas su
atteindre est une information sur le jeu, pas sur le testeur.

Et pour finir, deux questions ouvertes, qui valent plus que le reste du
document réuni :

1. **À quel moment avez-vous eu envie de continuer ?** Si la réponse est
   « jamais », le reste est sans objet.
2. **Qu'est-ce que vous avez cru comprendre sur la Brume ?** Si la réponse est
   une explication, le §16 a raté : elle doit rester une question.
