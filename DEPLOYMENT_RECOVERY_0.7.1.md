# INCIDENT DE DÉPLOIEMENT 0.7 — CONSTAT ET RÉPARATION

La 0.7 a été déployée **en production** alors que le brief du projet impose
depuis la 0.4 des déploiements **preview uniquement**. Ce document établit ce
qui s'est passé, ce qui a été réparé, et ce qui ne peut pas l'être depuis cette
session.

Tout ce qui suit a été **vérifié**, pas déduit du rapport précédent.

---

## 1. État avant intervention

### Dépôt

| | |
| --- | --- |
| Working tree | **propre** — aucune modification non commitée |
| HEAD | `dbf1d705574f843ba2dcedec102264b13d618241` |
| Branche locale | `fog-nomad-prologue-vertical-slice-0.7` |
| Remote | `https://github.com/yori-gossart/Game` |

Les quatre commits de la 0.7, du plus ancien au plus récent :

```
ce56e21  Le prologue : une ouverture mise en scène, et un banc qui la JOUE
489badc  Le plan central du prologue se jouait derrière la caméra
081c114  Les durées, mesurées en jouant : 11 min 30 s pour un parcours normal
ac328b3  fog03 mesurait la charge de la machine, pas les règles du jeu
dbf1d70  Le compte de prologue07 dépend des profils joués
```

`claude/new-session-nrx5d6` — locale **et distante** — pointait sur `dbf1d70`.
La branche `fog-nomad-prologue-vertical-slice-0.7` existait **en local
seulement** : elle n'avait jamais été poussée.

### Vercel

| | |
| --- | --- |
| Équipe | `team_x3HQeH9ohUY3bou6F632v4Dw` — « Yori's projects », plan hobby |
| Projet | `prj_duiFOOLAycPLevoRziUpyuOwal6C` — `horizon-proto` |
| Lien Git | GitHub · `yori-gossart/Game` |

Déploiement de production au moment du constat :

| | |
| --- | --- |
| ID | `dpl_AfYBmhXaPxJQP8rynE9LC3tdasFS` |
| Commit | `ac328b3` |
| Branche | `claude/new-session-nrx5d6` |
| Cible | **`production`** |
| État | READY |

### Ce que servait réellement la production

`https://horizon-proto-ten.vercel.app/` a été **récupérée et lue**. Elle
renvoie :

```html
<title>Fog Nomad — Living World 0.5</title>
<div class="brand">FOG NOMAD <span>0.6a</span></div>
<div id="pro-voile" hidden></div>
```

Le bloc `pro-voile` / `pro-replique` / `pro-objectif` / `pro-action` n'existe
que depuis la 0.7. **La production servait donc bien Fog Nomad 0.7.**

---

## 2. Cause exacte

`claude/new-session-nrx5d6` **est la branche de production du projet Vercel**,
et elle l'est depuis la création du projet.

Ce n'est pas un réglage qui aurait été modifié en cours de route. L'historique
des déploiements le montre : les trois plus anciens déploiements du projet
portent tous cette branche et tous la cible `production` —

| Créé | Commit | Branche | Cible |
| --- | --- | --- | --- |
| 1787775977254 | `1ec6027` | `claude/new-session-nrx5d6` | production |
| 1787776684936 | `db8a574` | `claude/new-session-nrx5d6` | production |
| 1787819354996 | `e9e3641` | `claude/new-session-nrx5d6` | production |

— tandis que **toutes** les branches `fog-nomad-*` poussées ensuite, sur sept
branches et une douzaine de déploiements, ont produit `target: null`,
c'est-à-dire des previews.

C'était la branche de travail de l'époque Horizon 0.2. Vercel l'a prise comme
branche de production au moment où l'intégration Git a été mise en place, et
plus personne n'y avait touché depuis — parce que plus personne n'y poussait.

La 0.7 y a poussé parce que la consigne de session l'imposait explicitement
(« Develop on branch `claude/new-session-nrx5d6` »). Les deux règles étaient
contradictoires, et la contradiction n'a été vue qu'après coup, en lisant le
`target` du déploiement.

**La 0.7 a produit deux déploiements de production**, `489badc` puis `ac328b3`.

---

## 3. Ce qui a été réparé

### La 0.7 est préservée

Aucun commit perdu. La branche `fog-nomad-prologue-vertical-slice-0.7` porte
exactement le HEAD testé, `dbf1d70`, et elle est désormais poussée. Le
déploiement qu'elle produit est une **preview**, vérifiée après coup.

**Vercel n'a produit aucun déploiement pour ce push.** Constaté, pas supposé :
la branche est bien sur GitHub à `dbf1d70`, et l'API Vercel ne montre aucun
déploiement postérieur. L'explication la plus probable est la déduplication par
commit — ce SHA avait déjà été construit deux minutes plus tôt depuis
`claude/new-session-nrx5d6`, et Vercel ne reconstruit pas un commit identique.
Les commits 0.7.1, eux, sont nouveaux : c'est sur eux que le comportement des
previews sera réellement vérifié.

### Le travail suivant est isolé

`fog-nomad-vertical-slice-completion-0.7.1` part de ce même HEAD. Plus rien
n'est poussé sur `claude/new-session-nrx5d6`.

---

