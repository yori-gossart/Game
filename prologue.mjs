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
  tour:        { x: -4.5, z: -26.0 },
  sac:         { x: 2.2,  z: -6.0 },    // devant, à portée de regard
  // Les trois distances suivantes ont été MESURÉES avant d'être écrites. La
  // première version posait les traces à 260 unités et la fin à 760 : un
  // parcours complet, joué d'un bout à l'autre, durait 2 min 46 s, quand le
  // §2 en demande dix à quinze.
  //
  // Deux allongements successifs, chacun mesuré :
  //   760 u  → 2 min 46 s   (course continue, pas de gestion du poids)
  //   1 700 u → 6 min 23 s  (marche, feu répété, sac vidé)
  //   3 100 u → visé 11 à 12 min, sur une vitesse effective mesurée de
  //             4,43 unités par seconde d'ouverture comprise.
  //
  // Pas davantage. Au-delà, la marche entre deux scènes cesse d'être de la
  // tension pour devenir du remplissage, et un prologue court et dense vaut
  // mieux qu'un prologue long et vide.
  traces:      { z: -1050 },            // le convoi est passé par là
  pilier:      { z: -2550 },            // la structure ancienne
  fin:         { z: -3100 },            // au-delà : monde procédural pur

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
  craft:      "Bois et pierre. De quoi tenir un moment.",
  feu:        "Elle ralentit. Elle ne s'arrête pas.",
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
    lireLacet = () => 0, poserLacet = () => {}, log = () => {},
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
  let tracesPosees = false;     // les deux scènes lointaines sont posées
  let pilierPose = false;       // quand le joueur approche, pas au démarrage
  let piedsAncrage = null;      // z du joueur au réveil
  let actionCourante = null;    // { texte, rayon, cible, faire }
  let fogFige = null;           // brume tenue pendant le réveil
  let plafondBrume = 0;         // sa valeur d'origine, pour borner la dérive
  let lacetDepart = 0;          // le cap de la caméra avant le plan du regard
  let reactionRestante = 0;     // secondes de brume ralentie

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

    // Quatre piliers serrés, deux étages : c'est l'étagement qui fait lire
    // « tour » plutôt que « ruines ». Une arche posée dessus, essayée d'abord,
    // se lisait de profil comme un mur brun en travers de l'image.
    const R = 1.15;
    const coins = [[-R, -R], [R, -R], [-R, R], [R, R]];
    coins.forEach(([ox, oz], i) => {
      const bas = decors.poser("ruine_pilier", { x: ox, y: 0, z: oz, scale: 1.05 });
      if (bas) groupe.add(bas);
      // Le pilier arrière-gauche a cédé : c'est lui qui raconte le tremblement.
      if (i === 2) return;
      const haut = decors.poser("ruine_pilier", { x: ox * 0.7, y: 3.25, z: oz * 0.7, scale: 0.72 });
      if (haut) groupe.add(haut);
    });

    // Plateforme de signal : un hexagone de pierre, assez fin pour ne pas
    // écraser la silhouette, assez large pour porter le cristal.
    const plateforme = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.85, 0.42, 6), pierre);
    plateforme.position.y = 3.35;
    plateforme.rotation.y = 0.4;
    groupe.add(plateforme);

    const couronne = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.25, 0.3, 6), pierre);
    couronne.position.y = 5.65;
    couronne.rotation.y = 0.4;
    groupe.add(couronne);

    // LE SIGNAL. Il fonctionne encore : c'est la raison pour laquelle le convoi
    // est parti sans revenir. Il tourne lentement — c'est ce mouvement qui
    // attire l'œil depuis le point de réveil.
    const signal = cristal(0.6);
    signal.position.set(0, 6.6, 0);
    signal.name = "prologue-signal";
    groupe.add(signal);

    const halo = new THREE.PointLight(0x8ff0e2, 3.2, 18, 2);
    halo.position.set(0, 6.6, 0);
    groupe.add(halo);

    // Le pilier tombé, en travers de sa propre base.
    const tombe = decors.poser("ruine_pilier", { x: -2.4, y: 0.42, z: 1.9, scale: 0.95 });
    if (tombe) { tombe.rotation.z = 1.42; tombe.rotation.y = 0.7; groupe.add(tombe); }

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

  /**
   * Traces du convoi. Aucune pancarte : des ornières, un feu éteint, un banc
   * abandonné, un bout de tissu. Le joueur conclut lui-même.
   */
  function poserTraces(x, z) {
    const groupe = new THREE.Group();
    groupe.name = "prologue-traces";
    groupe.position.set(x, sol(x, z), z);

    // Ornières : deux bandes sombres parallèles, orientées dans le sens de la
    // marche du convoi. C'est le détail qui dit « ils allaient par là ».
    const terre = new THREE.MeshStandardMaterial({ color: 0x4a3d2c, roughness: 1 });
    for (const dx of [-0.9, 0.9]) {
      const orniere = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 22), terre);
      orniere.position.set(dx, 0.04, 0);
      groupe.add(orniere);
    }

    const banc = decors.poser("camp_banc", { x: -3.4, y: 0, z: 2.2, scale: 1, rotation: 0.6 });
    if (banc) groupe.add(banc);
    const lanterne = decors.poser("camp_lanterne", { x: 3.1, y: 0, z: -1.4, scale: 0.85 });
    if (lanterne) { lanterne.rotation.z = 0.22; groupe.add(lanterne); }
    const cloture = decors.poser("ruine_cloture", { x: 4.6, y: 0, z: 3.4, scale: 0.9, rotation: 1.1 });
    if (cloture) groupe.add(cloture);

    // Feu récemment éteint : cendres et deux bûches.
    const cendre = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 0.11, 9),
      new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 1 }));
    cendre.position.set(-2.0, 0.05, -2.6);
    groupe.add(cendre);
    const buche = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.95 });
    for (const [dx, dz, r] of [[-2.3, -2.2, 0.5], [-1.7, -3.0, -0.9]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.8, 6), buche);
      b.rotation.set(Math.PI / 2, 0, r);
      b.position.set(dx, 0.14, dz);
      groupe.add(b);
    }

    // Un tissu accroché : la couleur de l'écharpe, celle des éclaireurs.
    const tissu = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.72),
      new THREE.MeshStandardMaterial({ color: 0xc4553f, roughness: 1,
                                       side: THREE.DoubleSide }));
    tissu.position.set(3.1, 1.5, -1.4);
    tissu.rotation.y = 0.5;
    groupe.add(tissu);

    return ajouter(groupe);
  }

  /**
   * LE PILIER ANCIEN.
   *
   * Il ne doit ressembler à AUCUNE tour d'éclaireur. Là où la tour est faite de
   * piliers droits et d'une arche posée dessus — une construction qu'on
   * comprend —, celui-ci est monolithique, incliné, sans joint visible, et son
   * cristal est enchâssé dans la pierre au lieu d'être suspendu.
   *
   * Le §28 demande que la contradiction naisse de l'architecture. On ne dit
   * donc jamais « ceci n'est pas une balise d'éclaireur » comme un constat de
   * jeu : le personnage le pense, une fois, et l'objet le montre.
   */
  function batirPilierAncien(x, z) {
    const groupe = new THREE.Group();
    groupe.name = "prologue-pilier-ancien";
    groupe.position.set(x, sol(x, z), z);

    const pierre = new THREE.MeshStandardMaterial({ color: 0x4b4a55, roughness: 0.85 });
    const grave = new THREE.MeshStandardMaterial({ color: 0x3a3944, roughness: 0.8 });

    // Un monolithe à six pans, plus étroit en haut, incliné : rien de droit.
    const fut = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.05, 6.4, 6), pierre);
    fut.position.y = 3.2;
    fut.rotation.z = 0.07;
    groupe.add(fut);

    // Trois anneaux gravés, à intervalles irréguliers.
    for (const [h, r] of [[1.5, 1.02], [3.4, 0.86], [5.2, 0.7]]) {
      const anneau = new THREE.Mesh(new THREE.TorusGeometry(r, 0.075, 4, 6), grave);
      anneau.rotation.x = Math.PI / 2;
      anneau.position.y = h;
      groupe.add(anneau);
    }

    // Le cristal est ENCHÂSSÉ, pas suspendu : c'est la différence visible avec
    // la balise moderne, et elle se lit sans une ligne de texte.
    const c = cristal(0.42, 0x9d7fb4);
    c.position.set(0, 4.4, 0.55);
    c.rotation.x = 0.35;
    c.name = "pilier-cristal";
    groupe.add(c);

    const halo = new THREE.PointLight(0xb99fd0, 0.9, 12, 2);
    halo.position.set(0, 4.4, 0.6);
    groupe.add(halo);

    // Socle enterré, éclats autour : il est là depuis très longtemps.
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.7, 6), grave);
    socle.position.y = 0.2;
    groupe.add(socle);

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

    const acteur = { objet, type, vitesse, cap, condamne, pas: 0, vivant: true };
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
        a.objet.visible = false;
        try { sons.disparition?.(); } catch { /* jamais bloquant */ }
        dire("…", { duree: 2.4 });
        franchir("FOG_REVEALED");
      }

      // Trop loin devant : il sort de l'histoire.
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

  function poserScenesLointaines(pz) {
    const px = player.position.x;

    if (!tracesPosees && pz < piedsAncrage + SCENE.traces.z + PREAVIS) {
      tracesPosees = true;
      degagerZone(px, piedsAncrage + SCENE.traces.z, 16);
      poserTraces(px, piedsAncrage + SCENE.traces.z);
      log(`Prologue — traces du convoi posées à x ${px.toFixed(0)}.`);
    }

    if (!pilierPose && pz < piedsAncrage + SCENE.pilier.z + PREAVIS) {
      pilierPose = true;
      degagerZone(px + 4, piedsAncrage + SCENE.pilier.z, 18);
      batirPilierAncien(px + 4, piedsAncrage + SCENE.pilier.z);
      log(`Prologue — pilier ancien posé à x ${(px + 4).toFixed(0)}.`);
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
    document.body.classList.remove("pro-fige");
    poserLacet(lacetDepart);
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
    tracesPosees = false;
    pilierPose = false;
    reactionRestante = 0;
    piedsAncrage = player.position.z;
    piedsAncrageX = player.position.x;
    lacetDepart = lireLacet();
    cibleSac = { x: piedsAncrageX + SCENE.sac.x, z: piedsAncrage + SCENE.sac.z };

    // Le sac est vide : il est par terre. Le joueur n'a rien sur le dos.
    for (const k of Object.keys(game.state.inventory)) game.state.inventory[k] = 0;
    game.state.weight = 0;

    document.body.classList.add("pro-fige");
    if (voile) { voile.hidden = false; voile.className = ""; }
    monterDecor();

    // La Brume est tenue en place pendant le réveil : on ne meurt pas dans une
    // cinématique d'ouverture.
    fogFige = player.position.z + 52 + Math.random() * 8;   // 52 à 60 u, §12
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

    // Le signal tourne lentement. Un objet qui bouge dans une image immobile
    // est le seul « indice » que le prologue s'autorise sans texte.
    const tour = props.find((p) => p.name === "prologue-tour");
    if (tour?.userData.signal) tour.userData.signal.rotation.y += delta * 0.8;
    const anc = props.find((p) => p.name === "prologue-pilier-ancien");
    if (anc?.userData.cristal) anc.userData.cristal.rotation.y += delta * 0.35;

    // La réaction du pilier : la Brume est repoussée puis retenue quelques
    // secondes. Effet COURT — le §27 interdit une victoire permanente.
    if (reactionRestante > 0) {
      reactionRestante -= delta;
      game.setFogZ(Math.max(game.state.fogZ, pz + 120));
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

    if (!franchies.has("FIRST_RESOURCE") && game.state.collected > 0) {
      dire(REPLIQUES.premiere, { duree: 3.6 });
      franchir("FIRST_RESOURCE");
    }

    if (!franchies.has("FIRST_CRAFT_AVAILABLE") && game.canLightFire()) {
      dire(REPLIQUES.craft, { duree: 4 });
      franchir("FIRST_CRAFT_AVAILABLE");
    }

    if (!franchies.has("FIRST_FIRE") && game.state.firesLit > 0) {
      dire(REPLIQUES.feu, { duree: 4 });
      franchir("FIRST_FIRE");
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
      reactionRestante = 9;
      game.setFogZ(player.position.z + 150);
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
    get props() { return props.map((p) => p.name); },
    get acteurs() {
      return acteurs.map((a) => ({ type: a.type, vivant: a.vivant,
        condamne: a.condamne, z: +a.objet.position.z.toFixed(1) }));
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
