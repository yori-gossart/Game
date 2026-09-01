/**
 * FOG NOMAD — CORE TEST 0.3
 *
 * Couche de jeu posée sur le moteur Horizon 0.2. Elle n'en modifie pas le
 * fonctionnement : le moteur l'appelle à quatre endroits (peuplement de chunk,
 * libération de chunk, boucle de rendu, redémarrage) et lui demande un facteur
 * de vitesse.
 *
 * L'hypothèse testée : le compromis entre exploration, avidité, poids du sac et
 * fuite devant une brume mortelle produit-il une boucle intéressante sur
 * quelques minutes ?
 */

import { modeCourant } from "./modes.mjs";

// ---------------------------------------------------------------------------
// Configuration — tout ce qui s'équilibre est ici, et nulle part ailleurs.
// ---------------------------------------------------------------------------

export const CONFIG = {
  fog: {
    // La brume part derrière le joueur et descend l'axe Z à vitesse constante.
    startDistance: 58,      // unités derrière le joueur au départ
    // 4.6 place la charge d'équilibre à 58 % : au-delà, la brume gagne du
    // terrain. À vide le joueur gagne 1.6 u/s, à sac plein il perd 1.75 u/s et
    // se fait rattraper en 33 s depuis la marge initiale.
    // Vitesse de départ, volontairement plus clémente que les 4,6 de la 0.4 :
    // c'est la montée en pression qui borne la run, plus la vitesse initiale.
    speed: 5.2,             // unités/seconde au début de la run
    // --- Pression temporelle (0.5) -----------------------------------------
    // La 0.4 avançait à vitesse constante : un joueur prudent gardait +1,6 u/s
    // indéfiniment et n'était jamais rattrapé. La run ne se terminait que par
    // avidité ou par lassitude.
    //
    // La correction n'est PAS un rappel élastique sur la distance joueur/brume.
    // Un tel rappel punit le bon jeu et se sent immédiatement comme une
    // triche. La pression dépend donc UNIQUEMENT du temps écoulé depuis le
    // début de la run — jamais de la position du joueur, de sa vitesse, ni de
    // son avance. Deux joueurs à la même minute subissent la même brume.
    //
    //   v(t) = speed + speedGain · ((t − pressureDelay) / pressureRamp)^pressureCurve
    //
    // borné à speedMax. Avec les valeurs ci-dessous :
    //
    //   0–1 min   5,20 u/s   grâce : on apprend la carte
    //   3 min     5,88 u/s   encore permissif
    //   5 min     6,68 u/s   la marche à vide ne suffit plus
    //   8 min     7,95 u/s   il faut avoir lâché du poids
    //   12 min    8,45 u/s   dérive lente
    //   20 min    8,88 u/s   plus aucun régime stable
    //
    // Vitesses du joueur, pour référence : 6,2 u/s à vide, 2,85 u/s à sac
    // plein, 11,16 u/s en sprint. Le plafond passe volontairement AU-DESSUS
    // de la marche à vide (croisement à 6 min 20) : sans cela, un joueur qui
    // ne ramasse rien n'est jamais rattrapé, et c'était le défaut de la 0.4.
    // Passé ce point, tenir la distance demande de sprinter, donc du souffle,
    // donc un sac léger. La dernière décision reste au joueur.
    pressureDelay: 45,      // secondes de grâce avant toute montée
    pressureRamp: 450,      // secondes pour aller de 0 à 1 sur la rampe
    pressureCurve: 1.3,     // > 1 : montée douce au début, plus franche ensuite
    speedGain: 3.0,         // unités/seconde ajoutées au bout de la rampe
    // Au-delà de la rampe, la pression continue de monter, très lentement et
    // SANS PLAFOND. Les runs réelles atteignaient 595 unités d'avance ; un
    // palier plat laissait un régime stable où l'avance ne se perdait plus.
    // 0,0009 u/s² ajoute environ 3 unités par heure de jeu — imperceptible sur
    // une minute, décisif sur vingt.
    pressureCreep: 0.0009,
    // Plafond dur. Il vaut exactement speed + speedGain : la rampe l'atteint
    // au bout de pressureDelay + pressureRamp et n'y touche plus. Le laisser
    // au-dessus (8,3 pour un plateau réel de 8,0) en faisait un réglage mort
    // qui décrivait mal le comportement — un test l'a relevé.
    // Garde-fou numérique, pas un plafond de conception : à ce régime plus rien
    // ne peut fuir, sprint compris. Il faudrait près d'une heure pour l'atteindre.
    speedMax: 14,
    damagePerSecond: 32,    // points de vie par seconde passée dedans
    // Corps de la brume : prune très sombre et saturé, pour trancher avec le
    // ciel pâle et le sol vert de la zone sûre.
    color: 0x241a2e,
    // Crête du front, plus claire et malsaine : c'est elle qui dessine la
    // ligne d'arrivée de la brume, visible de loin.
    edgeColor: 0x9d7fb4,
    opacity: 1,
    // Largeur du mur. La portée de vue est d'environ 80 unités : ce mur ne
    // laisse jamais voir ses bords, même après plusieurs minutes de dérive.
    width: 460,
    // Enfoncement sous le terrain : le mur doit sortir du sol, pas flotter.
    // Le dégradé d'opacité est calculé au-dessus de cette limite, sinon la
    // partie visible commence déjà à moitié effacée.
    sink: 11,
    // Dérive lente des nappes, en unités/seconde. Chaque nappe glisse à sa
    // vitesse : la crête composite change de forme sans qu'aucun sommet ne
    // soit recalculé.
    driftSpeed: 1.4,
    // Rappel vers le centre. La dérive s'équilibre à driftSpeed / driftReturn
    // unités, soit environ 28 u pour la nappe la plus rapide : assez pour que
    // la crête change de forme, jamais assez pour découvrir un bord.
    driftReturn: 0.05,
    breathe: 0.9,           // amplitude du souffle vertical, en unités
    // En dessous de cette marge, l'avertissement visuel monte progressivement.
    warnDistance: 22
  },

  player: {
    maxHealth: 100,
    // Vitesse et sprint viennent du moteur ; on n'applique que des facteurs.
    sprintMultiplier: 1.75
  },

  weight: {
    max: 100,
    // Vitesse relative quand le sac est plein. Entre les deux, courbe douce.
    speedAtFull: 0.46,
    curve: 1.35
  },

  stamina: {
    max: 100,
    // 0.5 : à 17, l'alternance sprint/marche donnait un régime soutenable
    // de 7,5 u/s — assez pour distancer la brume indéfiniment avec un sac
    // léger. À 21, le même cycle plafonne nettement plus bas.
    drainBase: 21,          // par seconde, sac vide
    drainPerWeight: 15,     // supplément par seconde à sac plein
    regen: 21,              // par seconde hors sprint
    regenDelay: 0.6,        // secondes avant de récupérer
    minToStart: 10          // seuil pour déclencher un sprint
  },

  collect: {
    radius: 2.7,            // distance de déclenchement
    duration: 0.6,          // secondes de collecte
    slowFactor: 0.32        // vitesse pendant la collecte : le détour coûte
  },

  // Les ressources lointaines valent plus. L'écart latéral est mesuré depuis
  // l'axe de fuite de la run.
  //
  // 0.3 utilisait des bandes dures (lateralMin/lateralMax) : hors bande, aucune
  // pose. Combiné à un axe figé au départ, une run qui dérivait latéralement
  // finissait dans un monde totalement vide — mesuré : 0 ressource dès le
  // 40e chunk sur une diagonale. La probabilité est désormais continue : chaque
  // type culmine à une distance et décroît doucement, sans jamais couper net.
  //
  // 0.5 — le cristal était 24,9 % des ressources générées (mesuré sur 8 734
  // poses, 4 seeds, 3 axes). À ce taux ce n'est plus une trouvaille, c'est du
  // consommable : on en avait toujours un en réserve, et la brume n'était
  // jamais vraiment une menace. Son abondance est passée de 0,36 à 0,070 en 0.5, soit 6,5 % des poses.
  // Les runs réelles montrent encore jusqu'à SEIZE cristaux consommés en une
  // partie : à ce rythme ce n'est pas une trouvaille, c'est une consommable.
  // 0,048 vise 4 à 5 %. La densité globale monte de 0,30 à 0,345 pour que
  // le monde ne se vide pas d'autant : le cristal doit devenir rare, pas les
  // ressources.
  resources: {
    bois:    { label: "Bois",    weight: 7,  value: 1,  color: 0x9c6836,
               lateralPeak: 0,  lateralSpread: 30, abundance: 1.00, size: 0.24 },
    pierre:  { label: "Pierre",  weight: 13, value: 4,  color: 0x8d9299,
               lateralPeak: 32, lateralSpread: 28, abundance: 0.78, size: 0.3 },
    cristal: { label: "Cristal", weight: 5,  value: 18, color: 0x63e8d6,
               lateralPeak: 64, lateralSpread: 32, abundance: 0.048, size: 0.5 },

    // La ration ne pousse pas dans le monde ouvert : `abundance: 0` la retire
    // de l'échantillonnage latéral sans rien changer aux trois cloches
    // existantes (un poids nul ne déplace ni le total ni les proportions).
    // Elle est posée à la main dans les abris — voir poserRation().
    //
    // C'est le seul moyen de récupérer des points de vie : la brume est la
    // seule chose qui en retire, et rien ne les rend. Sans elle, un passage
    // dans la brume grève le reste de la run définitivement. Elle vaut son
    // poids : 6 kg pour 34 points, contre 5 kg pour un cristal qui vaut 18 de
    // valeur. Emporter de quoi se soigner, c'est renoncer à du butin.
    ration:  { label: "Ration",  weight: 6,  value: 2,  color: 0xd8b46a,
               lateralPeak: 0,  lateralSpread: 1,  abundance: 0, size: 0.26,
               soin: 34 }
  },

  // Tentatives de pose par chunk, et densité globale appliquée au poids total.
  spawnAttemptsPerChunk: 9,
  spawnDensity: 0.345,

  // L'axe de fuite suit le joueur, mais lentement : un détour de dix secondes
  // ne déplace l'axe que de neuf unités, donc reste un vrai détour. Une dérive
  // prolongée, elle, finit par emmener le couloir avec elle — sans quoi le
  // monde se vide.
  axisTrackSpeed: 0.9,
  axisMaxLag: 70,

  // Paliers visuels du sac : seuils sur le rapport poids/max.
  bagTiers: [0, 0.18, 0.42, 0.68, 0.88],

  // Le cristal est une ressource d'urgence : le consommer repousse la brume.
  // Dilemme visé : le garder (et porter son poids) ou l'utiliser maintenant.
  crystal: {
    // 0.4 rendait 42 unités pour un cristal qu'on trouvait tous les quatre
    // ramassages : de quoi tenir 300 à 400 unités d'avance en permanence. À
    // 26 unités, un cristal achète environ six secondes de survie à la
    // pression de mi-partie — il sauve une situation, il ne l'installe pas.
    pushDistance: 26,       // unités de marge regagnées
    flashDuration: 0.75,
    waveRadius: 26,         // portée de l'onde visible, en unités
    waveDuration: 0.9,      // secondes
    // Pulsation lente du cristal posé au sol : un point qui respire se repère
    // de loin, là où un objet fixe se confond avec un caillou.
    pulseSpeed: 2.1,
    pulseAmount: 0.42
  },

  // Feu de répit : une seule recette, un seul bouton.
  fire: {
    cost: { bois: 2, pierre: 1 },
    duration: 18,           // secondes — la brume reste la menace principale
    fogSlowFactor: 0.16,    // vitesse de la brume pendant le répit
    staminaBonus: 48,       // récupération de souffle par seconde à proximité
    radius: 7
  },

  // Un objet jeté tombe au sol et reste ramassable tant que son chunk vit.
  drop: {
    scatter: 1.6,           // dispersion autour du joueur
    rearmDelay: 1.4         // délai avant de pouvoir le reprendre
  },

  telemetryKey: "fog-nomad-runs-0.5",
  maxStoredRuns: 20,

  // Au-delà de cet écart latéral, on comptabilise un détour.
  detourThreshold: 24
};

