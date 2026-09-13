/**
 * FOG NOMAD — PROLOGUE
 *
 * Une ouverture mise en scène, posée sur le jeu existant, qui s'efface quand
 * elle a fini de dire ce qu'elle avait à dire.
 *
 * ─── CE QUE LE PROLOGUE RACONTE ────────────────────────────────────────────
 *
 * Le joueur est un ÉCLAIREUR. Il précède un convoi nomade qui fuit la Brume
 * depuis des générations. Son travail : reconnaître le terrain, atteindre les
 * tours, activer les balises, confirmer que le convoi peut passer.
 *
 * Il a atteint sa tour. Il a activé la balise — le signal fonctionne encore,
 * c'est le premier objet qu'on voit. Puis la terre a tremblé, la tour l'a jeté
 * au sol, il a perdu connaissance.
 *
 * Le convoi n'a pas attendu. Il ne pouvait pas : la balise était activée, les
 * éclaireurs travaillent en relais, et on n'arrête pas un convoi quand la Brume
 * avance. Personne ne sait encore qu'il est resté derrière.
 *
 * ─── CE QUE LE PROLOGUE NE FAIT PAS ────────────────────────────────────────
 *
 * Il n'explique pas la Brume. Il ne dit pas ce qu'elle est, d'où elle vient,
 * ni ce qu'il y a dedans. Le doute est le sujet.
 *
 * Il n'inflige pas d'amnésie de théâtre. Le personnage sait ce qu'est un arbre,
 * une pierre, un feu ; ce sont ses gestes de métier. Ce qui lui manque, ce sont
 * les heures qui viennent de passer.
 *
 * Il ne bloque pas le joueur. Le contrôle revient en moins d'une minute, et
 * chaque étape s'ouvre sur ce que le joueur fait, jamais sur une minuterie qui
 * l'attend.
 *
 * ─── OÙ S'ARRÊTE LA MISE EN SCÈNE ──────────────────────────────────────────
 *
 * Le prologue POSE des objets à des coordonnées fixes autour du départ — la
 * tour, le sac, les traces, le pilier — et il déclenche des acteurs à des
 * distances décidées. Il ne touche NI au WorldDirector, NI à la génération de
 * chunks, NI au déterminisme par graine : le monde procédural continue
 * exactement comme avant, en dessous. La frontière est explicite : passé
 * `DISTANCE_FIN`, le prologue se retire et ne repose plus rien.
 */

import { ORIENTATION_MODELE } from "./assetmanager.mjs";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Les étapes, dans l'ordre. Ce sont AUSSI les points de contrôle des tests :
 * une étape franchie est un fait observable, pas une variable interne.
 */
export const ETAPES = [
  "PROLOGUE_START",
  "PLAYER_WAKE",
  "BAG_VISIBLE",
  "BAG_PICKED_UP",
  "FOG_REVEALED",
  "RUN_OBJECTIVE",
  "FIRST_RESOURCE",
  "FIRST_CRAFT_AVAILABLE",
  "FIRST_FIRE",
  "CONVOY_TRACE_FOUND",
  "MAIN_OBJECTIVE_REVEALED",
  "ANCIENT_STRUCTURE_FOUND",
  "CRYSTAL_INTERACTION",
  "FOG_REACTION",
  "PROLOGUE_COMPLETE",
];

/**
 * Géographie de la mise en scène, en unités, relative au départ du joueur.
 *
 * Le joueur fuit vers −Z. Toutes ces distances sont donc des Z négatifs, et
 * elles sont espacées pour qu'un joueur qui marche, hésite et ramasse mette
 * une dizaine de minutes à les traverser — sans qu'aucune barrière ne l'y
 * oblige. Un joueur pressé ira plus vite, et c'est très bien.
 */
export const SCENE = {
  // La tour est DEVANT-GAUCHE, pas derrière. La caméra regarde la direction de
  // fuite : posée derrière le joueur, la tour restait hors champ au réveil, et
  // le §7 demande qu'elle soit dans la première image. Le personnage a été
  // projeté de sa base et s'est réveillé à quelques mètres, face au vide qu'il
  // va devoir traverser — la tour reste dans son dos gauche quand il court.
  // Mesuré, pas deviné : la caméra est 13 unités derrière le joueur avec un
  // champ de 55°, ce qui donne une demi-largeur d'environ 6,8 unités au niveau
  // du joueur. Une tour posée à x −9 tombait hors cadre. À x −5 et 9 unités
  // devant, elle entre dans l'image en entier, hauteur comprise.
  // Reculée en 0.7.2 : la tour est passée de sept à treize unités de haut et
  // débordait du cadre d'ouverture. Le rapport hauteur/distance est le même
  // qu'avant — c'est la seule façon de la garder entière dans l'image tout en
  // la rendant imposante.
  tour:        { x: -7.5, z: -44.0 },
  sac:         { x: 2.2,  z: -6.0 },    // devant, à portée de regard
  // Les trois distances suivantes ont été MESURÉES avant d'être écrites. La
  // première version posait les traces à 260 unités et la fin à 760 : un
  // parcours complet, joué d'un bout à l'autre, durait 2 min 46 s, quand le
  // §2 en demande dix à quinze.
  //
  // Deux allongements successifs, chacun mesuré :
  //   760 u  → 2 min 46 s   (course continue, pas de gestion du poids)
  //   1 700 u → 6 min 23 s  (marche, feu répété, sac vidé)
  //   3 100 u → 11 min 30 s en 0.7, mais avec un joueur écrasé de 96 kg qu'il
  //             n'avait pas choisi de porter.
  //
  // La 0.7.1 rend la collecte volontaire et donne au prologue sa propre courbe
  // de pression. Le joueur reste léger, donc rapide : les mêmes 3 100 unités
  // sont retombées à 9 min 37 s. La géographie est donc rallongée une dernière
  // fois, de 11 %, pour revenir dans la fenêtre du §2.
  //
  // Pas davantage. Au-delà, la marche entre deux scènes cesse d'être de la
  // tension pour devenir du remplissage, et un prologue court et dense vaut
  // mieux qu'un prologue long et vide.
  traces:      { z: -1150 },            // le convoi est passé par là
  pilier:      { z: -2800 },            // la structure ancienne
  fin:         { z: -3450 },            // au-delà : monde procédural pur

  rayonSac: 3.2,
  // Les ornières font 22 unités de long et le camp s'étale autour : « trouver
  // les traces » se joue en marchant dessus, pas en visant un point. Le rayon
  // était de 14 et le parcours joué passait à côté — la scène est posée sur
  // l'axe du joueur 220 unités plus tôt, et il dérive encore un peu après.
  rayonTraces: 26,
  rayonPilier: 12,
};

/**
 * Inventaire de départ : le strict nécessaire, et rien de rare.
 *
 * Il lui manque DÉLIBÉRÉMENT une bûche. La recette du feu coûte deux bois et
 * une pierre ; un sac qui la contient déjà fait apparaître « premier craft
 * disponible » à la quatorzième seconde, avant même que le joueur ait ramassé
 * quoi que ce soit — mesuré en parcours réel : FIRST_CRAFT_AVAILABLE à 14,5 s,
 * FIRST_RESOURCE à 37,5 s, les deux beats dans le désordre.
 *
 * Le §22 demande que le monde enseigne. Il n'enseigne rien s'il donne la
 * réponse avant la question. En partant à un bois près, le feu devient
 * possible PARCE QUE le joueur a ramassé — et l'ordre des étapes suit ce que
 * le joueur a fait au lieu de le précéder.
 */
export const KIT_DEPART = { bois: 1, pierre: 1, ration: 1 };

const REPLIQUES = {
  // Le vocabulaire du métier revient avant les souvenirs : c'est la forme
  // d'amnésie retenue — les gestes tiennent, la chronologie non.
  reveil:     "Combien de temps…",
  tour:       "La balise tient. Le signal est parti.",
  sac:        "Mon sac.",
  brumeVue:   "Elle est déjà là.",
  ordre:      "FUIS",
  premiere:   "Du bois. Les gestes reviennent avant le reste.",
  pierre:     "Une pierre. Elle tient la chaleur.",
  // LA SEULE LIGNE DU JEU QUI RESSEMBLE À UN TUTORIEL, et elle n'arrive
  // qu'après que le joueur ait tenu les deux choses dans son sac. Le §23
  // demande que le monde enseigne : il n'enseigne rien s'il donne la réponse
  // avant la question.
  craft:      "Deux bois, une pierre. De quoi faire du feu.",
  feuUtile:   "Le feu la retient. Pas longtemps.",
  feu:        "Elle ralentit. Elle ne s'arrête pas.",
  poidsRappel: "Le sac tire. Chaque pierre se paie en distance.",
  traces:     "Des ornières. Ils sont passés récemment.",
  convoi:     "Ils ont continué. Ils ne pouvaient pas attendre.",
  souvenir:   "…la tour qui bouge. Une voix qui crie mon nom.",
  // Le parcours joué d'un bout à l'autre a montré le défaut : la Brume
  // rattrapait le joueur à trois minutes, sac plein à 96 kg sur 100. Les
  // ressources jonchent l'axe de fuite et se ramassent SEULES en passant à
  // côté : un joueur qui marche tout droit se charge sans jamais l'avoir
  // décidé, et il n'a nulle part appris qu'on peut jeter — le bouton est un
  // « × » dans le sac, découvrable mais discret.
  //
  // Ce n'est pas un correctif d'équilibrage. C'est la leçon la plus importante
  // du jeu, et le prologue la donnait implicitement, au moment où il est trop
  // tard pour l'apprendre. Elle est désormais dite une fois, à l'instant où
  // elle commence à coûter, et jamais ensuite.
  poids:      "Trop lourd. Il faut laisser quelque chose.",
  ancien:     "Ce n'est pas une balise d'éclaireur.",
  cristal:    "Il répond.",
  reaction:   "Elle a reculé. Quelque chose ici la dérange.",
};

const OBJECTIFS = {
  sac: "Récupérer son sac",
  fuir: "Fuir la Brume",
  convoi: "Retrouver le convoi",
};