## 4. L'ancienne production : identifiée, non restaurée

### Identification — sans ambiguïté

| | |
| --- | --- |
| ID | `dpl_Bf8muKP7sptCun6RSAUSB3Ei9Xb5` |
| URL immuable | `horizon-proto-ojejmg63c-nutricyclev01a.vercel.app` |
| Commit | `e9e3641949343c1f1ae95e632c45a39cf60e580c` |
| Branche | `claude/new-session-nrx5d6` |
| Cible | `production` |
| État | READY |
| Créé | 1787819354996 |

C'est le **déploiement de production le plus récent antérieur à l'incident**, et
il n'y a pas d'hésitation possible : les deux autres candidats production sont
plus anciens que lui.

Contenu **vérifié en le récupérant** :

```html
<title>Horizon Proto 0.2</title>
<div class="brand">HORIZON <span>0.2</span></div>
```

Aucun HUD Fog Nomad, aucun bloc `pro-*`, aucune importmap three.js. C'est bien
Horizon 0.2.

**Marqueur de distinction retenu pour tout contrôle futur :** le titre de la
page. `Horizon Proto 0.2` contre `Fog Nomad — …`.

### Restauration — IMPOSSIBLE DEPUIS CETTE SESSION

Le déploiement cible est certain. C'est l'**exécution** qui est bloquée, et il
faut le dire précisément plutôt que de tenter des commandes au hasard :

| Moyen | État |
| --- | --- |
| MCP Vercel | **aucun outil de rollback, promote ou alias.** Les outils disponibles sont lecture, protection, pause/unpause, création de projet et déploiement de fichiers. |
| CLI Vercel 59.15.1 | installée via `npx`, mais **déconnectée** — `vercel whoami` répond `Logged out.` |
| Jeton | aucun `VERCEL_TOKEN` dans l'environnement, aucun jeton dans `~/.local/share/com.vercel.cli/config.json` |

Créer un nouveau déploiement de production depuis le code de la 0.2 aurait été
possible en apparence — et c'est précisément ce que le brief interdit : il faut
restaurer le déploiement immuable existant, pas en fabriquer un sosie.

**La production sert donc toujours Fog Nomad 0.7 à la fin de cette mission.**

### La commande à exécuter, par une personne authentifiée

Vérifiée dans l'aide de la CLI, pas inventée :

```
vercel rollback horizon-proto-ojejmg63c-nutricyclev01a.vercel.app
```

ou, de façon équivalente, par l'identifiant :

```
vercel rollback dpl_Bf8muKP7sptCun6RSAUSB3Ei9Xb5
```

Depuis le tableau de bord : projet `horizon-proto` → Deployments → le
déploiement `horizon-proto-ojejmg63c…` (commit `e9e3641`) → **Instant Rollback**.

Contrôle après coup : `https://horizon-proto-ten.vercel.app/` doit répondre
`<title>Horizon Proto 0.2</title>`.

---

## 5. Mesure anti-récidive

### Ce qui est appliqué

1. **`claude/new-session-nrx5d6` ne doit plus jamais recevoir de push** pour le
   développement de Fog Nomad. C'est la branche de production du projet Vercel.
2. Tout développement se fait sur des branches **`fog-nomad-*`**, dont
   l'historique établit sur une douzaine de déploiements qu'elles produisent des
   previews.
3. Le `target` du déploiement est **relu après chaque push**, et pas supposé.
   C'est ce contrôle-là qui manquait : le premier signe de l'incident a été un
   champ `"target": "production"` dans une réponse d'API, et rien d'autre ne
   l'aurait signalé.

### Ce qui n'a PAS été fait, délibérément

La branche de production du projet Vercel **n'a pas été changée**. Aucun outil
disponible ici ne permet de la lire, encore moins de la modifier, et la
remplacer à l'aveugle par `main` ou `master` — qui n'existent ni l'une ni
l'autre dans ce dépôt — aurait cassé le projet au lieu de le réparer.

Si l'on veut une branche de production saine, c'est une décision humaine à
prendre dans les réglages du projet.

### Vérifié après coup, pas supposé

La 0.7.1 a été poussée sur `fog-nomad-vertical-slice-completion-0.7.1`, et le
`target` du déploiement a été relu **avant de rien annoncer** :

| | |
| --- | --- |
| Déploiement | `dpl_41XAvQ9uXZ6nTog1FUWpXA7sSRWt` |
| Commit | `49ad9b1` |
| Cible | **`null`, c'est-à-dire PREVIEW** |
| Alias de branche | `horizon-proto-git-fog-nomad-vertical-slic-15c69f-nutricyclev01a.vercel.app` |

Et le projet, relu au même moment : `latestDeployment.target` vaut `null`, les
trois domaines de production sont inchangés, aucun déploiement de production
n'a été créé depuis l'incident.

Cela confirme au passage l'hypothèse du §3 : le push de la branche 0.7 n'avait
produit aucun déploiement parce que son SHA avait déjà été construit. Les
commits 0.7.1 sont nouveaux, et ils ont bien déclenché des previews.

### Ce qui n'a été ni supprimé ni écrasé

Aucun projet, aucun déploiement, aucun domaine, aucune branche, aucun historique.
Les déploiements 0.7 restent accessibles à leurs URL immuables.