const RESOURCE_KEYS = Object.keys(CONFIG.resources);

/**
 * Poids de chaque type de ressource à une distance latérale donnée.
 * Chaque type culmine à sa distance et décroît en cloche : près de l'axe on
 * trouve surtout du bois, loin surtout des cristaux, et il y a toujours
 * quelque chose entre les deux.
 */
export function lateralWeights(lateral) {
  const weights = {};
  let total = 0;

  for (const key of RESOURCE_KEYS) {
    const spec = CONFIG.resources[key];
    const d = (lateral - spec.lateralPeak) / spec.lateralSpread;
    // Le mode ne redessine pas la carte des ressources : il ne pèse que sur la
    // rareté du cristal. La forme des cloches reste une règle de monde.
    const rarete = key === "cristal" ? modeCourant().crystalAbundance : 1;
    const w = spec.abundance * rarete * Math.exp(-d * d);

    weights[key] = w;
    total += w;
  }

  return { weights, total };
}

/** Vitesse relative en fonction de la charge. Une seule formule, ici. */
/**
 * Vitesse de la brume à un instant de la run.
 *
 * Ne dépend QUE du temps écoulé. Volontairement : le joueur ne doit jamais
 * pouvoir se dire que la brume accélère parce qu'il joue bien. Aucun terme de
 * cette formule ne lit la position du joueur, sa vitesse, sa charge ni son
 * avance.
 *
 * Plate pendant `pressureDelay`, puis montée en puissance sur `pressureRamp`,
 * plafonnée à `speedMax`.
 */
/**
 * Bande de sensation d'une marge donnée. Ce sont des repères de mesure, pas
 * des murs : rien dans le jeu ne force le joueur à rester dans l'une d'elles.
 */
export const FOG_BANDS = [
  { nom: "critique",     max: 30 },
  { nom: "tension",      max: 80 },
  { nom: "confortable",  max: 180 },
  { nom: "avance",       max: 250 },
  { nom: "exceptionnel", max: Infinity }
];

export function bandFor(gap) {
  for (const b of FOG_BANDS) if (gap < b.max) return b.nom;
  return "exceptionnel";
}

export function fogSpeedAt(elapsed) {
  const f = CONFIG.fog;
  const mode = modeCourant();
  const t = Math.max(0, elapsed - f.pressureDelay);

  // Première phase : montée en puissance sur la rampe.
  const ramp = Math.min(1, t / f.pressureRamp);
  let v = (f.speed + f.speedGain * Math.pow(ramp, f.pressureCurve)) * mode.fogSpeed;

  // Seconde phase : au-delà de la rampe, une dérive lente et continue. C'est
  // elle qui interdit un régime stable où l'avance ne se perd plus jamais.
  if (t > f.pressureRamp) v += (t - f.pressureRamp) * f.pressureCreep * mode.fogCreep;

  return Math.min(f.speedMax, v);
}

export function speedFromWeight(ratio) {
  const r = Math.min(1, Math.max(0, ratio));
  return 1 - (1 - CONFIG.weight.speedAtFull) * Math.pow(r, CONFIG.weight.curve);
}

/** Palier visuel du sac (0 à 4) pour un rapport de charge donné. */
export function bagTierFor(ratio) {
  let tier = 0;
  for (let i = 0; i < CONFIG.bagTiers.length; i++) {
    if (ratio >= CONFIG.bagTiers[i]) tier = i;
  }
  return tier;
}