export function createPrologue(deps) {
  const {
    THREE, scene, camera, player, game, decors, living,
    terrainHeight, contaminable, sons, degagerZone = () => {},
    lireLacet = () => 0, poserLacet = () => {},
    lireInclinaison = () => 0.5, poserInclinaison = () => {},
    /* Tirage déterministe fourni par le moteur : voir main.mjs. Le repli n'est
       là que pour les bancs qui construisent le prologue à la main. */
    tirage = () => 0.5,
    INCLINAISON_BASSE = 0.14,
    log = () => {},
  } = deps;

  // ───────────────────────────────────────────────────────────────────────
  // La caméra, et le seul plan du jeu qui la prend en main
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Fait pivoter la caméra vers un cap, par le plus court chemin.
   *
   * Le prologue ne touche à la caméra QU'ICI, et pour un seul plan : celui où
   * le personnage se retourne. La caméra du jeu est posée en +Z, dos à la
   * direction de fuite — le mur de brume est donc toujours hors champ tant
   * qu'on ne se retourne pas. Le §12 demande que la Brume soit révélée entre
   * 40 et 60 mètres et le §14 qu'on voie une silhouette se faire rattraper :
   * les deux se jouaient derrière l'objectif, et personne ne les voyait.
   *
   * Renvoie vrai quand le cap est atteint.
   */
  /**
   * Fait DESCENDRE la caméra vers l'horizon, et l'y garde le temps du plan.
   *
   * La caméra de jeu est haute — inclinaison 0,5 — et regarde le sol devant le
   * joueur : c'est juste pour se déplacer, et c'est faux pour regarder un mur.
   * Vérifié par capture au moment exact de la révélation : la Brume, à soixante
   * unités, tenait dans une bande de cent pixels tout en haut de l'image, sous
   * une pente d'herbe qui occupait les deux tiers du cadre. Le §12 demande
   * qu'elle soit RÉVÉLÉE ; elle était visible, ce qui n'est pas la même chose.
   *
   * À 0,14, la caméra passe presque à hauteur d'homme et le mur remplit le
   * haut du cadre. Elle remonte quand le joueur reprend la main.
   */
  function viserInclinaison(cible, delta, vitesse = 0.55) {
    const actuel = lireInclinaison();
    const ecart = cible - actuel;
    const pas = vitesse * delta;
    if (Math.abs(ecart) <= pas) { poserInclinaison(cible); return true; }
    poserInclinaison(actuel + Math.sign(ecart) * pas);
    return false;
  }

  function viserLacet(cible, delta, vitesse = 1.9) {
    const actuel = lireLacet();
    let ecart = (cible - actuel + Math.PI) % (Math.PI * 2) - Math.PI;
    if (ecart < -Math.PI) ecart += Math.PI * 2;
    const pas = vitesse * delta;
    if (Math.abs(ecart) <= pas) { poserLacet(cible); return true; }
    poserLacet(actuel + Math.sign(ecart) * pas);
    return false;
  }

  const $ = (id) => document.getElementById(id);
  const voile = $("pro-voile");
  const replique = $("pro-replique");
  const objectif = $("pro-objectif");
  const objectifTexte = $("pro-objectif-texte");
  const boutonAction = $("pro-action");
  const boutonTexte = $("pro-action-texte");

  const franchies = new Set();
  const props = [];             // objets posés par le prologue, à libérer
  const acteurs = [];           // silhouettes animées par le prologue

  let actif = false;
  let etape = null;
  // Position du joueur au réveil. Toute la mise en scène est posée par rapport
  // à elle : la recalculer depuis la position courante ferait glisser le sac
  // et les traces à mesure que le joueur avance.
  let piedsAncrageX = 0;
  let cibleSac = { x: 0, z: 0 };
  let temps = 0;                // secondes de prologue écoulées
  let depuisEtape = 0;
  let sacPris = false;
  let poidsDit = false;         // la leçon du poids ne se donne qu'une fois
  let pierreDite = false;       // deuxième temps de la leçon du feu
  let tracesPosees = false;     // les deux scènes lointaines sont posées
  let pilierPose = false;       // quand le joueur approche, pas au démarrage
  let piedsAncrage = null;      // z du joueur au réveil
  let actionCourante = null;    // { texte, rayon, cible, faire }
  let fogFige = null;           // brume tenue pendant le réveil
  let plafondBrume = 0;         // sa valeur d'origine, pour borner la dérive
  let lacetDepart = 0;          // le cap de la caméra avant le plan du regard
  let inclinaisonDepart = 0.5;  // et son inclinaison, à rendre après
  let reactionRestante = 0;     // secondes de brume ralentie
  let reculDepart = 0;          // le recul du mur est ANIMÉ, pas instantané
  let reculCible = 0;
  let reculAvance = 1;
  let eclatPilier = 0;          // l'éclat du cristal au moment de la réaction
  const RECUL_DUREE = 1.7;      // secondes : assez pour être vu, assez court
                                // pour ne pas ressembler à une cinématique

  const horodatage = {};        // étape -> secondes, pour mesurer les parcours

  // ───────────────────────────────────────────────────────────────────────
  // Points de contrôle
  // ───────────────────────────────────────────────────────────────────────

  function franchir(nom) {
    if (franchies.has(nom)) return false;
    franchies.add(nom);
    horodatage[nom] = +temps.toFixed(1);
    etape = nom;
    depuisEtape = 0;
    log(`Prologue — ${nom} à ${temps.toFixed(1)} s.`);
    return true;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Interface : trois couches, aucune fenêtre
  // ───────────────────────────────────────────────────────────────────────

  let repliqueJusqua = 0;

  function dire(texte, { duree = 4.2, ordre = false } = {}) {
    if (!replique) return;
    replique.hidden = false;
    replique.textContent = texte;
    replique.classList.toggle("ordre", ordre);
    replique.classList.add("visible");
    repliqueJusqua = temps + duree;
  }

  function poserObjectif(texte) {
    if (!objectif) return;
    // Un objectif atteint qu'on laisse affiché est pire qu'aucun objectif : il
    // dit au joueur de faire ce qu'il vient de faire. `null` le retire, et le
    // bandeau reste vide pendant le plan du regard — c'est-à-dire pendant la
    // seule scène du prologue où il n'y a rien à lire.
    if (!texte) { objectif.hidden = true; return; }
    objectif.hidden = false;
    objectifTexte.textContent = texte;
  }

  function proposerAction(texte, cible, rayon, faire) {
    actionCourante = { texte, cible, rayon, faire };
  }

  function rafraichirAction() {
    if (!boutonAction) return;
    if (!actionCourante) { boutonAction.hidden = true; return; }
    const d = Math.hypot(player.position.x - actionCourante.cible.x,
                         player.position.z - actionCourante.cible.z);
    const aPortee = d <= actionCourante.rayon;
    boutonAction.hidden = !aPortee;
    if (aPortee) boutonTexte.textContent = actionCourante.texte;
  }

  if (boutonAction) {
    boutonAction.onclick = (e) => {
      e.preventDefault();
      if (!actionCourante) return;
      const f = actionCourante.faire;
      actionCourante = null;
      boutonAction.hidden = true;
      f();
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Décor mis en scène
  // ───────────────────────────────────────────────────────────────────────

  const sol = (x, z) => Math.max(terrainHeight(x, z), -2.4);

  /** Le joueur est-il à `rayon` d'une scène posée ? Faux si elle n'existe
      pas encore, ce qui est exactement ce qu'on veut. */
  function pres(nom, rayon) {
    const p = props.find((o) => o.name === nom);
    if (!p) return false;
    return Math.hypot(player.position.x - p.position.x,
                      player.position.z - p.position.z) <= rayon;
  }

  function ajouter(mesh) {
    if (!mesh) return null;
    scene.add(mesh);
    props.push(mesh);
    return mesh;
  }

  /** Cristal lumineux : la seule source froide vive du monde, et le lien
      narratif entre les balises modernes et la structure ancienne. */
  function cristal(taille, couleur = 0x63e8d6) {
    const geo = new THREE.OctahedronGeometry(taille, 0);
    geo.scale(0.72, 1.9, 0.72);
    const mat = new THREE.MeshStandardMaterial({
      color: couleur, emissive: couleur, emissiveIntensity: 1.35,
      roughness: 0.25, metalness: 0,
    });
    return new THREE.Mesh(geo, mat);
  }

  /**
   * LA TOUR-BALISE.
   *
   * Assemblée de pièces modulaires du décor, pas de primitives grossières :
   * quatre piliers, une arche en couronnement, un cristal de signal encore
   * allumé, et les dégâts du tremblement — un pilier couché, un autre penché,
   * des débris au sol.
   *
   * Elle DOIT rester fonctionnelle : son signal est ce qui explique que le
   * convoi soit parti sans revenir chercher personne.
   */
  function batirTour(bx, bz) {
    const groupe = new THREE.Group();
    groupe.name = "prologue-tour";
    const y = sol(bx, bz);
    groupe.position.set(bx, y, bz);

    const pierre = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.9 });
    const pierreSombre = new THREE.MeshStandardMaterial({ color: 0x6d7176, roughness: 0.95 });
    const bois = new THREE.MeshStandardMaterial({ color: 0x6b4f30, roughness: 0.95 });
    const metal = new THREE.MeshStandardMaterial({
      color: 0x8a7d63, roughness: 0.55, metalness: 0.45 });

    /* LA TOUR-BALISE (refaite en 0.7.2).
     *
     * Celle de la 0.7 faisait sept unités — trois fois et demie la taille du
     * personnage. Sur la capture d'ouverture elle se lisait comme un échafaudage
     * gris posé dans un coin, et le §28 demande l'inverse : une silhouette
     * reconnaissable à plusieurs dizaines de mètres.
     *
     * Elle fait maintenant treize unités et se lit en trois temps, comme une
     * vraie construction : un socle large qui l'ancre, un fût qui monte, une
     * tête qui porte le signal. C'est cet étagement qui fait « tour » — quatre
     * piliers de même hauteur faisaient « ruines ».
     *
     * Elle raconte aussi son métier : des poutres de contreventement, une
     * échelle de maintenance, des haubans. Un éclaireur monte là-haut.
     */

    // --- SOCLE : ce qui l'ancre au sol -----------------------------------
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.7, 0.9, 8), pierreSombre);
    socle.position.y = 0.35;
    socle.rotation.y = 0.39;
    groupe.add(socle);

    const marche = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.8, 0.55, 8), pierre);
    marche.position.y = 1.05;
    marche.rotation.y = 0.39;
    groupe.add(marche);

    // --- FÛT : quatre montants qui convergent ----------------------------
    // Ils se resserrent en montant. Une tour à montants parallèles se lit comme
    // une cage ; une tour qui se resserre se lit comme quelque chose de bâti.
    const H_FUT = 8.2;
    const R_BAS = 1.9, R_HAUT = 1.05;
    const coins = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const montants = [];
    coins.forEach(([sx, sz], i) => {
      // Le montant arrière-gauche est ROMPU à mi-hauteur : c'est lui qui
      // raconte le séisme, et c'est ce qui déséquilibre la silhouette.
      const rompu = i === 2;
      const h = rompu ? H_FUT * 0.46 : H_FUT;
      const geo = new THREE.CylinderGeometry(0.19, 0.26, h, 5);
      const m = new THREE.Mesh(geo, bois);
      const rBas = R_BAS, rHaut = rompu ? R_BAS - (R_BAS - R_HAUT) * 0.46 : R_HAUT;
      m.position.set(sx * (rBas + rHaut) / 2, 1.3 + h / 2, sz * (rBas + rHaut) / 2);
      // L'inclinaison qui fait converger : mesurée, pas devinée.
      m.rotation.z = -sx * Math.atan2(rBas - rHaut, h);
      m.rotation.x = sz * Math.atan2(rBas - rHaut, h);
      groupe.add(m);
      montants.push(m);
    });

    // Contreventement : deux ceintures de poutres horizontales. Sans elles la
    // tour n'a pas l'air de tenir, et « avoir l'air de tenir » est la moitié du
    // travail d'une structure.
    for (const [hy, r] of [[3.4, 1.62], [6.4, 1.28]]) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const poutre = new THREE.Mesh(new THREE.BoxGeometry(r * 2.0, 0.16, 0.16), bois);
        poutre.position.set(0, hy, 0);
        poutre.rotation.y = a;
        poutre.position.x = Math.cos(a + Math.PI / 2) * r * 0.72;
        poutre.position.z = Math.sin(a + Math.PI / 2) * r * 0.72;
        groupe.add(poutre);
      }
    }

    // Échelle de maintenance : c'est le détail qui dit qu'un homme monte ici.
    for (let k = 0; k < 9; k++) {
      const barreau = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.07), metal);
      barreau.position.set(0, 1.7 + k * 0.82, R_BAS - k * 0.09);
      groupe.add(barreau);
    }

    // --- TÊTE : la plateforme du signal ----------------------------------
    const plateforme = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.25, 0.42, 6), pierre);
    plateforme.position.y = 9.7;
    plateforme.rotation.y = 0.4;
    // Elle est DÉPLACÉE : le séisme l'a fait riper sur ses appuis.
    plateforme.rotation.z = 0.055;
    plateforme.position.x = 0.22;
    groupe.add(plateforme);

    // Garde-corps ajouré : quatre poteaux et une lisse. Il découpe le ciel.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const poteau = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 4), metal);
      poteau.position.set(Math.cos(a) * 1.75 + 0.22, 10.3, Math.sin(a) * 1.75);
      groupe.add(poteau);
    }
    const lisse = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.055, 4, 6), metal);
    lisse.rotation.x = Math.PI / 2;
    lisse.position.set(0.22, 10.72, 0);
    groupe.add(lisse);

    // --- LE SIGNAL : la balise, et elle FONCTIONNE ------------------------
    // Une lanterne de pierre ouverte, et le cristal dedans. C'est la première
    // chose que le joueur voit du jeu, et la preuve que la mission précédente
    // a été accomplie.
    const lanterne = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.92, 1.5, 6, 1, true),
                                    pierreSombre);
    lanterne.material.side = THREE.DoubleSide;
    lanterne.position.set(0.22, 11.6, 0);
    groupe.add(lanterne);

    const chapeau = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.9, 6), pierre);
    chapeau.position.set(0.22, 12.75, 0);
    groupe.add(chapeau);

    const signal = cristal(0.78);
    signal.position.set(0.22, 11.6, 0);
    signal.name = "prologue-signal";
    groupe.add(signal);

    const halo = new THREE.PointLight(0x8ff0e2, 6.5, 34, 2);
    halo.position.set(0.22, 11.6, 0);
    groupe.add(halo);
    groupe.userData.halo = halo;

    // --- LES DÉGÂTS, et ils doivent être FRAIS ---------------------------
    // Le haut du montant rompu, tombé au pied de la tour.
    const troncon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.24, H_FUT * 0.5, 5), bois);
    troncon.position.set(-3.1, 0.42, 2.4);
    troncon.rotation.set(0.1, 0.6, 1.44);
    groupe.add(troncon);

    // Un hauban rompu qui pend depuis la plateforme : il bouge encore un peu.
    const hauban = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.6, 4), metal);
    hauban.position.set(-1.5, 7.4, 1.1);
    hauban.rotation.set(0.22, 0, 0.34);
    groupe.add(hauban);
    groupe.userData.hauban = hauban;

    // Blocs du socle arrachés, et poussière de pierre encore claire dessous.
    const eclats = [
      [-2.9, 1.7, 0.55, 0.42], [-3.6, 3.1, 0.42, 1.7], [2.7, 2.2, 0.5, 0.9],
      [-1.6, 4.4, 0.34, 2.4], [3.3, 4.6, 0.3, 0.2],
    ];
    for (const [dx, dz, sc, rot] of eclats) {
      const bloc = new THREE.Mesh(new THREE.DodecahedronGeometry(sc, 0), pierre);
      bloc.position.set(dx, sc * 0.55, dz);
      bloc.rotation.set(rot, rot * 1.7, rot * 0.6);
      groupe.add(bloc);
    }

    // Débris : ils dessinent la trajectoire de la chute, du pied de la tour
    // vers le point où le personnage s'est réveillé.
    const debris = [
      ["ruine_cloture", 1.9, 3.2, 0.55, 0.5],
      ["ruine_tombe", 3.4, 5.4, 0.5, 1.9],
      ["ruine_cloture", 4.6, 8.1, 0.45, 2.6],
    ];
    for (const [cle, dx, dz, sc, rot] of debris) {
      const m = decors.poser(cle, { x: dx, y: 0, z: dz, scale: sc, rotation: rot });
      if (!m) continue;
      m.rotation.z = 1.35;
      groupe.add(m);
    }

    groupe.userData.signal = signal;
    return ajouter(groupe);
  }

  /** Le sac, au sol, à quelques mètres. Il n'est PAS sur le dos au réveil. */
  function poserSacAuSol(bx, bz) {
    const groupe = new THREE.Group();
    groupe.name = "prologue-sac-sol";
    groupe.position.set(bx, sol(bx, bz) + 0.16, bz);
    groupe.rotation.set(0.35, 0.7, 0.15);   // tombé, pas déposé

    const cuir = new THREE.MeshStandardMaterial({ color: 0x7d5734, roughness: 0.92 });
    const cuirFonce = new THREE.MeshStandardMaterial({ color: 0x5d3f26, roughness: 0.95 });
    const corps = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.58, 0.34), cuir);
    const rabat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.17, 0.36), cuirFonce);
    rabat.position.y = 0.27;
    const sangle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 0.07), cuirFonce);
    sangle.position.set(0.19, 0, -0.2);
    groupe.add(corps, rabat, sangle);

    // Un halo très discret : le §9 demande un signal, pas une fenêtre.
    const lueur = new THREE.PointLight(0xffd08a, 1.1, 4.5, 2);
    lueur.position.y = 0.5;
    groupe.add(lueur);

    return ajouter(groupe);
  }

  // ───────────────────────────────────────────────────────────────────────
  // LE CAMP DU CONVOI
  //
  // Le §32 demande que le camp cesse d'être un marqueur et raconte « ils sont
  // passés ici récemment ». La première version posait cinq objets sur une
  // pelouse intacte : la capture montrait un banc, un lampadaire et deux
  // planches flottant au-dessus d'un pré vert. Rien ne s'était passé là.
  //
  // Ce qui raconte un campement, à cette caméra, c'est LE SOL. En portrait, les
  // deux tiers bas de l'écran sont de la terre : un objet posé dessus n'occupe
  // que quelques dizaines de pixels, mais une zone piétinée de vingt mètres
  // remplit la moitié du cadre. Le sol est donc traité en premier, et les
  // objets viennent le confirmer.
  // ───────────────────────────────────────────────────────────────────────

  const CAMP = {
    herbe:    new THREE.Color(0x6d8a49),   // ce que le terrain montre autour
    terre:    new THREE.Color(0x60492f),
    orniere:  new THREE.Color(0x4c3b26),   // une ornière, pas une tranchée
    cendre:   new THREE.Color(0x241f1c),
  };

  /**
   * Le sol piétiné : une nappe de terre battue, deux ornières, des pas.
   *
   * Elle est construite sur la grille du terrain (2 unités, alignée sur les
   * coordonnées paires du monde) : les sommets tombent alors exactement sur
   * ceux du chunk et la nappe épouse le relief au lieu de le traverser. Les
   * ornières et les pas, eux, sont trop fins pour cette grille — ils sont
   * échantillonnés plus serré et posés un peu plus haut.
   *
   * Une seule géométrie, une seule passe de rendu, couleurs par sommet : c'est
   * le même langage que le terrain, et ça reste un appel de dessin.
   */
  const PAS_TERRAIN = 2;               // le pas de la grille du terrain

  /**
   * La hauteur DU MAILLAGE, pas celle de la fonction.
   *
   * Le terrain est une grille de 2 unités : entre deux sommets, la surface
   * rendue est un plan, pas la courbe de `terrainHeight`. Une marque
   * échantillonnée sur la courbe passe donc alternativement au-dessus et
   * au-dessous du sol visible — et se découpe en tronçons, ce que la première
   * capture des ornières montrait très bien. On interpole comme le maillage.
   */
  function hauteurMaillage(wx, wz) {
    const P = PAS_TERRAIN;
    const x0 = Math.floor(wx / P) * P, z0 = Math.floor(wz / P) * P;
    const tx = (wx - x0) / P, tz = (wz - z0) / P;
    const a = sol(x0, z0), b = sol(x0 + P, z0);
    const c = sol(x0, z0 + P), d = sol(x0 + P, z0 + P);
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /**
   * Une NAPPE plaquée au sol : terre battue, dalle de pierre, cendre.
   *
   * Construite sur la grille du terrain et alignée sur les coordonnées paires
   * du monde, elle épouse exactement le relief rendu. `champ(u, v)` décide, en
   * coordonnées locales, ce que vaut chaque point : une valeur > 0 pose de la
   * matière, et `couleur(a, u, v)` la teinte. Le bord est donc irrégulier sans
   * qu'on ait à le dessiner, et il ne coûte rien.
   *
   * L'enroulement des triangles est celui qu'on voit de DESSUS. La première
   * version tournait à l'envers : la normale pointait vers le bas, la nappe
   * était éliminée par le culling, et elle ne se voyait nulle part.
   */
  function nappeAuSol(cx, cz, y0, demiU, demiV, champ, couleur, pos, col,
                      { hauteur = 0.04, penteMax = 1.5 } = {}) {
    const P = PAS_TERRAIN;
    const u0 = Math.ceil((cx - demiU) / P) * P - cx;
    const v0 = Math.ceil((cz - demiV) / P) * P - cz;
    const NU = Math.round((demiU * 2) / P), NV = Math.round((demiV * 2) / P);
    const C = new THREE.Color();

    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = u0 + i * P, b = v0 + j * P;
        const coins = [[a, b], [a + P, b], [a + P, b + P], [a, b + P]];
        const vals = coins.map(([p, q]) => champ(p, q));
        if (Math.max(...vals) <= 0.02) continue;

        const hs = coins.map(([p, q]) => hauteurMaillage(cx + p, cz + q) - y0);
        // Pas de nappe sur une paroi : la capture y montrait des pans dressés
        // à la verticale, et un convoi ne campe pas sur un talus.
        if (Math.max(...hs) - Math.min(...hs) > penteMax) continue;

        for (const [m, n, o] of [[0, 2, 1], [0, 3, 2]]) {
          for (const k of [m, n, o]) {
            pos.push(coins[k][0], hs[k] + hauteur, coins[k][1]);
            couleur(C, vals[k], coins[k][0], coins[k][1]);
            col.push(C.r, C.g, C.b);
          }
        }
      }
    }
  }

  /** Le matériau des nappes : celui du terrain, pour qu'elles en fassent
      partie au lieu d'y être collées. */
  function materiauNappe() {
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    contaminable(mat);      // elle grise devant la brume, comme le reste
    return mat;
  }

  function geometrieNappe(pos, col) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function solPietine(cx, cz, y0) {
    const pos = [];
    const col = [];
    const C = new THREE.Color();
    const hMaille = (wx, wz) => hauteurMaillage(wx, wz) - y0;

    /** Usure de la terre en un point local. > 0 : le convoi est passé. */
    const usure = (u, v) => {
      const r = Math.hypot(u / 8.2, (v - 1.0) / 11.5);
      const bord = 0.20 * Math.sin(u * 0.83 + v * 0.37)
                 + 0.15 * Math.sin(v * 1.21 - u * 0.64);
      return 1 - r - bord;
    };

    const teinte = (a) => C.copy(CAMP.herbe)
      .lerp(CAMP.terre, Math.min(1, Math.max(0, a * 1.7)));

    // --- la nappe de terre battue, sur la grille du terrain ---------------
    nappeAuSol(cx, cz, y0, 11, 14, usure,
               (c, a) => { teinte(a); c.copy(C); }, pos, col);

    /** Un ruban plaqué au sol : suite de quads échantillonnés sur le maillage.
        Il s'arrête là où la terre battue s'arrête — une ornière qui continue
        seule dans l'herbe verte se lit comme une bande peinte. */
    const ruban = (axe, deZ, aZ, demiLargeur, melange, hauteur) => {
      const PASZ = 1.0;
      for (let v = deZ; v < aZ; v += PASZ) {
        const uMil = axe(v + PASZ / 2);
        const a = usure(uMil, v + PASZ / 2);
        // Une ornière ne commence pas dans l'herbe verte : elle naît de la
        // terre battue et s'y éteint. Sans ce seuil, la capture montrait des
        // planches sombres flottant sur un pré intact.
        if (a < 0.28) continue;
        teinte(a);
        C.lerp(CAMP.orniere, melange * Math.min(1, (a - 0.28) * 2.6));
        const r = C.r, g = C.g, bl = C.b;
        const q = [];
        for (const vv of [v, v + PASZ]) {
          const u = axe(vv);
          for (const du of [-demiLargeur, demiLargeur]) {
            q.push([u + du, hMaille(cx + u + du, cz + vv) + hauteur, vv]);
          }
        }   // q = [v-, v+, (v+PAS)-, (v+PAS)+]
        for (const [m, n, o] of [[0, 3, 1], [0, 2, 3]]) {
          for (const k of [m, n, o]) {
            pos.push(q[k][0], q[k][1], q[k][2]);
            col.push(r, g, bl);
          }
        }
      }
    };

    // --- deux ornières, qui serpentent comme un attelage chargé -----------
    for (const cote of [-1, 1]) {
      ruban((v) => cote * 1.85 + Math.sin(v * 0.15) * 0.5, -13, 14, 0.24, 0.55, 0.06);
    }

    // --- des pas : c'est eux qui disent « à pied, et par là » -------------
    let gauche = false;
    for (let v = 13; v > -12; v -= 1.25) {
      gauche = !gauche;
      const u = 4.4 + Math.sin(v * 0.11) * 1.2 + (gauche ? -0.30 : 0.30);
      const a = usure(u, v);
      if (a < 0.22) continue;
      teinte(a);
      C.lerp(CAMP.orniere, 0.8);
      const y = hMaille(cx + u, cz + v) + 0.09;
      const cs = Math.cos(0.12), sn = Math.sin(0.12);
      const empreinte = [[-0.19, -0.30], [0.19, -0.30], [0.19, 0.30], [-0.19, 0.30]]
        .map(([p, q]) => [u + p * cs - q * sn, y, v + p * sn + q * cs]);
      for (const [m, n, o] of [[0, 2, 1], [0, 3, 2]]) {
        for (const k of [m, n, o]) {
          pos.push(empreinte[k][0], empreinte[k][1], empreinte[k][2]);
          col.push(C.r, C.g, C.b);
        }
      }
    }

    const mesh = new THREE.Mesh(geometrieNappe(pos, col), materiauNappe());
    mesh.userData.ownedGeometry = true;
    mesh.name = "camp-sol";
    return mesh;
  }

  /**
   * Traces du convoi. Aucune pancarte : de la terre battue, des ornières, des
   * pas, un feu froid, du linge qui sèche encore, des caisses, une roue
   * cassée. Le joueur conclut lui-même.
   */
  function poserTraces(x, z) {
    const groupe = new THREE.Group();
    groupe.name = "prologue-traces";
    const y0 = sol(x, z);
    groupe.position.set(x, y0, z);

    // --- LE SOL D'ABORD : c'est lui qui remplit le cadre ------------------
    groupe.add(solPietine(x, z, y0));

    // Les objets sont posés sur le relief réel, pas sur le plan du groupe :
    // sans ça, tout ce qui s'éloigne du centre flotte ou s'enterre.
    const pose = (o, u, v, dy = 0) => {
      o.position.set(u, sol(x + u, z + v) - y0 + dy, v);
      groupe.add(o);
      return o;
    };

    const BOIS      = new THREE.MeshStandardMaterial({ color: 0x6b4c30, roughness: 0.95 });
    const BOIS_VIEUX= new THREE.MeshStandardMaterial({ color: 0x4b3624, roughness: 1 });
    const CHARBON   = new THREE.MeshStandardMaterial({ color: 0x27221e, roughness: 1 });
    const PIERRE    = new THREE.MeshStandardMaterial({ color: 0x8a8175, roughness: 0.95 });
    const TOILE     = new THREE.MeshStandardMaterial({ color: 0xc4553f, roughness: 1,
                                                       side: THREE.DoubleSide });
    const TOILE_PALE= new THREE.MeshStandardMaterial({ color: 0xc9b795, roughness: 1,
                                                       side: THREE.DoubleSide });
    for (const m of [BOIS, BOIS_VIEUX, CHARBON, PIERRE, TOILE, TOILE_PALE]) contaminable(m);

    // Un tas par matériau : les pièces sont fondues à la fin, ce qui garde le
    // campement à six appels de dessin quelle que soit sa richesse.
    const tas = new Map();
    const piece = (geo, mat, { x: px = 0, y: py = 0, z: pz = 0,
                               rx = 0, ry = 0, rz = 0,
                               s = 1, sx = s, sy = s, sz = s } = {}) => {
      // mergeGeometries refuse un mélange d'indexé et de non-indexé, et les
      // polyèdres (les cailloux) arrivent non indexés : tout est aplati.
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      const m4 = new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(sx, sy, sz));
      g.applyMatrix4(m4);
      const liste = tas.get(mat);
      if (liste) liste.push(g); else tas.set(mat, [g]);
    };

    const BOITE = new THREE.BoxGeometry(1, 1, 1);
    const RONDIN = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
    const CAILLOU = new THREE.DodecahedronGeometry(0.5, 0);

    /**
     * Un pan de toile, avec des plis.
     *
     * Un PlaneGeometry rendait une carte rouge parfaitement rigide : à la
     * capture, la bannière ne se lisait pas comme du tissu. Trois ondulations
     * verticales et un bas qui s'écarte suffisent — c'est du tissu à quinze
     * mètres, et ça coûte huit triangles.
     */
    const toile = (amplitude = 0.09) => {
      const g = new THREE.PlaneGeometry(1, 1, 4, 3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i);
        p.setZ(i, Math.sin((u + 0.5) * Math.PI * 2.2) * amplitude * (0.45 - v));
        p.setX(i, u * (1 + (0.5 - v) * 0.14));      // le bas s'ouvre
      }
      g.computeVertexNormals();
      return g;
    };
    const QUAD = toile();

    // --- LE FEU FROID -----------------------------------------------------
    // Un cercle de pierres, de la cendre, trois bûches carbonisées et un
    // trépied : personne ne dresse un trépied pour passer une minute.
    const FX = -2.4, FZ = -1.2;
    const fy = sol(x + FX, z + FZ) - y0;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.4;
      piece(CAILLOU, PIERRE, {
        x: FX + Math.cos(a) * 1.15, y: fy + 0.14, z: FZ + Math.sin(a) * 1.15,
        ry: a * 1.7, rz: 0.3, s: 0.42 + (i % 3) * 0.09,
      });
    }
    // la galette de cendre
    piece(RONDIN, CHARBON, { x: FX, y: fy + 0.06, z: FZ, sx: 1.7, sy: 0.12, sz: 1.7 });
    for (const [dx, dz, r] of [[-0.35, 0.2, 0.7], [0.3, -0.25, -1.1], [0.1, 0.4, 2.2]]) {
      piece(RONDIN, CHARBON, { x: FX + dx, y: fy + 0.14, z: FZ + dz,
                               rx: Math.PI / 2, rz: r, sx: 0.24, sy: 1, sz: 0.24 });
    }
    // trépied + marmite
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      piece(RONDIN, BOIS_VIEUX, {
        x: FX + Math.cos(a) * 0.62, y: fy + 0.85, z: FZ + Math.sin(a) * 0.62,
        rx: Math.cos(a) * 0.36, rz: -Math.sin(a) * 0.36,
        sx: 0.09, sy: 1.78, sz: 0.09,
      });
    }
    // la marmite, restée pendue au trépied
    piece(RONDIN, PIERRE, { x: FX, y: fy + 0.9, z: FZ, sx: 0.44, sy: 0.42, sz: 0.44 });

    // --- LE SÉCHOIR : la seule chose visible de loin ----------------------
    // Une perche haute et une bannière : à quarante mètres, c'est ça qui dit
    // « camp » avant que le reste ne se lise.
    const SX = 3.4, SZ = 1.6;
    const sy = sol(x + SX, z + SZ) - y0;
    piece(RONDIN, BOIS, { x: SX, y: sy + 2.2, z: SZ, rz: 0.05,
                          sx: 0.13, sy: 4.4, sz: 0.13 });
    piece(RONDIN, BOIS, { x: SX - 2.7, y: sy + 1.05, z: SZ + 0.5, rz: -0.09,
                          sx: 0.11, sy: 2.1, sz: 0.11 });
    piece(RONDIN, BOIS, { x: SX - 1.35, y: sy + 2.0, z: SZ + 0.25,
                          rx: Math.PI / 2, ry: 0.18, sx: 0.07, sy: 2.85, sz: 0.07 });

    // la bannière : à quarante mètres, elle est le camp
    piece(QUAD, TOILE, { x: SX + 0.14, y: sy + 2.9, z: SZ - 0.06, ry: 0.15,
                         sx: 0.8, sy: 2.5, sz: 1 });
    for (const [dx, w, hh] of [[-0.5, 0.62, 1.05], [-1.2, 0.74, 1.32], [-2.0, 0.55, 0.88]]) {
      piece(QUAD, TOILE_PALE, { x: SX + dx, y: sy + 1.95 - hh / 2, z: SZ + 0.3,
                                ry: 0.1 + dx * 0.05, sx: w, sy: hh, sz: 1 });
    }

    // --- LES CAISSES ------------------------------------------------------
    // Trois : une debout, une ouverte, une renversée. Trois caisses alignées
    // seraient du mobilier ; celles-là ont été déchargées vite.
    const caisse = (u, v, ry, renversee) => {
      const cy = sol(x + u, z + v) - y0;
      piece(BOITE, BOIS, { x: u, y: cy + (renversee ? 0.42 : 0.44), z: v,
                           ry, rz: renversee ? 1.45 : 0,
                           sx: 0.92, sy: 0.86, sz: 0.92 });
      for (const hy of [0.12, 0.74]) {
        piece(BOITE, BOIS_VIEUX, { x: u, y: cy + hy, z: v, ry,
                                   rz: renversee ? 1.45 : 0,
                                   sx: 0.96, sy: 0.1, sz: 0.96 });
      }
    };
    caisse(-4.4, 2.8, 0.35, false);
    caisse(-3.6, 4.1, 1.1, false);
    caisse(-5.1, 4.4, 0.7, true);
    // le couvercle arraché, par terre à côté
    piece(BOITE, BOIS_VIEUX, { x: -4.2, y: sol(x - 4.2, z + 3.5) - y0 + 0.06,
                               z: 3.5, ry: 0.9, rz: 0.04,
                               sx: 0.95, sy: 0.08, sz: 0.95 });

    // --- LA ROUE CASSÉE : elle sous-entend la charrette qu'on ne voit pas --
    const RX = -1.1, RZ = 3.7;
    const ry0 = sol(x + RX, z + RZ) - y0;
    const jante = new THREE.TorusGeometry(0.62, 0.075, 4, 11);
    piece(jante, BOIS_VIEUX, { x: RX, y: ry0 + 0.6, z: RZ, rx: 0.22, ry: 0.5, rz: 0.28 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      piece(RONDIN, BOIS_VIEUX, { x: RX, y: ry0 + 0.6, z: RZ, rx: 0.22, ry: 0.5,
                                  rz: 0.28 + a, sx: 0.05, sy: 1.2, sz: 0.05 });
    }
    jante.dispose();

    // --- LE BOIS DE CHAUFFE : empilé, donc laissé volontairement ----------
    const WX = 4.8, WZ = -2.0;
    const wy = sol(x + WX, z + WZ) - y0;
    for (const [i, [dx, dy]] of [[-0.30, 0], [0, 0], [0.30, 0],
                                 [-0.15, 0.28], [0.15, 0.28],
                                 [0, 0.56]].entries()) {
      piece(RONDIN, BOIS, { x: WX + dx, y: wy + 0.15 + dy, z: WZ,
                            rx: Math.PI / 2, ry: 0.25 + i * 0.02,
                            sx: 0.14, sy: 1.6, sz: 0.14 });
    }
    for (const [dx, dz, r] of [[0.9, 0.7, 0.4], [1.3, -0.5, 1.9]]) {
      piece(RONDIN, BOIS, { x: WX + dx, y: wy + 0.14, z: WZ + dz,
                            rx: Math.PI / 2, ry: r, sx: 0.13, sy: 1.4, sz: 0.13 });
    }

    // --- LE COUCHAGE : une natte déroulée, un rouleau à la tête -----------
    const NX = 1.0, NZ = 2.7;
    const ny = sol(x + NX, z + NZ) - y0;
    piece(BOITE, TOILE_PALE, { x: NX, y: ny + 0.07, z: NZ, ry: 0.42,
                               sx: 0.92, sy: 0.12, sz: 2.0 });
    piece(RONDIN, TOILE, { x: NX + 0.38, y: ny + 0.22, z: NZ - 0.9, rx: Math.PI / 2,
                           ry: 0.42, sx: 0.44, sy: 0.9, sz: 0.44 });

    // --- LES OUBLIS : un bol renversé, un cordage ------------------------
    piece(RONDIN, PIERRE, { x: -1.9, y: sol(x - 1.9, z + 1.3) - y0 + 0.11,
                            z: 1.3, rz: 2.5, sx: 0.42, sy: 0.22, sz: 0.42 });
    const corde = new THREE.TorusGeometry(0.3, 0.065, 4, 9);
    piece(corde, BOIS_VIEUX, { x: 2.6, y: sol(x + 2.6, z - 3.2) - y0 + 0.07,
                               z: -3.2, rx: Math.PI / 2 });
    corde.dispose();

    // --- fusion : un maillage par matériau --------------------------------
    for (const [mat, liste] of tas) {
      const fondu = liste.length === 1 ? liste[0] : mergeGeometries(liste, false);
      if (!fondu) continue;
      if (liste.length > 1) for (const g of liste) g.dispose();
      const mesh = new THREE.Mesh(fondu, mat);
      mesh.userData.ownedGeometry = true;
      groupe.add(mesh);
    }
    for (const g of [BOITE, RONDIN, CAILLOU, QUAD]) g.dispose();

    // --- les modèles du pack, qui portent le style du reste du monde ------
    const banc = decors.poser("camp_banc", { x: 0, y: 0, z: 0, scale: 1, rotation: 0.6 });
    if (banc) pose(banc, -2.1, 5.0);
    const lanterne = decors.poser("camp_lanterne", { x: 0, y: 0, z: 0, scale: 0.85 });
    if (lanterne) { lanterne.rotation.z = 0.22; pose(lanterne, 2.3, -0.3); }
    const cloture = decors.poser("ruine_cloture", { x: 0, y: 0, z: 0, scale: 0.9, rotation: 1.1 });
    if (cloture) pose(cloture, 5.2, 2.9);

    return ajouter(groupe);
  }

  /**
   * LE PILIER ANCIEN.
   *
   * Il ne doit ressembler à AUCUNE tour d'éclaireur, et la première version
   * échouait à la capture : un poteau noir de six mètres, coupé par le haut du
   * cadre, dans la même pierre grise que tout le reste. Un joueur y voit un
   * poteau télégraphique, pas une énigme.
   *
   * Le §31 demande ancien, mystérieux, inhabituel, pré-nomade — et une
   * géométrie, une palette et une lumière DIFFÉRENTES. Ce qui distingue donc
   * cette structure de tout le reste du monde :
   *
   *   — la pierre est PÂLE, presque de l'os, là où le monde est brun et vert ;
   *   — la lumière est VIOLETTE, là où la balise moderne est cyan ;
   *   — les nomades construisent droit et horizontal ; ici tout PENCHE VERS LE
   *     CENTRE, et rien ne repose sur rien ;
   *   — le cristal flotte DANS une ouverture, sans être tenu. C'est ce détail
   *     qui rend l'objet impossible à avoir bâti, et c'est là que naît la
   *     contradiction que le §28 demande — sans une ligne de texte.
   *
   * La dalle au sol est ce qui le rend visible de loin : une pierre claire au
   * milieu de l'herbe se repère à quarante mètres, un monolithe sombre non.
   */
  function batirPilierAncien(x, z) {
    const groupe = new THREE.Group();
    groupe.name = "prologue-pilier-ancien";
    const y0 = sol(x, z);
    groupe.position.set(x, y0, z);

    // Palette : celle de personne d'autre.
    // Facettes : le monde entier est taillé à plat, et des éclats aux normales
    // lissées se lisaient comme des cônes de plastique posés là.
    const PIERRE = new THREE.MeshStandardMaterial({ color: 0xa9a2b4, roughness: 0.72,
                                                    flatShading: true });
    const VEINE  = new THREE.MeshStandardMaterial({ color: 0x6b6478, roughness: 0.6,
                                                    flatShading: true });
    for (const m of [PIERRE, VEINE]) contaminable(m);

    // --- LA DALLE : ce qu'on voit d'abord, et de loin ---------------------
    const DALLE = new THREE.Color(0x9c95a9);
    const JOINT = new THREE.Color(0x6a6377);
    const HERBE = new THREE.Color(0x6d8a49);
    const pos = [], col = [];
    nappeAuSol(x, z, y0, 9, 9,
      // Un disque, mais fendu : quatre fentes radiales le brisent, et l'herbe
      // a repris dans les fentes. C'est l'âge, et ça se lit sans un mot.
      (u, v) => {
        const d = Math.hypot(u, v) / 6.8;
        const ang = Math.atan2(v, u);
        const fente = Math.abs(Math.sin(ang * 2 + 0.4)) < 0.06 ? 0.45 : 0;
        return 1 - d - fente - 0.09 * Math.sin(u * 1.1 + v * 0.7);
      },
      (c, a, u, v) => {
        const bord = Math.min(1, Math.max(0, a * 2.6));
        const veine = Math.abs(Math.sin(u * 0.9) * Math.cos(v * 0.8)) > 0.72 ? 1 : 0;
        c.copy(HERBE).lerp(DALLE, bord);
        if (veine) c.lerp(JOINT, 0.55 * bord);
      },
      pos, col, { hauteur: 0.06, penteMax: 1.9 });
    if (pos.length) {
      const dalle = new THREE.Mesh(geometrieNappe(pos, col), materiauNappe());
      dalle.userData.ownedGeometry = true;
      dalle.name = "pilier-dalle";
      groupe.add(dalle);
    }

    // Un tas par matériau : tout le monolithe tient en deux appels de dessin.
    const tas = new Map();
    const piece = (geo, mat, { x: px = 0, y: py = 0, z: pz = 0,
                               rx = 0, ry = 0, rz = 0,
                               s = 1, sx = s, sy = s, sz = s } = {}) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(sx, sy, sz)));
      const l = tas.get(mat);
      if (l) l.push(g); else tas.set(mat, [g]);
    };
    const BOITE = new THREE.BoxGeometry(1, 1, 1);
    const ECLAT = new THREE.CylinderGeometry(0.06, 0.5, 1, 5);   // un éclat, pas un fût

    // --- LA STÈLE PERCÉE --------------------------------------------------
    // Une dalle dressée, pas une colonne : large, mince, et trouée. Quatre
    // panneaux cernent l'ouverture — c'est le vide qui fait la silhouette.
    const INCL = 0.11;                       // elle penche, et depuis longtemps
    const stele = (py, hh, lg) => piece(BOITE, PIERRE,
      { x: -Math.sin(INCL) * py, y: py, z: 0, rz: INCL, sx: lg, sy: hh, sz: 0.78 });
    stele(1.35, 2.70, 2.85);                 // le pied, sous l'ouverture
    stele(5.25, 1.85, 2.45);                 // le linteau, au-dessus
    for (const cote of [-1, 1]) {            // les deux montants de l'ouverture
      piece(BOITE, PIERRE, {
        x: cote * 0.96 - Math.sin(INCL) * 3.75, y: 3.75, z: 0,
        rz: INCL, sx: 0.86, sy: 2.10, sz: 0.78,
      });
    }
    // Trois veines gravées, jamais régulières, jamais horizontales.
    for (const [py, lg, inc] of [[0.9, 2.90, 0.05], [2.3, 2.90, -0.07], [5.7, 2.50, 0.09]]) {
      piece(BOITE, VEINE, { x: -Math.sin(INCL) * py, y: py, z: 0,
                            rz: INCL + inc, sx: lg, sy: 0.13, sz: 0.84 });
    }

    // --- LE CERCLE D'ÉCLATS : tout penche vers le centre -------------------
    // Sept, hauteurs inégales, deux couchés. Les nomades bâtissent droit ; ce
    // cercle-là converge, et c'est la seule chose à dire.
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + 0.55;
      const r = 4.9 + Math.sin(i * 2.3) * 0.8;
      const h = 1.7 + ((i * 5) % 7) * 0.26;
      const ex = Math.cos(ang) * r, ez = Math.sin(ang) * r;
      const couche = i === 2 || i === 5;
      const hy = hauteurMaillage(x + ex, z + ez) - y0;
      if (couche) {
        piece(ECLAT, PIERRE, { x: ex, y: hy + 0.32, z: ez,
                               rx: Math.PI / 2 - 0.12, ry: ang + 0.9,
                               sx: 1.5, sy: h, sz: 1.5 });
      } else {
        // l'inclinaison est dirigée vers le centre : c'est ça qu'on voit
        piece(ECLAT, PIERRE, { x: ex, y: hy + h * 0.48, z: ez,
                               rx: Math.sin(ang) * 0.19, rz: -Math.cos(ang) * 0.19,
                               ry: ang, sx: 1.35, sy: h, sz: 1.35 });
      }
    }

    for (const [mat, liste] of tas) {
      const fondu = liste.length === 1 ? liste[0] : mergeGeometries(liste, false);
      if (!fondu) continue;
      if (liste.length > 1) for (const g of liste) g.dispose();
      const mesh = new THREE.Mesh(fondu, mat);
      mesh.userData.ownedGeometry = true;
      groupe.add(mesh);
    }
    BOITE.dispose(); ECLAT.dispose();

    // --- LE CRISTAL, DANS L'OUVERTURE, SANS RIEN QUI LE TIENNE ------------
    const c = cristal(0.58, 0xb388ff);
    c.position.set(-Math.sin(INCL) * 3.75, 3.75, 0);
    c.rotation.z = -INCL;
    c.name = "pilier-cristal";
    groupe.add(c);

    // Violet, et il bat plus lentement que la balise : deux objets qui
    // clignotent au même rythme sont le même objet.
    const halo = new THREE.PointLight(0xb388ff, 4.2, 26, 2);
    halo.position.copy(c.position);
    groupe.add(halo);
    groupe.userData.halo = halo;
    groupe.userData.cristal = c;
    return ajouter(groupe);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Acteurs : ce qui fuit, et ce qui se fait rattraper
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Un animal ou une silhouette humaine, animé par le prologue et par lui seul.
   *
   * `living.mjs` peuple les chunks au hasard ; ici il faut que quelque chose
   * traverse le champ de vision à un moment PRÉCIS, dans une direction qui a
   * du sens. Les patrons géométriques restent ceux de `living.mjs` : deux
   * silhouettes différentes pour la même espèce serait le défaut le plus
   * visible qui soit.
   */
  function lacher(type, { x, z, vitesse, cap = Math.PI, condamne = false }) {
    const p = living.patrons;
    let objet;

    if (type === "animal") {
      objet = new THREE.Mesh(p.animalGeo, p.materiaux.fourrure);
    } else {
      objet = new THREE.Group();
      objet.add(new THREE.Mesh(p.nomadeCorpsGeo, p.materiaux.manteau));
      objet.add(new THREE.Mesh(p.nomadeTeteGeo, p.materiaux.peau));
      objet.add(new THREE.Mesh(p.nomadeEcharpeGeo, p.materiaux.echarpe));
      const jambes = new THREE.Mesh(p.nomadeJambesGeo, p.materiaux.manteau);
      objet.add(jambes);
      objet.add(new THREE.Mesh(p.nomadeSacGeo, p.materiaux.bois));
      objet.userData.jambes = jambes;
    }

    objet.position.set(x, sol(x, z), z);
    objet.rotation.y = cap;
    scene.add(objet);

    const acteur = { objet, type, vitesse, cap, condamne, pas: 0,
                     vivant: true, englouti: false };
    acteurs.push(acteur);
    return acteur;
  }

  function animerActeurs(delta, fogZ) {
    for (const a of acteurs) {
      if (!a.vivant) continue;

      // Ils fuient la Brume, pas le joueur : c'est ce qui en fait un signal.
      a.objet.position.x += Math.sin(a.cap) * a.vitesse * delta;
      a.objet.position.z += Math.cos(a.cap) * a.vitesse * delta;
      a.objet.position.y = sol(a.objet.position.x, a.objet.position.z);
      a.objet.rotation.y = a.cap;

      a.pas += delta * (a.type === "animal" ? 13 : 9);
      const balancement = Math.sin(a.pas);
      if (a.objet.userData.jambes) a.objet.userData.jambes.rotation.x = balancement * 0.45;
      else a.objet.position.y += Math.abs(balancement) * 0.06;

      // LA PREMIÈRE DISPARITION. Celui qui est condamné court moins vite que la
      // Brume. Elle le rejoint, il s'efface dedans, un bruit, puis le silence.
      // Aucun corps, aucune scène : le joueur comprend en une seconde ce que
      // « être rattrapé » veut dire.
      if (a.condamne && a.objet.position.z > fogZ - 2.5) {
        a.vivant = false;
        // ENGLOUTI, et c'est un état DISTINCT de « plus vivant ».
        //
        // En 0.7 les deux se confondaient : la règle « trop loin devant » plus
        // bas mettait `vivant` à faux quand l'acteur sortait du champ, et la
        // vérification « le condamné a bien disparu » passait au vert sur ce
        // drapeau-là. Elle a été verte pendant toute la 0.7 sans que la Brume
        // ait jamais touché personne — elle ne le pouvait pas, il courait plus
        // vite qu'elle et s'en éloignait.
        //
        // Un seul chemin met ce drapeau-ci : celui où le front l'a rejoint.
        a.englouti = true;
        a.objet.visible = false;
        try { sons.disparition?.(); } catch { /* jamais bloquant */ }
        dire("…", { duree: 2.4 });
        franchir("FOG_REVEALED");
      }

      // Trop loin devant : il sort de l'histoire. Ce n'est PAS être englouti.
      if (a.objet.position.z < player.position.z - 220) a.vivant = false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Montage et démontage
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Le décor du DÉPART. La tour et le sac sont posés tout de suite : ils sont
   * dans la première image, et le joueur est à trois mètres.
   *
   * Les deux scènes lointaines ne le sont pas — voir `poserScenesLointaines()`.
   */
  function monterDecor() {
    const px = player.position.x, pz = player.position.z;
    batirTour(px + SCENE.tour.x, pz + SCENE.tour.z);
    poserSacAuSol(px + SCENE.sac.x, pz + SCENE.sac.z);
    log("Prologue — décor de départ posé : tour, sac.");
  }

  /**
   * LES DEUX SCÈNES LOINTAINES, posées quand le joueur approche.
   *
   * Elles l'étaient d'abord au démarrage, sur l'axe du réveil. Un parcours
   * complet a montré pourquoi c'est faux : après quatorze cents unités de
   * fuite, avec des détours vers les ressources, le joueur avait dérivé
   * latéralement bien au-delà des douze unités de portée du bouton APPROCHER.
   * `ANCIENT_STRUCTURE_FOUND` se déclenchait — elle ne dépend que de la
   * distance parcourue — puis rien. Le point culminant du prologue ne se
   * jouait pas, et le joueur passait à côté sans jamais savoir qu'il y avait
   * quelque chose.
   *
   * Une scène qu'on manque de soixante mètres n'est pas mise en scène, elle
   * est décorative. Elles sont donc posées à 220 unités devant, SUR l'axe où
   * le joueur se trouve réellement — assez tôt pour qu'aucun chunk concerné
   * n'existe encore, donc assez tôt pour que la végétation soit dégagée
   * autour d'elles comme au départ.
   *
   * Le Z, lui, ne bouge pas : c'est le rythme du prologue, et il est mesuré.
   */
  const PREAVIS = 220;

  /**
   * Cherche le sol le plus PLAT autour d'un point.
   *
   * La tour de l'ouverture a d'abord été bâtie dans un lac ; le camp du convoi
   * s'est ensuite posé en travers d'un talus, et la terre battue y formait une
   * falaise. Le défaut est le même : une scène posée à une coordonnée fixe
   * atterrit sur le relief que la graine a décidé, et personne ne le regarde.
   *
   * Un convoi ne campe pas sur une pente. On échantillonne donc quelques
   * emplacements voisins et on garde celui dont le sol varie le moins. Le
   * balayage est petit — l'axe du prologue doit rester l'axe du joueur — et
   * déterministe : même graine, même position de joueur, même choix.
   */
  function coinPlat(cx, cz, portee, rayon) {
    let meilleur = { x: cx, z: cz, relief: Infinity };
    for (let dx = -portee; dx <= portee; dx += portee / 4) {
      for (let dz = -portee; dz <= portee; dz += portee / 4) {
        let bas = Infinity, haut = -Infinity;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          for (const r of [rayon * 0.55, rayon]) {
            const h = sol(cx + dx + Math.cos(ang) * r, cz + dz + Math.sin(ang) * r);
            if (h < bas) bas = h;
            if (h > haut) haut = h;
          }
        }
        // Un léger malus à l'écart : à relief égal, on reste sur l'axe.
        const relief = haut - bas + Math.hypot(dx, dz) * 0.02;
        if (relief < meilleur.relief) meilleur = { x: cx + dx, z: cz + dz, relief };
      }
    }
    return meilleur;
  }

  function poserScenesLointaines(pz) {
    const px = player.position.x;

    if (!tracesPosees && pz < piedsAncrage + SCENE.traces.z + PREAVIS) {
      tracesPosees = true;
      const c = coinPlat(px, piedsAncrage + SCENE.traces.z, 24, 9);
      degagerZone(c.x, c.z, 22);   // un pin de sept mètres poussait au milieu du camp
      poserTraces(c.x, c.z);
      log(`Prologue — traces du convoi posées à x ${c.x.toFixed(0)} `
        + `(relief ${c.relief.toFixed(1)} u).`);
    }

    if (!pilierPose && pz < piedsAncrage + SCENE.pilier.z + PREAVIS) {
      pilierPose = true;
      const c = coinPlat(px + 4, piedsAncrage + SCENE.pilier.z, 20, 7);
      // 18 laissait un conifère de six mètres pousser entre la caméra et la
      // stèle. Le dégagement doit couvrir l'approche, pas seulement le socle :
      // le joueur s'arrête à douze unités, la caméra est onze plus loin.
      degagerZone(c.x, c.z, 26);
      batirPilierAncien(c.x, c.z);
      log(`Prologue — pilier ancien posé à x ${c.x.toFixed(0)} `
        + `(relief ${c.relief.toFixed(1)} u).`);
    }
  }

  function demonter() {
    for (const m of props) {
      scene.remove(m);
      m.traverse?.((o) => { if (o.userData?.ownedGeometry) o.geometry?.dispose(); });
    }
    props.length = 0;
    for (const a of acteurs) scene.remove(a.objet);
    acteurs.length = 0;
    document.body.classList.remove("pro-fige", "prologue");
    poserLacet(lacetDepart);
    poserInclinaison(inclinaisonDepart);
    if (voile) { voile.hidden = true; voile.className = ""; }
    if (replique) { replique.hidden = true; replique.classList.remove("visible", "ordre"); }
    if (boutonAction) boutonAction.hidden = true;
    actionCourante = null;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Démarrage
  // ───────────────────────────────────────────────────────────────────────

  function demarrer() {
    demonter();
    franchies.clear();
    for (const k of Object.keys(horodatage)) delete horodatage[k];

    actif = true;
    temps = 0; depuisEtape = 0;
    sacPris = false;
    poidsDit = false;
    pierreDite = false;
    tracesPosees = false;
    pilierPose = false;
    reactionRestante = 0;
    reculAvance = 1;
    eclatPilier = 0;
    piedsAncrage = player.position.z;
    piedsAncrageX = player.position.x;
    lacetDepart = lireLacet();
    inclinaisonDepart = lireInclinaison();
    cibleSac = { x: piedsAncrageX + SCENE.sac.x, z: piedsAncrage + SCENE.sac.z };

    // Le sac est vide : il est par terre. Le joueur n'a rien sur le dos.
    for (const k of Object.keys(game.state.inventory)) game.state.inventory[k] = 0;
    game.state.weight = 0;

    // `prologue` reste posée tout le temps que dure la mise en scène ;
    // `pro-fige` ne dure que le voile. Le bandeau d'introduction du monde
    // procédural doit disparaître pour les deux — il s'affichait par-dessus les
    // répliques du personnage, deux textes en même temps.
    document.body.classList.add("prologue", "pro-fige");
    if (voile) { voile.hidden = false; voile.className = ""; }
    monterDecor();

    // La Brume du prologue accompagne le joueur au lieu de le dépasser. Voir
    // BRUME_PROLOGUE dans fognomad.mjs : la 0.7 demandait quarante feux pour
    // traverser, ce qui avait cessé d'être un répit.
    game.setProfilPrologue?.(true);

    // La Brume est tenue en place pendant le réveil : on ne meurt pas dans une
    // cinématique d'ouverture.
    // 52 à 60 u (§12), tiré du MONDE et non de Math.random() : à graine
    // imposée, l'ouverture doit se rejouer à l'identique. Le tirage dépend de
    // la position d'ancrage, donc deux parties sur la même graine s'ouvrent
    // pareil, et deux graines différentes ne s'ouvrent pas pareil.
    fogFige = player.position.z + 52 + tirage(Math.round(player.position.z)) * 8;
    plafondBrume = fogFige;
    game.setFogZ(fogFige);

    franchir("PROLOGUE_START");
    log("Prologue — démarré.");
  }

  function terminer(raison = "distance") {
    if (!actif) return;
    franchir("PROLOGUE_COMPLETE");
    actif = false;
    demonter();
    // La vraie pression reprend, sans transition. Le joueur entre dans le jeu
    // avec la courbe du jeu.
    game.setProfilPrologue?.(false);
    log(`Prologue — terminé (${raison}). Le monde procédural reprend la main.`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Boucle
  // ───────────────────────────────────────────────────────────────────────

  function update(delta) {
    if (!actif) return;
    temps += delta;
    depuisEtape += delta;

    if (replique && temps > repliqueJusqua) replique.classList.remove("visible");

    const pz = player.position.z;
    const parcouru = piedsAncrage - pz;
    const fogZ = game.state.fogZ;

    animerActeurs(delta, fogZ);
    rafraichirAction();
    poserScenesLointaines(pz);

    // Le cadrage de l'ouverture est tenu jusqu'à l'ordre de fuir. Le plan du
    // regard, lui, descend encore plus bas — il repose par-dessus.
    if (!franchies.has("FOG_REVEALED") && franchies.has("PROLOGUE_START")) {
      viserInclinaison(INCLINAISON_OUVERTURE, delta, 0.35);
    }

    // Le signal tourne lentement. Un objet qui bouge dans une image immobile
    // est le seul « indice » que le prologue s'autorise sans texte.
    const tour = props.find((p) => p.name === "prologue-tour");
    if (tour?.userData.signal) {
      tour.userData.signal.rotation.y += delta * 0.8;
      // LA BALISE BAT (§29). Une lumière fixe est un décor ; une lumière qui
      // pulse est un appareil en marche — et c'est tout ce que le joueur a
      // besoin de comprendre pour savoir que sa mission précédente a réussi.
      // Deux battements par seconde environ, jamais éteinte.
      const battement = 0.78 + 0.22 * Math.sin(temps * 2.1)
                             + 0.10 * Math.sin(temps * 5.3);
      if (tour.userData.halo) tour.userData.halo.intensity = 6.5 * battement;
      tour.userData.signal.scale.setScalar(0.94 + 0.06 * battement);
      // Le hauban rompu oscille encore : la chute est récente.
      if (tour.userData.hauban) {
        tour.userData.hauban.rotation.z = 0.34 + Math.sin(temps * 1.3) * 0.035;
      }
    }
    const anc = props.find((p) => p.name === "prologue-pilier-ancien");
    if (anc?.userData.cristal) {
      anc.userData.cristal.rotation.y += delta * 0.35;
      // Il RESPIRE, là où la balise BAT. Cinq fois plus lent, sans le
      // deuxième temps sec : deux lumières au même rythme sont le même objet,
      // et tout l'intérêt de cette structure est de n'être pas la même.
      const souffle = 0.62 + 0.38 * Math.sin(temps * 0.42);
      // L'ÉCLAT. Sans lui, le mur reculait sans qu'on sache pourquoi : le
      // joueur voyait un effet, pas une cause. Le cristal blanchit et enfle
      // à l'instant où la Brume cède, puis retombe en deux secondes et demie.
      if (eclatPilier > 0) eclatPilier = Math.max(0, eclatPilier - delta / 2.5);
      const pic = eclatPilier * eclatPilier;
      if (anc.userData.halo) {
        anc.userData.halo.intensity = 4.2 * souffle + 26 * pic;
        anc.userData.halo.distance = 26 + 30 * pic;
      }
      anc.userData.cristal.scale.setScalar(0.92 + 0.08 * souffle + 0.55 * pic);
      const m = anc.userData.cristal.material;
      if (m) m.emissiveIntensity = 1.35 + 2.6 * pic;
    }

    // La réaction du pilier : la Brume est repoussée puis retenue quelques
    // secondes. Effet COURT — le §27 interdit une victoire permanente.
    if (reactionRestante > 0) {
      reactionRestante -= delta;
      if (reculAvance < 1) {
        // Départ vif, arrivée molle : un mur qui recule décélère, il ne
        // s'arrête pas net. C'est la seule courbe du prologue.
        reculAvance = Math.min(1, reculAvance + delta / RECUL_DUREE);
        const e = 1 - Math.pow(1 - reculAvance, 3);
        game.setFogZ(Math.max(game.state.fogZ,
                              reculDepart + (reculCible - reculDepart) * e));
      } else {
        game.setFogZ(Math.max(game.state.fogZ, pz + 120));
      }
    }

    switch (etape) {
      case "PROLOGUE_START": sequenceReveil(); break;
      case "PLAYER_WAKE": sequenceSac(); break;
      case "BAG_VISIBLE": break;                 // attend le ramassage
      case "BAG_PICKED_UP": sequenceBrume(delta); break;
      case "FOG_REVEALED": sequenceOrdre(delta); break;
      default: sequenceLibre(); break;
    }

    // La Brume reste tenue tant que l'ordre de fuir n'est pas donné.
    if (fogFige !== null) game.setFogZ(fogFige);

    // `SCENE.fin` est un point, pas un nombre : `-SCENE.fin` valait NaN, et
    // `parcouru > NaN` est faux à jamais. Le prologue restait donc actif
    // indéfiniment — mesuré en parcours réel : joueur à z −871 pour une
    // frontière posée à −760, PROLOGUE_COMPLETE jamais franchie, le monde
    // procédural jamais rendu à lui-même. Un test qui ne fait que lire les
    // étapes ne voit rien de tout cela ; il faut jouer jusqu'au bout.
    if (franchies.has("RUN_OBJECTIVE") && parcouru > -SCENE.fin.z) {
      terminer("distance");
    }
  }

  /* L'INCLINAISON DE TOUTE L'OUVERTURE (§45).
   *
   * La caméra de jeu est à 0,5 : haute, penchée vers le sol. C'est juste pour
   * marcher, et c'est faux pour regarder quoi que ce soit de vertical. Avec
   * elle, le haut du cadre se situe à un demi-degré au-dessus de l'horizontale,
   * et une tour de treize unités à quarante-quatre mètres sort de l'image par
   * le haut — vérifié sur la capture d'ouverture, où l'on ne voyait que ses
   * pieds et son échelle.
   *
   * L'ouverture tout entière est donc cadrée à 0,22, jusqu'à ce que le joueur
   * reçoive l'ordre de fuir. La tour tient dans l'image, la Brume aussi quand
   * il se retourne, et le monde a un horizon au lieu d'un tapis. La caméra
   * remonte à sa valeur de jeu au moment où le joueur en reprend la main —
   * c'est-à-dire au moment où il en a besoin pour courir.
   */
  const INCLINAISON_OUVERTURE = 0.22;

  // --- 1. le réveil ------------------------------------------------------
  function sequenceReveil() {
    // Noir d'abord, son seul. La vision revient en s'ouvrant depuis le centre,
    // avec une vignette qui reste : on se réveille d'une chute.
    if (depuisEtape > 0.4 && !voile.classList.contains("ouvre")) {
      voile.classList.add("ouvre");
      try { sons.reveil?.(); } catch { /* jamais bloquant */ }
    }
    if (depuisEtape > 3.4) {
      voile.classList.add("clair");
      document.body.classList.remove("pro-fige");
      dire(REPLIQUES.reveil, { duree: 3.5 });
      poserObjectif(OBJECTIFS.sac);
      franchir("PLAYER_WAKE");
    }
  }

  // --- 2. le sac --------------------------------------------------------
  function sequenceSac() {
    if (depuisEtape > 2.6) {
      dire(REPLIQUES.sac, { duree: 3.2 });
      proposerAction("PRENDRE", cibleSac, SCENE.rayonSac, ramasserSac);
      franchir("BAG_VISIBLE");
    }
  }

  function ramasserSac() {
    sacPris = true;
    for (const [k, n] of Object.entries(KIT_DEPART)) {
      game.state.inventory[k] = (game.state.inventory[k] || 0) + n;
    }
    game.recalculerPoids?.();
    try { sons.collecte?.(); } catch { /* jamais bloquant */ }

    const sacSol = props.find((p) => p.name === "prologue-sac-sol");
    if (sacSol) { sacSol.visible = false; }

    poserObjectif(null);          // il l'a, son sac
    dire(REPLIQUES.tour, { duree: 4 });
    franchir("BAG_PICKED_UP");
  }

  // --- 3. la Brume ------------------------------------------------------
  //
  // LA SCÈNE CENTRALE, et celle qui ne se jouait pas.
  //
  // Le condamné courait à 3,2 u/s devant un mur TENU EN PLACE, et il partait
  // trente unités devant lui. Il fuyait donc dans la même direction que la
  // Brume, plus vite qu'elle, en s'en éloignant : il n'a jamais pu être
  // rattrapé une seule fois. Il finissait par sortir du champ, `vivant` passait
  // à faux par la règle « trop loin devant », et la vérification « le condamné
  // a bien disparu » était verte — pour la mauvaise raison. C'est le pire
  // genre de test vert qui soit.
  //
  // Deux corrections. Le mur AVANCE pendant ce plan, lentement, de neuf unités
  // — assez pour qu'on le voie se refermer, beaucoup trop peu pour tuer qui
  // que ce soit à cinquante unités de là. Et le condamné n'est plus rapide :
  // il boite à 0,9 u/s, juste devant le front. Le mur le dépasse en quatre
  // secondes, à l'endroit exact où le joueur regarde.
  const DERIVE_PLAN = 9;

  function sequenceBrume(delta) {
    // Il se retourne. Le joystick est repris pendant ce plan : trois secondes
    // de caméra qui pivote pendant qu'on tient une direction ne se jouent
    // pas, elles se subissent.
    if (depuisEtape > 1.2) {
      document.body.classList.add("pro-fige");
      viserLacet(lacetDepart + Math.PI, delta);
      viserInclinaison(INCLINAISON_BASSE, delta);
    }

    if (depuisEtape > 1.6 && !acteurs.length) {
      // Ce qui fuit passe devant lui : le regard suit, et trouve la Brume.
      const px = player.position.x, pz = player.position.z;
      lacher("animal", { x: px - 9, z: pz + 6, vitesse: 9.5, cap: Math.PI + 0.25 });
      lacher("animal", { x: px + 7, z: pz + 9, vitesse: 8.8, cap: Math.PI - 0.2 });
      lacher("nomade", { x: px + 16, z: pz + 22, vitesse: 4.4, cap: Math.PI - 0.1 });
      // Celui-là ne court pas assez vite. Il n'ira pas plus loin.
      //
      // Quatre unités devant le front, à 0,6 u/s, contre un mur qui se referme
      // à 1,8 : il est rejoint en un peu plus de trois secondes. Mesuré et
      // ajusté : à six unités et 0,9 u/s il l'était à la onzième seconde,
      // c'est-à-dire APRÈS le repli de 6,5 s qui révèle la Brume de toute
      // façon. C'est la scène qui doit déclencher l'étape, pas le minuteur —
      // sinon le minuteur la déclenchera toujours et la scène ne servira à
      // rien.
      lacher("animal", { x: px - 11, z: fogFige - 4, vitesse: 0.6, cap: Math.PI,
                         condamne: true });
      dire(REPLIQUES.brumeVue, { duree: 3.2 });
    }

    // Le mur se referme pendant le plan. `fogFige` est la position tenue :
    // c'est elle qu'on fait glisser, sinon la ligne suivante de update() la
    // remettrait à sa valeur d'origine à l'image d'après.
    if (fogFige !== null && depuisEtape > 1.6) {
      fogFige = Math.max(fogFige - DERIVE_PLAN * delta / 5, plafondBrume - DERIVE_PLAN);
    }

    if (depuisEtape > 6.5) franchir("FOG_REVEALED");
  }

  // --- 4. l'ordre -------------------------------------------------------
  //
  // Il a vu. Il se retourne, et on lui rend la main dans le même geste : le
  // mot FUIS tombe à l'instant où la caméra revient dans l'axe de fuite, pas
  // avant. Un ordre donné à un joueur qui regarde encore ailleurs n'est pas
  // un ordre, c'est un sous-titre.
  function sequenceOrdre(delta) {
    const enPlace = viserLacet(lacetDepart, delta, 2.6);
    viserInclinaison(inclinaisonDepart, delta, 0.55);
    if (enPlace && depuisEtape > 1.2) {
      document.body.classList.remove("pro-fige");
      dire(REPLIQUES.ordre, { duree: 2.6, ordre: true });
      poserObjectif(OBJECTIFS.fuir);
      fogFige = null;              // la Brume repart
      franchir("RUN_OBJECTIVE");
    }
  }

  // --- 5. le reste s'ouvre sur ce que le joueur fait ---------------------
  /**
   * Le reste du prologue. Il ne prend plus la distance parcourue : les deux
   * étapes qui en dépendaient se mesurent maintenant à la distance de la
   * SCÈNE. Seule la frontière de sortie reste une distance, et c'est normal —
   * c'est une frontière, pas une rencontre.
   */
  function sequenceLibre() {
    // --- la leçon du poids ---
    // Au-delà de 58 % de charge, la Brume gagne du terrain : c'est la règle
    // centrale du jeu, écrite dans CONFIG. On prévient un peu avant, pendant
    // qu'il reste le temps d'agir.
    if (!poidsDit && game.state.weight / game.config.weight.max > 0.5) {
      poidsDit = true;
      dire(REPLIQUES.poids, { duree: 5 });
    }

    // --- LA LEÇON DU FEU, en trois temps et dans l'ordre -------------------
    //
    // Le §23 demande : le joueur découvre le bois, puis la pierre, et SEULEMENT
    // ENSUITE le jeu indique discrètement la recette. Trois répliques, chacune
    // déclenchée par un fait, aucune par une minuterie.
    if (!franchies.has("FIRST_RESOURCE") && game.state.collected > 0) {
      dire(REPLIQUES.premiere, { duree: 3.6 });
      franchir("FIRST_RESOURCE");
    }

    // Le deuxième temps : la pierre. Il n'a pas d'étape à lui — les quinze
    // points de contrôle sont fixés — mais il a sa phrase, parce que c'est le
    // moment où le joueur tient les deux moitiés de la recette sans le savoir.
    if (!pierreDite && (game.state.inventory.pierre || 0) > 0
        && franchies.has("FIRST_RESOURCE")) {
      pierreDite = true;
      dire(REPLIQUES.pierre, { duree: 3.4 });
    }

    if (!franchies.has("FIRST_CRAFT_AVAILABLE") && game.canLightFire()) {
      dire(REPLIQUES.craft, { duree: 4.6 });
      franchir("FIRST_CRAFT_AVAILABLE");
    }

    if (!franchies.has("FIRST_FIRE") && game.state.firesLit > 0) {
      dire(REPLIQUES.feu, { duree: 4 });
      franchir("FIRST_FIRE");
      // Le §23 demande que le joueur SENTE ce que le feu vient de lui acheter.
      // La phrase arrive après coup, quand l'écart s'est déjà creusé sous ses
      // yeux — dire « ça marche » avant que ça se voie n'apprend rien.
      setTimeout(() => { if (actif) dire(REPLIQUES.feuUtile, { duree: 3.6 }); }, 4200);
    }

    // --- traces du convoi ---
    // Le déclenchement se mesure à la DISTANCE DE LA SCÈNE, pas à la distance
    // parcourue. Les deux se confondaient tant que tout était posé sur l'axe
    // du réveil ; elles cessent de se confondre dès que le joueur dérive, et
    // c'est alors la distance parcourue qui ment.
    if (!franchies.has("CONVOY_TRACE_FOUND") && pres("prologue-traces", SCENE.rayonTraces)) {
      dire(REPLIQUES.traces, { duree: 4 });
      franchir("CONVOY_TRACE_FOUND");
    }
    if (franchies.has("CONVOY_TRACE_FOUND") && !franchies.has("MAIN_OBJECTIVE_REVEALED")
        && depuisEtape > 4.2) {
      dire(REPLIQUES.convoi, { duree: 4.4 });
      poserObjectif(OBJECTIFS.convoi);
      franchir("MAIN_OBJECTIVE_REVEALED");
      // Le fragment de mémoire arrive ici, très court, sans rien expliquer.
      setTimeout(() => { if (actif) dire(REPLIQUES.souvenir, { duree: 4.5 }); }, 5200);
      try { sons.souvenir?.(); } catch { /* jamais bloquant */ }
    }

    // --- pilier ancien ---
    if (!franchies.has("ANCIENT_STRUCTURE_FOUND")
        && pres("prologue-pilier-ancien", SCENE.rayonPilier)) {
      dire(REPLIQUES.ancien, { duree: 4.2 });
      franchir("ANCIENT_STRUCTURE_FOUND");
      const pilier = props.find((p) => p.name === "prologue-pilier-ancien");
      if (pilier) {
        proposerAction("APPROCHER", { x: pilier.position.x, z: pilier.position.z },
                       SCENE.rayonPilier, activerPilier);
      }
    }
  }

  /** Le cristal répond à la pierre ancienne, et la Brume recule. */
  function activerPilier() {
    franchir("CRYSTAL_INTERACTION");
    dire(REPLIQUES.cristal, { duree: 3 });

    // S'il n'a pas de cristal, la structure lui en donne un : le prologue ne
    // doit pas pouvoir se bloquer sur une ressource qu'il n'a pas trouvée.
    if ((game.state.inventory.cristal || 0) === 0) {
      game.state.inventory.cristal = 1;
      game.recalculerPoids?.();
    }

    try { sons.cristal?.(); } catch { /* jamais bloquant */ }

    setTimeout(() => {
      if (!actif) return;
      // La première version téléportait le mur de cent vingt unités en une
      // image. Mécaniquement c'était le bon répit ; à l'écran, c'était un
      // défaut d'affichage. On mémorise l'origine et la cible : `update` fait
      // le recul, et le §14 demande qu'on le VOIE reculer.
      reculDepart = game.state.fogZ;
      reculCible = player.position.z + 150;
      reculAvance = 0;
      reactionRestante = 9;
      eclatPilier = 1;
      dire(REPLIQUES.reaction, { duree: 4.6 });
      franchir("FOG_REACTION");
    }, 1400);
  }

  return {
    demarrer,
    update,
    terminer,
    get actif() { return actif; },
    get etape() { return etape; },
    get franchies() { return [...franchies]; },
    get horodatage() { return { ...horodatage }; },
    get temps() { return +temps.toFixed(1); },
    get sacPris() { return sacPris; },
    /** Où le sac attend. Le pilote des tests en a besoin pour y aller ;
        le recalculer depuis SCENE en dehors d'ici donnerait une seconde
        source de vérité, et elles finiraient par diverger. */
    get cibleSac() { return { ...cibleSac }; },
    /** Le point de réveil : toute la mise en scène est posée par rapport à lui.
        Les bancs en ont besoin pour atteindre une scène AVANT qu'elle existe —
        elles sont posées à l'approche, pas au démarrage. */
    get ancrage() { return { x: piedsAncrageX, z: piedsAncrage }; },
    get props() { return props.map((p) => p.name); },
    /**
     * Les sources lumineuses du prologue, pour l'audio (§43).
     *
     * Le prologue sait où sont ses cristaux ; l'audio sait faire un
     * bourdonnement. Ni l'un ni l'autre n'a besoin de connaître l'autre : ce
     * getter est le seul point de contact, et il ne renvoie que des nombres.
     * `pan` est calculé ici parce que c'est ici qu'on connaît le cap du joueur.
     */
    balisesSonores() {
      const out = [];
      const cap = lireLacet();
      for (const [nom, frequence] of [["prologue-tour", 742],
                                      ["prologue-pilier-ancien", 412]]) {
        const o = props.find((p) => p.name === nom);
        if (!o) continue;
        const dx = o.position.x - player.position.x;
        const dz = o.position.z - player.position.z;
        const distance = Math.hypot(dx, dz);
        // Angle de l'objet relativement au regard : le sinus donne
        // directement la gauche et la droite, et rien d'autre n'est utile.
        const angle = Math.atan2(dx, dz) - cap;
        out.push({ cle: nom, distance, frequence, pan: Math.sin(angle) });
      }
      return out;
    },
    get acteurs() {
      return acteurs.map((a) => ({ type: a.type, vivant: a.vivant,
        condamne: a.condamne, englouti: a.englouti,
        z: +a.objet.position.z.toFixed(1) }));
    },
    /** Déclenche la structure ancienne sans attendre l'approche, pour
        ?prologuetest. C'est la MÊME fonction que le bouton du jeu appelle :
        un raccourci qui rejouerait la scène autrement ne testerait pas la
        scène. */
    forcerPilier() {
      poserScenesLointaines(piedsAncrage + SCENE.pilier.z);
      if (!franchies.has("ANCIENT_STRUCTURE_FOUND")) franchir("ANCIENT_STRUCTURE_FOUND");
      actionCourante = null;
      if (boutonAction) boutonAction.hidden = true;
      activerPilier();
    },
    /** Saut d'étape, pour ?prologuetest uniquement. */
    sauterA(nom) {
      const i = ETAPES.indexOf(nom);
      if (i < 0) return false;
      // Les scènes lointaines sont posées à l'approche : sauter à une étape qui
      // en dépend doit d'abord les faire exister, sinon le saut mène à un
      // décor vide et le bouton d'action ne peut pas apparaître.
      if (i >= ETAPES.indexOf("CONVOY_TRACE_FOUND")) {
        poserScenesLointaines(piedsAncrage + SCENE.pilier.z);
      }
      for (let k = 0; k <= i; k++) franchir(ETAPES[k]);
      if (i >= ETAPES.indexOf("RUN_OBJECTIVE")) {
        fogFige = null;
        poserLacet(lacetDepart);   // sauter le plan du regard ne doit pas
        poserInclinaison(inclinaisonDepart);
        document.body.classList.remove("pro-fige");   // laisser la caméra retournée
        voile.classList.add("clair");
        poserObjectif(franchies.has("MAIN_OBJECTIVE_REVEALED")
          ? OBJECTIFS.convoi : OBJECTIFS.fuir);
      }
      if (i >= ETAPES.indexOf("BAG_PICKED_UP") && !sacPris) ramasserSac();
      return true;
    },
    ETAPES, SCENE,
  };
}