export function createFogNomad(ctx) {
  // `son` est optionnel : chaque appel est protégé, et la logique de jeu ne
  // lit jamais son état. Le jeu doit tourner à l'identique sans lui.
  const { THREE, scene, camera, player, renderer, terrainHeight, onRestart,
          chunkAt, son = {} } = ctx;

  const jouer = (nom) => { try { son[nom]?.(); } catch { /* jamais bloquant */ } };

  // -------------------------------------------------------------------------
  // Ressources : géométries et matériaux partagés, objets individuels.
  //
  // Pas d'InstancedMesh ici. Le rendu instancié des fleurs se corrompait sur le
  // GPU cible (voir AUDIT_PERFORMANCE_BUGS_0.2.md, B0) et rien n'indique que le
  // défaut se limite aux fleurs. Les ressources sont peu nombreuses, doivent
  // disparaître à l'unité quand on les ramasse, et un Mesh ordinaire est le
  // chemin de rendu déjà éprouvé sur l'appareil. Le coût est mesuré, pas supposé.
  // -------------------------------------------------------------------------

  // Chaque ressource doit se reconnaître d'un coup d'œil, et le cristal de loin.
  const resourceGeometries = {
    // Deux rondins croisés posés au sol.
    bois: assemble([
      { geo: new THREE.CylinderGeometry(0.15, 0.17, 1.05, 6), rot: [0, 0, Math.PI / 2], pos: [0, -0.12, 0.1] },
      { geo: new THREE.CylinderGeometry(0.14, 0.16, 0.95, 6), rot: [0, 0.7, Math.PI / 2], pos: [0.04, 0.12, -0.08] }
    ]),
    // Un bloc principal flanqué de deux éclats.
    pierre: assemble([
      { geo: new THREE.DodecahedronGeometry(0.38, 0), scale: [1, 0.78, 1] },
      { geo: new THREE.DodecahedronGeometry(0.2, 0), pos: [0.34, -0.14, 0.14] },
      { geo: new THREE.DodecahedronGeometry(0.15, 0), pos: [-0.3, -0.18, -0.12] }
    ]),
    // Un éclat élancé et deux esquilles : la verticale se repère de loin.
    cristal: assemble([
      { geo: new THREE.OctahedronGeometry(0.34, 0), scale: [0.72, 2.5, 0.72], pos: [0, 0.34, 0] },
      { geo: new THREE.OctahedronGeometry(0.18, 0), scale: [0.7, 1.7, 0.7], rot: [0, 0, 0.42], pos: [0.26, -0.06, 0.06] },
      { geo: new THREE.OctahedronGeometry(0.14, 0), scale: [0.7, 1.5, 0.7], rot: [0, 0, -0.5], pos: [-0.23, -0.12, -0.07] }
    ]),
    // Un ballot sanglé : rien de brillant, rien qui appelle de loin. On ne la
    // trouve qu'en fouillant un abri.
    ration: assemble([
      { geo: new THREE.BoxGeometry(0.42, 0.3, 0.32), pos: [0, 0.02, 0] },
      { geo: new THREE.BoxGeometry(0.44, 0.07, 0.1), pos: [0, 0.03, 0] },
      { geo: new THREE.CylinderGeometry(0.07, 0.07, 0.34, 6), rot: [0, 0, Math.PI / 2], pos: [0, 0.2, 0] }
    ])
  };

  const resourceMaterials = {};
  for (const key of RESOURCE_KEYS) {
    resourceMaterials[key] = new THREE.MeshLambertMaterial({
      color: CONFIG.resources[key].color,
      // Le cristal s'auto-éclaire : c'est ce qui le rend repérable à distance,
      // sans lumière ponctuelle ni post-traitement.
      emissive: key === "cristal" ? 0x2f8f80 : 0x000000,
      emissiveIntensity: 1
    });
  }

  /**
   * Assemble plusieurs primitives en une géométrie unique. Une ressource reste
   * ainsi un seul objet, un seul appel de rendu, tout en ayant une silhouette
   * composée au lieu d'une primitive nue.
   */
  function assemble(parts) {
    const baked = parts.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }) => {
      const g = (geo.index ? geo.toNonIndexed() : geo.clone());
      g.scale(scale[0], scale[1], scale[2]);
      g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]);
      g.translate(pos[0], pos[1], pos[2]);
      return g;
    });

    let total = 0;
    for (const g of baked) total += g.attributes.position.count;

    const position = new Float32Array(total * 3);
    let offset = 0;

    for (const g of baked) {
      position.set(g.attributes.position.array, offset * 3);
      offset += g.attributes.position.count;
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
    merged.computeVertexNormals();
    return merged;
  }

  function faceted(geometry) {
    const result = geometry.index ? geometry.toNonIndexed() : geometry;
    if (result !== geometry) geometry.dispose();
    result.deleteAttribute("uv");
    result.computeVertexNormals();
    return result;
  }

  // Feu de répit : trois bûches croisées et une flamme conique. Géométries et
  // matériaux partagés, objets ordinaires — jamais d'InstancedMesh.
  const logGeometry = faceted(new THREE.CylinderGeometry(0.11, 0.13, 0.85, 5));
  const flameGeometry = faceted(new THREE.ConeGeometry(0.34, 0.95, 6));
  const emberGeometry = faceted(new THREE.DodecahedronGeometry(0.3, 0));

  const logMaterial = new THREE.MeshLambertMaterial({ color: 0x5b3f28 });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb057, fog: true });
  const emberMaterial = new THREE.MeshLambertMaterial({
    color: 0x4a3226, emissive: 0x7a2c10
  });

  function buildFire() {
    const fire = new THREE.Group();

    const embers = new THREE.Mesh(emberGeometry, emberMaterial);
    embers.scale.set(1, 0.4, 1);
    fire.add(embers);

    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(logGeometry, logMaterial);
      log.rotation.set(1.15, (i / 3) * Math.PI * 2, 0);
      log.position.y = 0.2;
      fire.add(log);
    }

    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.position.y = 0.72;
    fire.add(flame);
    fire.userData.flame = flame;

    return fire;
  }

  // -------------------------------------------------------------------------
  // Brume : quatre nappes, aucun shader, aucune texture, aucune particule.
  //
  // Le relief vient de la géométrie (crête ondulée par les couleurs de
  // sommets), la profondeur de l'étagement des nappes en Z, et le mouvement
  // d'une dérive lente de chaque nappe. Un système de particules aurait coûté
  // des milliers de quads pour un résultat moins lisible sur un écran de
  // téléphone.
  // -------------------------------------------------------------------------

  /**
   * Une nappe de brume.
   *
   * Le profil vertical n'est pas un simple dégradé : la nappe est pleinement
   * opaque jusqu'à `crestY`, puis s'efface sur `soft` unités. `crest` fait
   * onduler cette hauteur d'effacement le long du mur — c'est ce qui remplace
   * un bord rectiligne par un front de nuage.
   *
   * Tout est exprimé en unités monde au-dessus du sol, pas en fraction du
   * plan : les quatre nappes ont des hauteurs différentes et doivent pourtant
   * s'empiler de façon prévisible.
   *
   * L'alpha voyage dans un attribut de couleur à 4 composantes — Three.js
   * l'accepte nativement — donc aucun shader et aucune texture.
   */
  function buildFogWall(width, height, options) {
    const {
      baseAlpha = 1,
      crestY = 15,
      soft = 8,
      falloff = 1.2,
      crest = 0,
      phase = 0,
      edgeStrength = 0,
      streak = 0.10,
      floor = 0
    } = options;

    const geometry = new THREE.PlaneGeometry(width, height, 26, 7);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 4);
    const base = new THREE.Color(CONFIG.fog.color);
    const edge = new THREE.Color(CONFIG.fog.edgeColor);

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      // Hauteur au-dessus du sol, en unités monde. La partie enterrée sort
      // négative et reste pleinement opaque, ce qui est exactement voulu.
      const y = position.getY(i) + height / 2 + floor;

      // Deux ondes de périodes incommensurables : la crête ne se répète pas
      // visiblement sur la largeur du mur.
      const billow = crest * (
        Math.sin(x * 0.055 + phase) * 0.62 +
        Math.sin(x * 0.021 - phase * 1.7) * 0.38
      );

      const top = crestY * (1 + billow);
      const k = Math.min(1, Math.max(0, (top - y) / soft));
      const alpha = baseAlpha * Math.pow(k, falloff);

      // Traînées verticales : la brume n'est pas une peinture unie. Deux
      // sinusoïdes croisées suffisent à donner du volume à un plan.
      const veil = 1 + streak *
        Math.sin(x * 0.085 + phase * 2.1) *
        Math.sin(x * 0.031 - phase);

      // La crête s'éclaircit : une vapeur éclairée par le dessus, et surtout
      // une ligne de front repérable au-dessus du corps sombre.
      const mix = edgeStrength * (1 - k);

      colors[i * 4] = (base.r + (edge.r - base.r) * mix) * veil;
      colors[i * 4 + 1] = (base.g + (edge.g - base.g) * mix) * veil;
      colors[i * 4 + 2] = (base.b + (edge.b - base.b) * mix) * veil;
      colors[i * 4 + 3] = alpha;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    geometry.deleteAttribute("uv");
    return geometry;
  }

  const fogMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: CONFIG.fog.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Un matériau transparent double face est rendu en DEUX passes par
    // Three.js (faces arrière puis faces avant) : chaque nappe coûtait deux
    // appels de rendu au lieu d'un. Les nappes sont des plans sans repli sur
    // eux-mêmes : une seule passe donne exactement la même image.
    // Mesuré : 8 appels pour quatre nappes, 4 après.
    forceSinglePass: true,
    fog: false
  });

  const fogGroup = new THREE.Group();

  // Quatre nappes étagées, de la plus lointaine à la plus proche du joueur.
  // Le joueur fuit vers les Z décroissants : une nappe en Z positif est donc
  // *derrière* le mur, une nappe en Z négatif *devant*.
  //
  // `renderOrder` croît vers le joueur pour que le mélange alpha se fasse de
  // l'arrière vers l'avant, indépendamment du tri automatique.
  //
  // `floor` est la hauteur, au-dessus du sol, où commence le plan. Les deux
  // nappes arrière s'arrêtent au niveau du sol au lieu d'être enterrées :
  // sous cette limite la nappe centrale est totalement opaque, donc les
  // fragments dessinés là étaient invisibles. C'est du remplissage gagné pour
  // exactement la même image — un GPU mobile est limité par le remplissage
  // bien avant de l'être par le nombre d'appels.
  const FOG_LAYERS = [
    // Fond : la plus haute, presque opaque — c'est elle qui bouche l'horizon.
    { z: 30, crestY: 27, soft: 13, baseAlpha: 0.86, crest: 0.17,
      edge: 0.08, streak: 0.07, drift: 0.55, order: 3, floor: 0 },
    { z: 14, crestY: 21, soft: 10, baseAlpha: 0.94, crest: 0.25,
      edge: 0.16, streak: 0.10, drift: -0.85, order: 4, floor: 0 },
    // Corps : le mur proprement dit, opaque au niveau des yeux. Lui reste
    // enterré : c'est lui qui doit couvrir les creux du terrain.
    { z: 0, crestY: 15, soft: 8, baseAlpha: 1.00, crest: 0.33,
      edge: 0.30, streak: 0.12, drift: 1.00, order: 5, floor: -CONFIG.fog.sink },
    // Avant-garde : basse et translucide. Elle déborde vers le joueur, avale
    // les objets progressivement au lieu de les couper net, et donne au front
    // une bordure claire lisible même quand le mur remplit l'écran.
    { z: -8, crestY: 7, soft: 5, baseAlpha: 0.55, crest: 0.46,
      edge: 0.62, streak: 0.16, drift: -1.35, order: 6, floor: -CONFIG.fog.sink }
  ];

  const fogLayers = FOG_LAYERS.map((spec, index) => {
    // Le plan doit contenir la crête la plus haute possible : la hauteur se
    // déduit du profil, elle ne se règle pas à la main.
    const height = spec.crestY * (1 + spec.crest) + 3 - spec.floor;

    const mesh = new THREE.Mesh(
      buildFogWall(CONFIG.fog.width, height, {
        baseAlpha: spec.baseAlpha,
        crestY: spec.crestY,
        soft: spec.soft,
        crest: spec.crest,
        phase: index * 1.9,
        edgeStrength: spec.edge,
        streak: spec.streak,
        floor: spec.floor
      }),
      // Un matériau par nappe : leur opacité doit pouvoir varier
      // indépendamment quand l'une d'elles passe devant l'objectif.
      fogMaterial.clone()
    );

    mesh.position.set(0, spec.floor + height / 2, spec.z);
    mesh.renderOrder = spec.order;
    mesh.frustumCulled = false;
    fogGroup.add(mesh);

    return { mesh, baseY: mesh.position.y, drift: spec.drift, phase: index * 1.3 };
  });

  scene.add(fogGroup);

  /**
   * Détail de la brume. En qualité réduite, les deux nappes arrière sont
   * retirées : elles ne portent que de la profondeur, jamais une information
   * de jeu. Le mur reste opaque et sa crête reste lisible, donc le joueur
   * garde exactement la même lecture de la menace.
   */
  function setFogDetail(complet) {
    fogLayers[0].mesh.visible = complet;
    fogLayers[1].mesh.visible = complet;
  }

  /**
   * Variation lente : chaque nappe glisse latéralement à sa propre vitesse et
   * respire verticalement. Comme les crêtes des quatre nappes sont décalées et
   * se croisent, la silhouette du front change en permanence sans qu'aucune
   * géométrie ne soit recalculée. Le mur fait 460 unités de large pour une
   * portée de vue d'environ 80 : la dérive ne découvre jamais ses bords.
   */
  function updateFogVisual(delta) {
    // --- une nappe ne doit jamais s'intercaler entre l'objectif et le joueur
    //
    // La caméra est derrière le personnage : le mur l'atteint donc AVANT lui.
    // Quand cela arrivait, un plan opaque remplissait tout l'écran alors que
    // le joueur était encore vivant et devait choisir où courir — il devenait
    // aveugle au pire moment. Mesuré sur l'appareil : écran entièrement noir
    // à 2 unités de marge, run terminée à 2,2 u/s de moyenne au lieu de 6,2.
    //
    // La caméra se rapproche déjà du joueur quand le front approche (voir
    // distanceCameraUtile() dans main.mjs), mais elle ne peut pas se coller au
    // personnage. Passé ce point, c'est la nappe qui cède : elle s'efface
    // d'autant plus qu'elle est proche de l'objectif.
    const pz = player.position.z;
    const cz = camera ? camera.position.z : pz;
    const versJoueur = pz - cz;

    for (const layer of fogLayers) {
      const worldZ = fogGroup.position.z + layer.mesh.position.z;
      let masque = 1;

      if (Math.abs(versJoueur) > 0.001) {
        // 0 = la nappe est sur l'objectif, 1 = elle est sur le personnage.
        const t = (worldZ - cz) / versJoueur;
        if (t > 0 && t < 1) {
          const p = Math.min(1, t / 0.85);
          masque = p * p;
        }
      }

      layer.mesh.material.opacity = CONFIG.fog.opacity * masque;
    }

    for (const layer of fogLayers) {
      layer.phase += delta;

      // Dérive amortie, intégrée sur le temps et non sur l'image : un
      // amortissement par image donnerait une amplitude différente à 30 et à
      // 60 FPS, donc une brume qui ne bouge pas pareil selon l'appareil.
      const x = layer.mesh.position.x;
      layer.mesh.position.x = x +
        (layer.drift * CONFIG.fog.driftSpeed - x * CONFIG.fog.driftReturn) * delta;

      layer.mesh.position.y = layer.baseY +
        Math.sin(layer.phase * 0.5) * CONFIG.fog.breathe;
    }
  }

  // -------------------------------------------------------------------------
  // Sac visuel : le sac du personnage grossit et reçoit des caisses.
  // -------------------------------------------------------------------------

  const bag = player.userData.bag;
  const bagBaseScale = bag.scale.clone();
  const BAG_BASE_Y = bag.position.y;
  const BAG_BASE_Z = bag.position.z;
  const BAG_HEIGHT = (() => {
    bag.geometry.computeBoundingBox();
    const bb = bag.geometry.boundingBox;
    return bb.max.y - bb.min.y;
  })();

  // Chargement visible : ce qui dépasse du sac aux paliers hauts.
  //
  // Cinq silhouettes, pas cinq tailles. Le sac grossit, mais surtout il se
  // couvre d'objets qui dépassent — bois en travers, pierres sanglées,
  // cristaux qui accrochent la lumière. On doit lire l'avidité du joueur sur
  // son dos, de dos, à treize unités de distance, sans regarder la jauge.
  //
  // Les charges sont filles du PERSONNAGE et non du sac : le sac se met à
  // l'échelle par palier, et des enfants auraient grossi avec lui jusqu'à
  // couvrir la tête. Leur position se recalcule à partir du dessus réel du sac.
  const CHARGE_BOIS = new THREE.MeshLambertMaterial({ color: 0x8a6238 });
  const CHARGE_PIERRE = new THREE.MeshLambertMaterial({ color: 0x8d9299 });
  const CHARGE_CRISTAL = new THREE.MeshLambertMaterial({
    color: 0x63e8d6,
    emissive: 0x1d6f66,
    emissiveIntensity: 0.85
  });
  const CHARGE_TOILE = new THREE.MeshLambertMaterial({ color: 0x6f6a52 });

  const bagCrates = [];

  {
    // Chaque entrée : palier minimal d'apparition, géométrie, matériau,
    // décalage par rapport au dessus du sac, et rotation.
    const rondin = faceted(new THREE.CylinderGeometry(0.055, 0.055, 0.62, 5));
    rondin.rotateZ(Math.PI / 2);

    const charges = [
      // Palier 1 : un rouleau de toile sanglé sur le dessus. Discret.
      { palier: 1, geo: faceted(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 6)),
        mat: CHARGE_TOILE, offset: [0, 0.05, -0.02], rot: [0, 0, Math.PI / 2] },

      // Palier 2 : deux rondins en travers. La silhouette s'élargit.
      { palier: 2, geo: rondin, mat: CHARGE_BOIS,
        offset: [-0.02, 0.16, -0.05], rot: [0.1, 0.16, 0] },
      { palier: 2, geo: rondin.clone(), mat: CHARGE_BOIS,
        offset: [0.03, 0.24, -0.09], rot: [-0.08, -0.22, 0] },

      // Palier 3 : une pierre calée au-dessus, qui déborde vers l'arrière.
      { palier: 3, geo: faceted(new THREE.DodecahedronGeometry(0.16, 0)),
        mat: CHARGE_PIERRE, offset: [-0.16, 0.3, -0.14], rot: [0.4, 0.7, 0.2] },
      { palier: 3, geo: faceted(new THREE.BoxGeometry(0.2, 0.18, 0.16)),
        mat: CHARGE_TOILE, offset: [0.17, 0.28, -0.1], rot: [0, -0.35, 0.12] },

      // Palier 4 : un cristal planté au sommet. Il luit — on voit de loin
      // que ce joueur porte quelque chose qui vaut le détour, et le risque.
      { palier: 4, geo: faceted(new THREE.ConeGeometry(0.075, 0.34, 5)),
        mat: CHARGE_CRISTAL, offset: [0.02, 0.42, -0.06], rot: [0.16, 0.3, 0.14] },
      { palier: 4, geo: faceted(new THREE.ConeGeometry(0.05, 0.22, 5)),
        mat: CHARGE_CRISTAL, offset: [-0.13, 0.38, -0.12], rot: [-0.2, 0.9, -0.26] }
    ];

    for (const c of charges) {
      const mesh = new THREE.Mesh(c.geo, c.mat);
      mesh.rotation.set(c.rot[0], c.rot[1], c.rot[2]);
      mesh.visible = false;
      mesh.userData.offset = c.offset;
      mesh.userData.palier = c.palier;
      player.add(mesh);
      bagCrates.push(mesh);
    }
  }

  // -------------------------------------------------------------------------
  // État de la partie
  // -------------------------------------------------------------------------

  const state = {
    running: false,
    dead: false,
    deathCause: "",
    health: CONFIG.player.maxHealth,
    stamina: CONFIG.stamina.max,
    weight: 0,
    inventory: {},
    fogZ: 0,
    startZ: 0,
    startX: 0,
    axisX: 0,
    elapsed: 0,
    distance: 0,
    maxWeight: 0,
    collected: 0,
    dropped: 0,
    sprintTime: 0,
    // Sursis déjà consommés dans cette run (voir die()). Toujours 0 en NORMAL.
    sursis: 0,
    rationsMangees: 0,
    minFogGap: Infinity,
    maxFogGap: 0,
    gapSum: 0,
    gapSamples: 0,
    timeAbove200: 0,
    timeBelow50: 0,
    // Bandes de sensation (0.5). On mesure le temps passé dans chacune pour
    // savoir où une run se déroule réellement, au lieu de le supposer.
    bands: { critique: 0, tension: 0, confortable: 0, avance: 0, exceptionnel: 0 },
    fogSpeed: 0,
    detours: 0,
    inFog: false,
    fires: 0,
    fireUntil: 0,
    pulses: 0,
    firesLit: 0,
    flashUntil: 0,
    collecting: null,
    collectProgress: 0,
    sinceSprint: 0,
    wasFarLateral: false
  };

  // Ressources actives, groupées par chunk pour être libérées avec lui.
  const chunkResources = new Map();
  const activeResources = new Set();

  // Diagnostic de génération : sert à vérifier que les ressources continuent
  // d'apparaître sur toute la durée d'une run, pas seulement au départ.
  const spawnStats = {
    chunksPeuples: 0,
    chunksVides: 0,
    generees: 0,
    detruitesAvecChunk: 0,
    ramassees: 0,
    rejetsCouloir: 0,
    rejetsEau: 0,
    parType: {},
    dernierChunk: null
  };

  function resetRun() {
    state.running = true;
    state.dead = false;
    state.deathCause = "";
    state.health = CONFIG.player.maxHealth;
    state.stamina = CONFIG.stamina.max;
    state.weight = 0;
    state.inventory = {};
    for (const key of RESOURCE_KEYS) state.inventory[key] = 0;
    state.startZ = player.position.z;
    state.startX = player.position.x;
    state.axisX = player.position.x;
    state.fogZ = player.position.z + CONFIG.fog.startDistance;
    state.elapsed = 0;
    state.distance = 0;
    state.maxWeight = 0;
    state.collected = 0;
    state.dropped = 0;
    state.sprintTime = 0;
    state.sursis = 0;
    state.rationsMangees = 0;
    state.minFogGap = Infinity;
    state.maxFogGap = 0;
    state.gapSum = 0;
    state.gapSamples = 0;
    state.timeAbove200 = 0;
    state.timeBelow50 = 0;
    state.bands = { critique: 0, tension: 0, confortable: 0, avance: 0, exceptionnel: 0 };
    state.fogSpeed = fogSpeedAt(0);
    state.detours = 0;
    state.inFog = false;
    state.fires = 0;
    state.fireUntil = 0;
    state.pulses = 0;
    state.firesLit = 0;
    state.flashUntil = 0;
    state.collecting = null;
    state.collectProgress = 0;
    state.sinceSprint = 0;
    state.wasFarLateral = false;
    updateBagVisual();
  }

  // -------------------------------------------------------------------------
  // Peuplement des chunks
  // -------------------------------------------------------------------------

  function populateChunk(group, key, cx, cz, centerX, centerZ, random01) {
    const placed = [];
    const axisX = currentAxisX();
    let rejetsCouloir = 0;
    let rejetsEau = 0;

    for (let i = 0; i < CONFIG.spawnAttemptsPerChunk; i++) {
      const localX = (random01(cx * 71 + i * 13, cz * 29 + i * 7, 223) - 0.5) * (32 - 4);
      const localZ = (random01(cx * 19 - i * 11, cz * 83 + i * 5, 227) - 0.5) * (32 - 4);
      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;

      // Écart latéral à l'axe de fuite : il décide de la NATURE de la ressource,
      // plus de son existence. Loin de l'axe, on trouve surtout des cristaux ;
      // près de l'axe, surtout du bois.
      const lateral = Math.abs(worldX - axisX);
      const { weights, total } = lateralWeights(lateral);

      const roll = random01(cx * 31 + i * 17, cz * 47 - i * 23, 211);
      const densite = CONFIG.spawnDensity * modeCourant().resourceDensity;
      if (roll > Math.min(1, total * densite)) { rejetsCouloir++; continue; }

      // Second tirage : quel type, proportionnellement aux poids.
      let pick = random01(cx * 13 - i * 29, cz * 61 + i * 11, 233) * total;
      let chosen = RESOURCE_KEYS[0];

      for (const key2 of RESOURCE_KEYS) {
        pick -= weights[key2];
        if (pick <= 0) { chosen = key2; break; }
      }

      const spec = CONFIG.resources[chosen];
      const y = terrainHeight(worldX, worldZ);
      if (y < -2.2) { rejetsEau++; continue; }

      const mesh = new THREE.Mesh(resourceGeometries[chosen], resourceMaterials[chosen]);
      mesh.position.set(localX, y + spec.size, localZ);
      mesh.rotation.y = random01(cx + i, cz - i, 229) * Math.PI * 2;
      mesh.userData.kind = "ressources";
      mesh.userData.resource = {
        type: chosen,
        worldX,
        worldZ,
        baseY: y + spec.size,
        chunkKey: key
      };

      group.add(mesh);
      placed.push(mesh);
      activeResources.add(mesh);
    }

    // On COMPLÈTE le registre du chunk au lieu de l'écraser : un objet peut y
    // avoir été posé avant l'appel — c'est le cas de la ration, placée par le
    // moteur au moment où il bâtit un abri. Un `set` orphelinait alors la
    // ration : encore comptée active, plus jamais listée, donc jamais libérée
    // avec son chunk. Le contrôle `ressourcesListees === ressourcesActives` de
    // tests/fog04.mjs l'a attrapé.
    if (placed.length > 0) {
      const deja = chunkResources.get(key);
      if (deja) deja.push(...placed);
      else chunkResources.set(key, placed);
    }

    spawnStats.generees += placed.length;
    spawnStats.rejetsCouloir += rejetsCouloir;
    spawnStats.rejetsEau += rejetsEau;
    if (placed.length > 0) spawnStats.chunksPeuples++; else spawnStats.chunksVides++;
    for (const mesh of placed) {
      const t = mesh.userData.resource.type;
      spawnStats.parType[t] = (spawnStats.parType[t] || 0) + 1;
    }
    spawnStats.dernierChunk = {
      key, poses: placed.length, rejetsCouloir, rejetsEau,
      lateralChunk: +Math.abs(centerX - axisX).toFixed(1)
    };
  }

  function onChunkDisposed(key) {
    // Les feux du chunk s'éteignent avec lui : avalé par la brume, il n'en
    // reste rien. C'est la même règle que pour les objets jetés.
    const fires = chunkFires.get(key);
    if (fires) {
      for (const fire of fires) activeFires.delete(fire);
      chunkFires.delete(key);
      state.fires = activeFires.size;
    }

    const list = chunkResources.get(key);
    if (!list) return;

    for (const mesh of list) activeResources.delete(mesh);
    spawnStats.detruitesAvecChunk += list.length;
    chunkResources.delete(key);
  }

  function removeResource(mesh) {
    activeResources.delete(mesh);
    if (mesh.parent) mesh.parent.remove(mesh);

    const list = chunkResources.get(mesh.userData.resource.chunkKey);
    if (list) {
      const index = list.indexOf(mesh);
      if (index !== -1) list.splice(index, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Sac : poids, collecte, abandon
  // -------------------------------------------------------------------------

  /**
   * Axe de fuite effectif : la dérive lente est appliquée dans update(), mais
   * le retard est borné ici, à l'usage. Un saut de position ne peut donc pas
   * laisser le couloir de ressources loin derrière le joueur.
   */
  function currentAxisX() {
    const lag = player.position.x - state.axisX;

    if (Math.abs(lag) > CONFIG.axisMaxLag) {
      state.axisX = player.position.x - Math.sign(lag) * CONFIG.axisMaxLag;
    }

    return state.axisX;
  }

  function weightRatio() {
    return state.weight / CONFIG.weight.max;
  }

  function canCarry(type) {
    return state.weight + CONFIG.resources[type].weight <= CONFIG.weight.max;
  }

  function addToBag(type) {
    state.inventory[type] = (state.inventory[type] || 0) + 1;
    state.weight += CONFIG.resources[type].weight;
    state.collected++;
    spawnStats.ramassees++;
    state.maxWeight = Math.max(state.maxWeight, state.weight);
    updateBagVisual();
    jouer("collecte");
  }

  /**
   * Jeter un objet le pose au sol près du joueur, dans le chunk courant. Il
   * reste ramassable tant que ce chunk vit ; avalé par la brume ou évacué par
   * le streaming, il est perdu. C'est la règle la plus simple qui évite une
   * mémoire de monde infinie.
   */
  function dropOne(type) {
    if (!state.inventory[type]) return false;

    state.inventory[type]--;
    state.weight = Math.max(0, state.weight - CONFIG.resources[type].weight);
    state.dropped++;
    updateBagVisual();
    jouer("jeter");

    const entry = chunkAt ? chunkAt(player.position.x, player.position.z) : null;
    if (entry) {
      const spread = CONFIG.drop.scatter;
      const worldX = player.position.x + (Math.random() - 0.5) * spread * 2;
      const worldZ = player.position.z + (Math.random() - 0.5) * spread * 2;
      spawnResourceMesh(entry.group, entry.key, type, worldX, worldZ,
                        CONFIG.drop.rearmDelay, true);
    }

    return true;
  }

  /**
   * Pose une ressource dans un chunk. Sert à la génération procédurale comme
   * aux objets jetés : même rendu, même cycle de vie, même ramassage.
   */
  function spawnResourceMesh(group, key, type, worldX, worldZ, delay = 0, jete = false) {
    const spec = CONFIG.resources[type];
    const y = terrainHeight(worldX, worldZ);
    const mesh = new THREE.Mesh(resourceGeometries[type], resourceMaterials[type]);

    mesh.position.set(worldX - group.position.x, y + spec.size, worldZ - group.position.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.userData.kind = "ressources";
    mesh.userData.resource = {
      type, worldX, worldZ, baseY: y + spec.size, chunkKey: key,
      readyAt: state.elapsed + delay,
      jete
    };

    group.add(mesh);
    activeResources.add(mesh);

    const list = chunkResources.get(key);
    if (list) list.push(mesh); else chunkResources.set(key, [mesh]);

    return mesh;
  }

  // Feux allumés : suivis à part pour expirer et pour être oubliés avec leur
  // chunk, comme les ressources.
  const activeFires = new Set();
  const chunkFires = new Map();

  function canLightFire() {
    for (const [type, need] of Object.entries(CONFIG.fire.cost)) {
      if ((state.inventory[type] || 0) < need) return false;
    }
    return !state.dead;
  }

  function lightFire() {
    if (!canLightFire()) return false;

    for (const [type, need] of Object.entries(CONFIG.fire.cost)) {
      state.inventory[type] -= need;
      state.weight = Math.max(0, state.weight - CONFIG.resources[type].weight * need);
    }
    updateBagVisual();

    const entry = chunkAt ? chunkAt(player.position.x, player.position.z) : null;
    if (!entry) return false;

    const fire = buildFire();
    fire.position.set(
      player.position.x - entry.group.position.x,
      terrainHeight(player.position.x, player.position.z),
      player.position.z - entry.group.position.z
    );
    fire.userData.kind = "feux";
    fire.userData.fire = {
      until: state.elapsed + CONFIG.fire.duration,
      worldX: player.position.x,
      worldZ: player.position.z,
      chunkKey: entry.key
    };

    entry.group.add(fire);
    activeFires.add(fire);

    const list = chunkFires.get(entry.key);
    if (list) list.push(fire); else chunkFires.set(entry.key, [fire]);

    state.firesLit++;
    state.fireUntil = Math.max(state.fireUntil, fire.userData.fire.until);
    jouer("feu");
    emit();
    return true;
  }

  function canPulse() {
    return !state.dead && (state.inventory.cristal || 0) > 0;
  }

  /** Consomme un cristal : la brume est repoussée d'un coup. */
  function usePulse() {
    if (!canPulse()) return false;

    state.inventory.cristal--;
    state.weight = Math.max(0, state.weight - CONFIG.resources.cristal.weight);
    state.fogZ += CONFIG.crystal.pushDistance;
    state.pulses++;
    state.flashUntil = state.elapsed + CONFIG.crystal.flashDuration;

    jouer("cristal");

    // L'onde repart de zéro même si deux cristaux s'enchaînent.
    ondeT = 0;
    onde.visible = true;
    onde.scale.setScalar(1.5);

    updateBagVisual();
    emit();
    return true;
  }

  // -------------------------------------------------------------------------
  // Ration : le seul soin du jeu.
  // -------------------------------------------------------------------------

  function canEat() {
    return !state.dead &&
           (state.inventory.ration || 0) > 0 &&
           state.health < CONFIG.player.maxHealth;
  }

  /**
   * Manger une ration. Refusée à pleine santé : sinon on la gaspille d'une
   * mauvaise pression sur un bouton, et le joueur perd la seule ressource qui
   * pouvait le sauver plus tard.
   */
  function eatRation() {
    if (!canEat()) return false;

    const spec = CONFIG.resources.ration;
    state.inventory.ration--;
    state.weight = Math.max(0, state.weight - spec.weight);
    state.health = Math.min(CONFIG.player.maxHealth, state.health + spec.soin);
    state.rationsMangees++;

    jouer("collecte");
    updateBagVisual();
    emit();
    return true;
  }

  /**
   * Pose une ration dans un abri. Appelée par le moteur au moment où il bâtit
   * une structure : c'est la seule origine de cet objet dans le monde.
   *
   * Déterministe — le tirage vient du moteur, pas de Math.random() — pour que
   * la même graine reconstruise le même monde.
   */
  function poserRation(group, cle, worldX, worldZ) {
    if (terrainHeight(worldX, worldZ) < -1.2) return null;
    return spawnResourceMesh(group, cle, "ration", worldX, worldZ);
  }

  // Onde de cristal : un anneau plat qui part du joueur, s'élargit et
  // s'efface. Un seul objet réutilisé, invisible au repos — le joueur doit
  // VOIR la brume être repoussée, pas seulement lire un compteur qui remonte.
  const onde = (() => {
    const geometry = new THREE.RingGeometry(0.86, 1, 40);
    geometry.rotateX(-Math.PI / 2);
    geometry.deleteAttribute("uv");

    const material = new THREE.MeshBasicMaterial({
      color: 0x9df3e6,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      forceSinglePass: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 7;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  })();

  let ondeT = 0;

  function updateOnde(delta) {
    if (!onde.visible) return;

    ondeT += delta;
    const duree = CONFIG.crystal.waveDuration;
    const t = ondeT / duree;

    if (t >= 1) { onde.visible = false; return; }

    // Départ vif puis ralentissement : une onde qui décélère se lit mieux
    // qu'une expansion linéaire.
    const rayon = 1.5 + Math.pow(t, 0.55) * CONFIG.crystal.waveRadius;
    onde.scale.setScalar(rayon);
    onde.position.set(player.position.x, player.position.y + 0.35, player.position.z);
    onde.material.opacity = (1 - t) * 0.85;
  }

  /** Les cristaux tournent lentement : un point mouvant se repère de loin. */
  function spinCrystals(delta) {
    // Le cristal tourne ET respire : son auto-éclairage monte et descend
    // lentement. Cela le distingue d'un rocher à trente unités, ce qui est
    // exactement la distance à laquelle il faut décider du détour.
    const pulse = 1 + Math.sin(state.elapsed * CONFIG.crystal.pulseSpeed) *
                      CONFIG.crystal.pulseAmount;
    resourceMaterials.cristal.emissiveIntensity = pulse;

    for (const mesh of activeResources) {
      if (mesh.userData.resource.type === "cristal") mesh.rotation.y += delta * 0.9;
    }
  }

  function updateFires(delta) {
    let anyActive = false;

    for (const fire of [...activeFires]) {
      const info = fire.userData.fire;

      if (state.elapsed >= info.until) {
        removeFire(fire);
        continue;
      }

      anyActive = true;

      // Flamme vacillante : une mise à l'échelle, pas un système de particules.
      const flame = fire.userData.flame;
      const flicker = 0.85 + Math.sin(state.elapsed * 11 + info.worldX) * 0.15;
      flame.scale.set(flicker, 1 + (1 - flicker) * 1.6, flicker);

      const dist = Math.hypot(
        info.worldX - player.position.x,
        info.worldZ - player.position.z
      );

      if (dist < CONFIG.fire.radius) {
        state.stamina = Math.min(
          CONFIG.stamina.max,
          state.stamina + CONFIG.fire.staminaBonus * delta
        );
      }
    }

    state.fires = activeFires.size;
    return anyActive;
  }

  function removeFire(fire) {
    activeFires.delete(fire);
    if (fire.parent) fire.parent.remove(fire);

    const list = chunkFires.get(fire.userData.fire.chunkKey);
    if (list) {
      const index = list.indexOf(fire);
      if (index !== -1) list.splice(index, 1);
    }
  }

  function updateBagVisual() {
    const ratio = Math.min(1, weightRatio());
    const tier = bagTierFor(ratio);

    // Le sac gonfle par paliers, et surtout s'épaissit vers l'arrière : de
    // profil comme de dos, la charge se lit sur la silhouette.
    // La charge s'empile surtout vers l'arrière et le haut. La croissance est
    // bornée : au dernier palier le sac doit rester un sac sur un dos, pas un
    // bloc qui avale les bras et les jambes de la silhouette.
    // Le gonflement est plus discret qu'en 0.4 : ce sont désormais les charges
    // qui dépassent qui portent la lecture, et un sac qui doublait de largeur
    // effaçait complètement la silhouette du personnage.
    bag.scale.set(
      bagBaseScale.x * (1 + tier * 0.08),
      bagBaseScale.y * (1 + tier * 0.11),
      bagBaseScale.z * (1 + tier * 0.28)
    );
    bag.position.y = BAG_BASE_Y + tier * 0.03;
    bag.position.z = BAG_BASE_Z - tier * 0.05;

    // Les charges se posent sur le dessus réel du sac gonflé, à taille
    // constante : elles restent lisibles et ne masquent jamais la tête.
    const top = bag.position.y + (BAG_HEIGHT * bag.scale.y) / 2;

    for (const charge of bagCrates) {
      const [ox, oy, oz] = charge.userData.offset;
      charge.position.set(ox, top + oy, bag.position.z + oz);
      charge.visible = tier >= charge.userData.palier;
    }
  }

  // -------------------------------------------------------------------------
  // Boucle
  // -------------------------------------------------------------------------

  const listeners = { change: [] };
  function emit() { for (const fn of listeners.change) fn(state); }

  function speedFactor() {
    let factor = speedFromWeight(weightRatio());
    if (state.collecting) factor *= CONFIG.collect.slowFactor;
    if (state.dead) factor = 0;
    return factor;
  }

  function canSprint() {
    if (state.dead) return false;
    return state.stamina > CONFIG.stamina.minToStart;
  }

  function update(delta, moving, sprinting) {
    if (!state.running || state.dead) return;

    state.elapsed += delta;

    // --- feux de répit ---
    const sheltered = updateFires(delta);

    // --- brume ---
    // Un feu allumé la ralentit fortement, mais ne l'arrête jamais.
    const speed = fogSpeedAt(state.elapsed) *
      (sheltered ? CONFIG.fire.fogSlowFactor : 1);

    state.fogSpeed = speed;
    state.fogZ -= speed * delta;

    fogGroup.position.set(player.position.x, 0, state.fogZ);
    updateFogVisual(delta);

    const gap = state.fogZ - player.position.z;
    state.minFogGap = Math.min(state.minFogGap, gap);
    state.maxFogGap = Math.max(state.maxFogGap, gap);
    state.gapSum += gap;
    state.gapSamples++;
    if (gap > 200) state.timeAbove200 += delta;
    if (gap < 50) state.timeBelow50 += delta;
    state.bands[bandFor(gap)] += delta;
    state.inFog = gap <= 0;

    if (state.inFog) {
      state.health -= CONFIG.fog.damagePerSecond * modeCourant().damage * delta;

      if (state.health <= 0) {
        state.health = 0;
        die("Rattrapé par la brume");
        return;
      }
    }

    // --- axe de fuite ---
    // Il rattrape le joueur trop lentement pour annuler un détour, mais assez
    // pour qu'une dérive prolongée ne laisse pas le joueur dans un monde vide.
    const drift = player.position.x - state.axisX;
    state.axisX += Math.sign(drift) *
      Math.min(Math.abs(drift), CONFIG.axisTrackSpeed * delta);
    currentAxisX();

    // --- distance et détours ---
    state.distance = Math.max(state.distance, state.startZ - player.position.z);

    const lateral = Math.abs(player.position.x - currentAxisX());
    const far = lateral > CONFIG.detourThreshold;
    if (far && !state.wasFarLateral) state.detours++;
    state.wasFarLateral = far;

    // --- endurance ---
    if (sprinting && moving) {
      const drain = CONFIG.stamina.drainBase +
        CONFIG.stamina.drainPerWeight * weightRatio();

      state.stamina = Math.max(0, state.stamina - drain * delta);
      state.sprintTime += delta;
      state.sinceSprint = 0;
    } else {
      state.sinceSprint += delta;

      if (state.sinceSprint > CONFIG.stamina.regenDelay) {
        state.stamina = Math.min(
          CONFIG.stamina.max,
          state.stamina + CONFIG.stamina.regen * delta
        );
      }
    }

    // Le visuel du sac suit l'état à chaque image : trois mises à l'échelle,
    // et plus aucun risque de désynchronisation selon la façon dont le poids
    // a changé.
    updateBagVisual();

    spinCrystals(delta);
    updateOnde(delta);
    updateCollection(delta);
    emit();
  }

  function updateCollection(delta) {
    // La cible reste valable tant qu'elle est proche et que le sac peut la prendre.
    if (state.collecting) {
      const mesh = state.collecting;
      const spec = mesh.userData.resource;
      const dist = Math.hypot(
        spec.worldX - player.position.x,
        spec.worldZ - player.position.z
      );

      if (!activeResources.has(mesh) || dist > CONFIG.collect.radius * 1.4) {
        state.collecting = null;
        state.collectProgress = 0;
        return;
      }

      state.collectProgress += delta / CONFIG.collect.duration;

      if (state.collectProgress >= 1) {
        addToBag(spec.type);
        removeResource(mesh);
        state.collecting = null;
        state.collectProgress = 0;
      }
      return;
    }

    let best = null;
    let bestDist = CONFIG.collect.radius;

    for (const mesh of activeResources) {
      const spec = mesh.userData.resource;
      const dist = Math.hypot(
        spec.worldX - player.position.x,
        spec.worldZ - player.position.z
      );

      if (spec.readyAt !== undefined && state.elapsed < spec.readyAt) continue;
      if (dist < bestDist && canCarry(spec.type)) {
        best = mesh;
        bestDist = dist;
      }
    }

    if (best) {
      state.collecting = best;
      state.collectProgress = 0;
    }
  }

  function die(cause) {
    if (state.dead) return;

    // Sursis de mode. NORMAL en accorde zéro : la mort termine la run. Le
    // point de lecture existe pour que le jour où un mode en accorde un, il
    // n'y ait rien à réécrire ici.
    if (state.sursis < modeCourant().viesSupplementaires) {
      state.sursis++;
      state.health = CONFIG.player.maxHealth * 0.4;
      state.fogZ = player.position.z + CONFIG.fog.warnDistance;
      state.inFog = false;
      emit();
      return;
    }

    jouer("mort");
    state.dead = true;
    state.running = false;
    state.deathCause = cause;
    state.collecting = null;
    storeRun();
    emit();
  }

  function restart() {
    for (const mesh of [...activeResources]) removeResource(mesh);
    for (const fire of [...activeFires]) removeFire(fire);
    chunkResources.clear();
    activeResources.clear();
    chunkFires.clear();
    activeFires.clear();

    if (onRestart) onRestart();
    resetRun();
    emit();
  }

  // -------------------------------------------------------------------------
  // Télémétrie locale — aucun envoi, aucun serveur.
  // -------------------------------------------------------------------------

  function storeRun() {
    const record = {
      date: new Date().toISOString(),
      duree: +state.elapsed.toFixed(1),
      distance: Math.round(state.distance),
      ramassees: state.collected,
      jetees: state.dropped,
      poidsMax: Math.round(state.maxWeight),
      tempsSprint: +state.sprintTime.toFixed(1),
      margeBrumeMin: Number.isFinite(state.minFogGap) ? Math.round(state.minFogGap) : null,
      detours: state.detours,
      cause: state.deathCause,
      valeur: valueCarried(),
      cristauxUtilises: state.pulses,
      feuxAllumes: state.firesLit,
      rationsMangees: state.rationsMangees,
      margeMax: Math.round(state.maxFogGap),
      margeMoyenne: state.gapSamples ? Math.round(state.gapSum / state.gapSamples) : null,
      tempsAuDessus200: +state.timeAbove200.toFixed(1),
      tempsSous50: +state.timeBelow50.toFixed(1),
      bandes: Object.fromEntries(
        Object.entries(state.bands).map(([k, v]) => [k, +v.toFixed(1)])
      ),
      vitesseBrumeFinale: +fogSpeedAt(state.elapsed).toFixed(2)
    };

    try {
      const raw = localStorage.getItem(CONFIG.telemetryKey);
      const runs = raw ? JSON.parse(raw) : [];
      runs.push(record);
      localStorage.setItem(
        CONFIG.telemetryKey,
        JSON.stringify(runs.slice(-CONFIG.maxStoredRuns))
      );
    } catch {
      // La télémétrie est un confort de test, jamais un service essentiel.
    }

    return record;
  }

  function storedRuns() {
    try {
      const raw = localStorage.getItem(CONFIG.telemetryKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function valueCarried() {
    let total = 0;
    for (const key of RESOURCE_KEYS) {
      total += (state.inventory[key] || 0) * CONFIG.resources[key].value;
    }
    return total;
  }

  resetRun();

  return {
    CONFIG,
    config: CONFIG,
    state,
    populateChunk,
    onChunkDisposed,
    update,
    speedFactor,
    canSprint,
    restart,
    dropOne,
    canLightFire,
    lightFire,
    canPulse,
    usePulse,
    canEat,
    eatRation,
    poserRation,
    get fireCount() { return activeFires.size; },
    die,
    weightRatio,
    valueCarried,
    storedRuns,
    bagTier: () => bagTierFor(Math.min(1, weightRatio())),
    onChange: (fn) => listeners.change.push(fn),
    playerZ: () => player.position.z,
    playerX: () => player.position.x,
    get fogGap() { return state.fogZ - player.position.z; },
    get fogSpeed() { return fogSpeedAt(state.elapsed); },
    get bands() { return state.bands; },
    get resourceCount() { return activeResources.size; },
    get resourceObjects() { return [...activeResources]; },
    // Ce qui doit rester borné d'une run à l'autre : les deux registres par
    // chunk, pas seulement les objets qu'ils contiennent. Un registre qui
    // grossit sans fin est une fuite même si la scène reste propre.
    get bookkeeping() {
      let listees = 0;
      for (const list of chunkResources.values()) listees += list.length;
      return {
        chunksAvecRessources: chunkResources.size,
        ressourcesListees: listees,
        ressourcesActives: activeResources.size,
        chunksAvecFeu: chunkFires.size,
        feuxActifs: activeFires.size,
        jetesAuSol: [...activeResources]
          .filter((m) => m.userData.resource.jete).length
      };
    },
    setFogZ: (z) => { state.fogZ = z; },
    setFogDetail,
    get spawnStats() { return spawnStats; },
    get axisX() { return currentAxisX(); },
    resetSpawnStats() {
      spawnStats.chunksPeuples = 0; spawnStats.chunksVides = 0;
      spawnStats.generees = 0; spawnStats.detruitesAvecChunk = 0;
      spawnStats.ramassees = 0; spawnStats.rejetsCouloir = 0;
      spawnStats.rejetsEau = 0; spawnStats.parType = {};
    },
    resetRun
  };
}
