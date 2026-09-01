/**
 * FOG NOMAD — MONDE VIVANT
 *
 * Cabanes, nomades et animaux. Trois choses qui bougent ou qui racontent, et
 * qui doivent tenir dans le budget d'un téléphone.
 *
 * Règles suivies partout dans ce module :
 *
 * 1. AUCUNE INSTANCIATION. Le bois mort de la 0.5 et les fleurs de la 0.2 ont
 *    produit le même artefact de grands polygones noirs sur l'appareil cible,
 *    sans que le mécanisme ait jamais été expliqué. Tout ce qui est nouveau
 *    passe par des Mesh ordinaires à géométrie partagée — le seul chemin qui
 *    n'ait jamais échoué. Voir AUDIT_PERFORMANCE_BUGS_0.2.md, B0 et B0 bis.
 *
 * 2. Les comportements ne tournent PAS à 60 Hz. Un lapin qui décide de sa
 *    direction six fois par seconde est indiscernable d'un lapin qui la décide
 *    soixante fois, et coûte dix fois moins.
 *
 * 3. Tout meurt avec son chunk. Aucun registre ne survit à la zone qui l'a
 *    engendré, sinon une longue run finit par traîner des milliers d'entités.
 */

export const LIVING = {
  // Fréquence de décision des comportements, en Hz. Les animaux lointains
  // tombent à `hzLoin`.
  hzProche: 8,
  hzLoin: 1.5,
  distanceLoin: 45,

  // Au-delà, on ne met plus rien à jour du tout : l'entité est hors de vue et
  // hors de portée de la brume.
  distanceGel: 95,

  animal: {
    vitesse: 3.1,
    vitesseFuite: 7.4,
    rayonFuite: 11,        // distance à laquelle le joueur fait fuir
    rayonErrance: 9,       // amplitude de la promenade au repos
    margeBrume: 26         // en dessous, l'animal fuit vers l'avant
  },

  oiseau: {
    vitesse: 5.5,
    vitesseFuite: 13,
    rayonEnvol: 15,
    hauteurVol: 9,
    hauteurRepos: 0.35
  },

  nomade: {
    vitesse: 2.6,
    vitesseFuite: 5.4,
    margeBrume: 55,        // le nomade sent la brume de plus loin que l'animal
    pauseMin: 2.5,
    pauseMax: 7
  }
};

/**
 * Crée la couche vivante. Elle reçoit du moteur ce dont elle a besoin et ne
 * connaît rien d'autre.
 */
export function createLiving(ctx) {
  const { THREE, scene, player, faceted, mergeGeometries, contaminable } = ctx;

  // -------------------------------------------------------------------------
  // Matériaux — partagés, comme partout ailleurs.
  // -------------------------------------------------------------------------
  const M = {
    bois: contaminable(new THREE.MeshLambertMaterial({ color: 0x6b4b2e })),
    boisClair: contaminable(new THREE.MeshLambertMaterial({ color: 0x8a6740 })),
    toit: contaminable(new THREE.MeshLambertMaterial({ color: 0x4a3b2c })),
    toile: contaminable(new THREE.MeshLambertMaterial({ color: 0x7d7558 })),
    pierre: contaminable(new THREE.MeshLambertMaterial({ color: 0x6e6656 })),
    // Le nomade porte la même écharpe que le joueur : on comprend d'un coup
    // d'œil que c'est quelqu'un comme nous.
    manteau: contaminable(new THREE.MeshLambertMaterial({ color: 0x3a3346 })),
    echarpe: contaminable(new THREE.MeshLambertMaterial({ color: 0xb4614a })),
    peau: contaminable(new THREE.MeshLambertMaterial({ color: 0xc79b76 })),
    fourrure: contaminable(new THREE.MeshLambertMaterial({ color: 0x9c7a58 })),
    fourrureSombre: contaminable(new THREE.MeshLambertMaterial({ color: 0x5f4b3a })),
    plume: contaminable(new THREE.MeshLambertMaterial({ color: 0x3c3a42 }))
  };

  /** Assemble des primitives en une géométrie unique, comme ailleurs. */
  function assembler(parts) {
    const geos = parts.map(({ geo, pos, rot, scale }) => {
      if (scale) geo.scale(scale[0], scale[1], scale[2]);
      if (rot) { geo.rotateX(rot[0]); geo.rotateY(rot[1]); geo.rotateZ(rot[2]); }
      if (pos) geo.translate(pos[0], pos[1], pos[2]);
      return geo;
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    return faceted(merged);
  }

  // -------------------------------------------------------------------------
  // Cabanes — trois états d'une même idée
  // -------------------------------------------------------------------------

  // Proportions : la cabane doit dominer un personnage de deux unités, sans
  // quoi elle se lit comme une caisse. Faîte à 3,1 unités.
  const CAB = { largeur: 2.9, profondeur: 2.5, mur: 2.05 };

  /** Corps commun : quatre murs et un plancher, façade percée d'une porte. */
  function corpsCabane(hauteur) {
    const L = CAB.largeur / 2;
    const P = CAB.profondeur / 2;

    return [
      { geo: new THREE.BoxGeometry(CAB.largeur, 0.18, CAB.profondeur), pos: [0, 0.09, 0] },
      { geo: new THREE.BoxGeometry(CAB.largeur, hauteur, 0.16), pos: [0, hauteur / 2, -P] },
      { geo: new THREE.BoxGeometry(0.16, hauteur, CAB.profondeur), pos: [-L, hauteur / 2, 0] },
      { geo: new THREE.BoxGeometry(0.16, hauteur, CAB.profondeur), pos: [L, hauteur / 2, 0] },
      // Façade percée : deux jambages et un linteau, donc une porte.
      { geo: new THREE.BoxGeometry(0.92, hauteur, 0.16), pos: [-0.99, hauteur / 2, P] },
      { geo: new THREE.BoxGeometry(0.92, hauteur, 0.16), pos: [0.99, hauteur / 2, P] },
      { geo: new THREE.BoxGeometry(CAB.largeur, 0.5, 0.16), pos: [0, hauteur - 0.25, P] },
      // Pignons : ce sont eux qui ferment le volume sous le faîte.
      { geo: new THREE.BoxGeometry(0.14, 1.0, 1.0), rot: [0.79, 0, 0],
        pos: [-L, hauteur + 0.5, 0] },
      { geo: new THREE.BoxGeometry(0.14, 1.0, 1.0), rot: [0.79, 0, 0],
        pos: [L, hauteur + 0.5, 0] }
    ];
  }

  /**
   * Toit à deux pentes.
   *
   * Le sens de rotation compte : un pan situé en −Z doit voir son bord
   * extérieur DESCENDRE, donc tourner négativement autour de X. Avec les deux
   * signes inversés, les bords remontaient et le toit formait une cuvette —
   * la cabane ressemblait à un carton ouvert.
   */
  function toitCabane(hauteur, longueur = CAB.largeur + 0.9) {
    const pente = 0.62;
    // Débord : un toit qui s'arrête au ras du mur se lit comme un couvercle.
    const pan = CAB.profondeur * 0.92;

    return [
      { geo: new THREE.BoxGeometry(longueur, 0.16, pan),
        rot: [-pente, 0, 0], pos: [0, hauteur + 0.46, -pan * 0.42] },
      { geo: new THREE.BoxGeometry(longueur, 0.16, pan),
        rot: [pente, 0, 0], pos: [0, hauteur + 0.46, pan * 0.42] }
    ];
  }

  const cabaneIntacteGeo = assembler([...corpsCabane(CAB.mur), ...toitCabane(CAB.mur)]);

  const cabaneAbandonneeGeo = assembler([
    ...corpsCabane(CAB.mur),
    // Toit affaissé : le pan arrière tient encore, l'avant s'est effondré.
    { geo: new THREE.BoxGeometry(CAB.largeur + 0.5, 0.16, 1.95),
      rot: [-0.44, 0.05, 0.09], pos: [0.08, CAB.mur + 0.4, -0.82] },
    { geo: new THREE.BoxGeometry(1.4, 0.16, 1.5),
      rot: [1.05, 0, 0.18], pos: [-0.75, CAB.mur - 0.12, 0.75] },
    // Planche tombée devant l'entrée.
    { geo: new THREE.BoxGeometry(1.7, 0.12, 0.28), rot: [0, 0.4, 0.08],
      pos: [0.4, 0.12, 1.95] }
  ]);

  const cabaneDetruiteGeo = assembler([
    { geo: new THREE.BoxGeometry(CAB.largeur, 0.18, CAB.profondeur), pos: [0, 0.09, 0] },
    // Un pan de mur debout, le reste au sol.
    { geo: new THREE.BoxGeometry(0.16, 1.7, CAB.profondeur), pos: [-1.45, 0.85, 0] },
    { geo: new THREE.BoxGeometry(1.4, 1.05, 0.16), pos: [-0.75, 0.52, -1.25] },
    { geo: new THREE.BoxGeometry(2.4, 0.14, 0.3), rot: [0, 0.25, 0.05],
      pos: [0.7, 0.16, -0.5] },
    { geo: new THREE.BoxGeometry(1.9, 0.14, 0.3), rot: [0, -0.6, 0.03],
      pos: [0.4, 0.14, 0.8] },
    { geo: new THREE.BoxGeometry(1.2, 0.14, 0.26), rot: [0, 1.1, 0.02],
      pos: [1.3, 0.13, 1.6] },
    { geo: new THREE.BoxGeometry(0.9, 0.7, 0.14), rot: [0.9, 0.3, 0],
      pos: [1.5, 0.35, -1.1] }
  ]);

  const CABANES = {
    intacte: { geo: cabaneIntacteGeo, mat: M.bois, toit: M.toit },
    abandonnee: { geo: cabaneAbandonneeGeo, mat: M.boisClair, toit: M.toit },
    detruite: { geo: cabaneDetruiteGeo, mat: M.bois, toit: M.toit }
  };

  // -------------------------------------------------------------------------
  // Nomade — un voyageur comme le joueur, en plus simple
  // -------------------------------------------------------------------------
  const nomadeCorpsGeo = assembler([
    { geo: new THREE.CylinderGeometry(0.3, 0.22, 0.78, 7), pos: [0, 1.24, 0] },
    { geo: new THREE.CylinderGeometry(0.28, 0.33, 0.28, 7), pos: [0, 0.96, 0] },
    { geo: new THREE.SphereGeometry(0.26, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62),
      pos: [0, 1.86, -0.02], scale: [1, 1.15, 1.05] }
  ]);

  const nomadeTeteGeo = assembler([
    { geo: new THREE.SphereGeometry(0.21, 8, 6), pos: [0, 1.86, 0], scale: [1, 1.08, 0.94] }
  ]);

  const nomadeEcharpeGeo = assembler([
    { geo: new THREE.CylinderGeometry(0.15, 0.17, 0.13, 7), pos: [0, 1.68, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.3, 0.06), rot: [0.2, 0, 0.14], pos: [0.09, 1.5, 0.14] }
  ]);

  const nomadeJambesGeo = assembler([
    { geo: new THREE.CapsuleGeometry(0.1, 0.5, 3, 5), pos: [-0.13, 0.55, 0] },
    { geo: new THREE.CapsuleGeometry(0.1, 0.5, 3, 5), pos: [0.13, 0.55, 0] }
  ]);

  const nomadeSacGeo = assembler([
    { geo: new THREE.BoxGeometry(0.42, 0.46, 0.26), pos: [0, 1.32, -0.34] }
  ]);

  // -------------------------------------------------------------------------
  // Animaux
  // -------------------------------------------------------------------------

  /** Petit quadrupède : corps, tête, oreilles, quatre pattes, queue. */
  const animalGeo = assembler([
    { geo: new THREE.CapsuleGeometry(0.19, 0.3, 3, 6), rot: [0, 0, Math.PI / 2],
      pos: [0, 0.33, 0] },
    { geo: new THREE.SphereGeometry(0.15, 7, 5), pos: [0, 0.42, 0.32], scale: [1, 0.95, 1.1] },
    { geo: new THREE.ConeGeometry(0.055, 0.22, 4), rot: [-0.2, 0, 0.18], pos: [-0.07, 0.58, 0.3] },
    { geo: new THREE.ConeGeometry(0.055, 0.22, 4), rot: [-0.2, 0, -0.18], pos: [0.07, 0.58, 0.3] },
    { geo: new THREE.CylinderGeometry(0.045, 0.04, 0.26, 4), pos: [-0.12, 0.13, 0.18] },
    { geo: new THREE.CylinderGeometry(0.045, 0.04, 0.26, 4), pos: [0.12, 0.13, 0.18] },
    { geo: new THREE.CylinderGeometry(0.045, 0.04, 0.26, 4), pos: [-0.12, 0.13, -0.16] },
    { geo: new THREE.CylinderGeometry(0.045, 0.04, 0.26, 4), pos: [0.12, 0.13, -0.16] },
    { geo: new THREE.SphereGeometry(0.075, 5, 4), pos: [0, 0.38, -0.34] }
  ]);

  /** Oiseau : un corps et deux ailes, vingt triangles en tout. */
  const oiseauGeo = assembler([
    { geo: new THREE.ConeGeometry(0.08, 0.3, 4), rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.42, 0.02, 0.13), rot: [0, 0, 0.22], pos: [-0.22, 0.03, 0] },
    { geo: new THREE.BoxGeometry(0.42, 0.02, 0.13), rot: [0, 0, -0.22], pos: [0.22, 0.03, 0] }
  ]);

  // -------------------------------------------------------------------------
  // Registres — tout meurt avec son chunk
  // -------------------------------------------------------------------------
  const parChunk = new Map();   // clé de chunk -> entités
  const actives = new Set();

  function enregistrer(cle, entite) {
    actives.add(entite);
    const liste = parChunk.get(cle);
    if (liste) liste.push(entite); else parChunk.set(cle, [entite]);
  }

  function oublierChunk(cle) {
    const liste = parChunk.get(cle);
    if (!liste) return;
    for (const e of liste) actives.delete(e);
    parChunk.delete(cle);
  }

  // -------------------------------------------------------------------------
  // Peuplement
  // -------------------------------------------------------------------------

  /**
   * Pose ce que le directeur a décidé pour ce chunk.
   * `plan` vient de worlddirector.decide().
   */
  function peupler(group, cle, plan, ctx) {
    const { centerX, centerZ, terrainHeight, hasard } = ctx;

    if (plan.structure === "cabane") poserCabane(group, cle, ctx);

    for (let i = 0; i < plan.animaux; i++) {
      poserAnimal(group, cle, ctx, i);
    }

    if (plan.oiseaux) poserOiseaux(group, cle, ctx, plan.oiseaux);
    if (plan.nomade) poserNomade(group, cle, ctx);
  }

  function poserCabane(group, cle, ctx) {
    const { centerX, centerZ, terrainHeight, hasard } = ctx;

    const t = hasard(11, 23);
    const etat = t < 0.4 ? "intacte" : t < 0.78 ? "abandonnee" : "detruite";
    const spec = CABANES[etat];

    const lx = (hasard(31, 17) - 0.5) * 12;
    const lz = (hasard(13, 41) - 0.5) * 12;
    const y = terrainHeight(centerX + lx, centerZ + lz);
    if (y < -1.4) return;

    const mesh = new THREE.Mesh(spec.geo, spec.mat);
    mesh.position.set(lx, y - 0.1, lz);
    mesh.rotation.y = hasard(7, 29) * Math.PI * 2;
    mesh.userData.kind = "cabanes";
    group.add(mesh);
  }

  function poserAnimal(group, cle, ctx, index) {
    const { centerX, centerZ, terrainHeight, hasard } = ctx;

    const lx = (hasard(53 + index * 7, 19) - 0.5) * 24;
    const lz = (hasard(29, 61 + index * 11) - 0.5) * 24;
    const y = terrainHeight(centerX + lx, centerZ + lz);
    if (y < -1.2) return;

    const sombre = hasard(3 + index, 5) < 0.4;
    const mesh = new THREE.Mesh(animalGeo, sombre ? M.fourrureSombre : M.fourrure);
    mesh.position.set(lx, y, lz);
    mesh.rotation.y = hasard(9 + index, 3) * Math.PI * 2;
    const taille = 0.8 + hasard(15 + index, 7) * 0.5;
    mesh.scale.setScalar(taille);
    mesh.userData.kind = "animaux";
    group.add(mesh);

    enregistrer(cle, {
      type: "animal", mesh, group,
      baseX: centerX + lx, baseZ: centerZ + lz,
      cap: hasard(21 + index, 13) * Math.PI * 2,
      phase: hasard(23 + index, 17) * 6.28,
      prochaineDecision: 0, fuite: 0
    });
  }

  function poserOiseaux(group, cle, ctx, nombre) {
    const { centerX, centerZ, terrainHeight, hasard } = ctx;

    const lx = (hasard(71, 37) - 0.5) * 20;
    const lz = (hasard(43, 79) - 0.5) * 20;
    const y = terrainHeight(centerX + lx, centerZ + lz);
    if (y < -1.2) return;

    // Une nuée = un objet par oiseau, mais tous pilotés par un seul état.
    const membres = [];
    for (let i = 0; i < nombre; i++) {
      const mesh = new THREE.Mesh(oiseauGeo, M.plume);
      const dx = (hasard(83 + i, 11) - 0.5) * 3.2;
      const dz = (hasard(17, 89 + i) - 0.5) * 3.2;
      mesh.position.set(lx + dx, y + LIVING.oiseau.hauteurRepos, lz + dz);
      mesh.rotation.y = hasard(5 + i, 7) * Math.PI * 2;
      mesh.scale.setScalar(0.75 + hasard(11 + i, 3) * 0.4);
      mesh.userData.kind = "oiseaux";
      group.add(mesh);
      membres.push({ mesh, dx, dz, phase: hasard(13 + i, 19) * 6.28 });
    }

    enregistrer(cle, {
      type: "oiseaux", membres, group,
      baseX: centerX + lx, baseZ: centerZ + lz, baseY: y,
      envole: false, hauteur: 0, cap: hasard(3, 91) * Math.PI * 2
    });
  }

  function poserNomade(group, cle, ctx) {
    const { centerX, centerZ, terrainHeight, hasard } = ctx;

    const lx = (hasard(97, 31) - 0.5) * 18;
    const lz = (hasard(59, 101) - 0.5) * 18;
    const y = terrainHeight(centerX + lx, centerZ + lz);
    if (y < -1.2) return;

    // Le nomade est un petit groupe d'objets partageant un pivot, pour que la
    // marche puisse animer les jambes sans toucher au reste.
    const pivot = new THREE.Group();
    pivot.position.set(lx, y, lz);
    pivot.rotation.y = hasard(7, 53) * Math.PI * 2;
    pivot.userData.kind = "nomades";

    const corps = new THREE.Mesh(nomadeCorpsGeo, M.manteau);
    const tete = new THREE.Mesh(nomadeTeteGeo, M.peau);
    const echarpe = new THREE.Mesh(nomadeEcharpeGeo, M.echarpe);
    const jambes = new THREE.Mesh(nomadeJambesGeo, M.manteau);
    const sac = new THREE.Mesh(nomadeSacGeo, M.bois);
    pivot.add(corps, tete, echarpe, jambes, sac);
    group.add(pivot);

    enregistrer(cle, {
      type: "nomade", pivot, jambes, group,
      baseX: centerX + lx, baseZ: centerZ + lz,
      cap: pivot.rotation.y,
      etat: "pause", minuterie: 1 + hasard(3, 7) * 3,
      pas: hasard(19, 23) * 6.28,
      prochaineDecision: 0
    });
  }

  // -------------------------------------------------------------------------
  // Comportements
  // -------------------------------------------------------------------------

  let horloge = 0;

  /**
   * Une seule règle face à la brume, pour tout le monde : si elle est trop
   * proche, fuir vers l'avant. Pas d'IA, pas de recherche de chemin — le monde
   * entier fuit dans la même direction, et c'est exactement ce qu'il faut
   * donner à voir.
   */
  function fuirLaBrume(entite, fogZ, marge) {
    return entite.mesh
      ? entite.mesh.getWorldPosition(tmpVec).z > fogZ - marge
      : entite.baseZ > fogZ - marge;
  }

  const tmpVec = { x: 0, y: 0, z: 0 };

  /**
   * Visibilité d'une entité. Un être gelé n'était plus mis à jour mais restait
   * dessiné : il coûtait encore un appel de rendu par image, à une distance où
   * le brouillard de scène le rend de toute façon indistinct. On l'éteint.
   *
   * Le seuil est le même que celui du gel, donc rien ne peut bouger hors du
   * champ et réapparaître ailleurs : ce qui redevient visible est exactement
   * là où on l'avait laissé.
   */
  function montrer(e, visible) {
    if (e.visible === visible) return;
    e.visible = visible;
    if (e.membres) { for (const m of e.membres) m.mesh.visible = visible; }
    else if (e.pivot) e.pivot.visible = visible;
    else if (e.mesh) e.mesh.visible = visible;
  }

  function update(delta, fogZ, terrainHeight) {
    horloge += delta;

    const px = player.position.x;
    const pz = player.position.z;

    for (const e of actives) {
      // --- distance : ce qui est loin coûte moins cher -------------------
      const dx = e.baseX - px;
      const dz = e.baseZ - pz;
      const distance2 = dx * dx + dz * dz;

      // Gelé : hors de vue et hors d'atteinte, on ne calcule rien — et on ne
      // dessine rien non plus.
      if (distance2 > LIVING.distanceGel * LIVING.distanceGel) {
        montrer(e, false);
        continue;
      }
      montrer(e, true);

      const loin = distance2 > LIVING.distanceLoin * LIVING.distanceLoin;
      const hz = loin ? LIVING.hzLoin : LIVING.hzProche;

      if (horloge < e.prochaineDecision) {
        // Entre deux décisions, seuls les proches continuent d'avancer.
        if (!loin) avancer(e, delta, terrainHeight);
        continue;
      }

      e.prochaineDecision = horloge + 1 / hz;
      decider(e, Math.sqrt(distance2), fogZ, px, pz);
      if (!loin) avancer(e, delta, terrainHeight);
    }
  }

  function decider(e, distance, fogZ, px, pz) {
    if (e.type === "animal") {
      const menaceBrume = e.baseZ > fogZ - LIVING.animal.margeBrume;
      const menaceJoueur = distance < LIVING.animal.rayonFuite;

      if (menaceBrume) {
        // Vers l'avant, en s'écartant un peu : une débandade, pas un défilé.
        e.cap = Math.PI + (e.phase % 1 - 0.5) * 0.9;
        e.fuite = 1;
      } else if (menaceJoueur) {
        e.cap = Math.atan2(e.baseX - px, e.baseZ - pz);
        e.fuite = 1;
      } else {
        e.fuite = 0;
        // Errance : le cap dérive doucement autour du point d'origine.
        const versBase = Math.atan2(e.baseX - e.mesh.position.x - 0,
                                    e.baseZ - e.mesh.position.z - 0);
        e.cap += (Math.sin(horloge * 0.6 + e.phase) * 0.5);
        if (Math.random() < 0.12) e.cap = versBase;
      }
      return;
    }

    if (e.type === "oiseaux") {
      const menaceBrume = e.baseZ > fogZ - LIVING.animal.margeBrume;
      if (!e.envole && (distance < LIVING.oiseau.rayonEnvol || menaceBrume)) {
        e.envole = true;
        e.cap = menaceBrume ? Math.PI : Math.atan2(e.baseX - px, e.baseZ - pz);
      }
      return;
    }

    if (e.type === "nomade") {
      const menaceBrume = e.baseZ > fogZ - LIVING.nomade.margeBrume;

      if (menaceBrume) {
        e.etat = "fuite";
        e.cap = Math.PI + (e.pas % 1 - 0.5) * 0.35;
        return;
      }

      e.minuterie -= 1 / LIVING.hzProche;
      if (e.minuterie > 0) return;

      if (e.etat === "marche") {
        e.etat = "pause";
        e.minuterie = LIVING.nomade.pauseMin +
          Math.random() * (LIVING.nomade.pauseMax - LIVING.nomade.pauseMin);
      } else {
        e.etat = "marche";
        e.minuterie = 3 + Math.random() * 5;
        // Un nomade va globalement dans le même sens que le joueur : lui aussi
        // fuit quelque chose.
        e.cap = Math.PI + (Math.random() - 0.5) * 1.5;
      }
    }
  }

  function avancer(e, delta, terrainHeight) {
    if (e.type === "animal") {
      const v = e.fuite ? LIVING.animal.vitesseFuite : LIVING.animal.vitesse;
      const bouge = e.fuite || Math.sin(horloge * 0.8 + e.phase) > -0.2;
      if (!bouge) return;

      const m = e.mesh;
      m.position.x += Math.sin(e.cap) * v * delta;
      m.position.z += Math.cos(e.cap) * v * delta;
      m.rotation.y = e.cap;

      const mondeX = e.group.position.x + m.position.x;
      const mondeZ = e.group.position.z + m.position.z;
      m.position.y = terrainHeight(mondeX, mondeZ);

      // Petit bond : une course qui ne saute pas ressemble à un glissement.
      if (e.fuite) m.position.y += Math.abs(Math.sin(horloge * 11 + e.phase)) * 0.16;
      return;
    }

    if (e.type === "oiseaux") {
      if (!e.envole) {
        // Au repos, les oiseaux picorent : une rotation lente suffit.
        for (const o of e.membres) {
          o.mesh.rotation.y += delta * 0.4 * Math.sin(o.phase);
        }
        return;
      }

      e.hauteur = Math.min(LIVING.oiseau.hauteurVol, e.hauteur + delta * 6);
      const v = LIVING.oiseau.vitesseFuite;

      for (const o of e.membres) {
        o.mesh.position.x += Math.sin(e.cap) * v * delta;
        o.mesh.position.z += Math.cos(e.cap) * v * delta;
        o.mesh.position.y = e.baseY + e.hauteur +
          Math.sin(horloge * 3 + o.phase) * 0.5;
        o.mesh.rotation.y = e.cap;
        // Battement d'ailes : un roulis rapide, sans squelette.
        o.mesh.rotation.z = Math.sin(horloge * 16 + o.phase) * 0.5;
      }
      return;
    }

    if (e.type === "nomade") {
      const marche = e.etat === "marche" || e.etat === "fuite";
      if (!marche) {
        // À l'arrêt : il regarde autour de lui.
        e.pivot.rotation.y += Math.sin(horloge * 0.5 + e.pas) * delta * 0.6;
        e.jambes.rotation.x = 0;
        return;
      }

      const v = e.etat === "fuite" ? LIVING.nomade.vitesseFuite : LIVING.nomade.vitesse;
      e.pivot.position.x += Math.sin(e.cap) * v * delta;
      e.pivot.position.z += Math.cos(e.cap) * v * delta;
      e.pivot.rotation.y = e.cap;

      const mondeX = e.group.position.x + e.pivot.position.x;
      const mondeZ = e.group.position.z + e.pivot.position.z;
      e.pivot.position.y = terrainHeight(mondeX, mondeZ);

      e.pas += delta * (e.etat === "fuite" ? 11 : 6);
      e.jambes.rotation.x = Math.sin(e.pas) * 0.34;
      e.pivot.position.y += Math.abs(Math.sin(e.pas)) * 0.03;
    }
  }

  return {
    peupler,
    oublierChunk,
    update,
    LIVING,
    get compte() {
      let animaux = 0, oiseaux = 0, nomades = 0;
      for (const e of actives) {
        if (e.type === "animal") animaux++;
        else if (e.type === "oiseaux") oiseaux += e.membres.length;
        else if (e.type === "nomade") nomades++;
      }
      return { animaux, oiseaux, nomades, entites: actives.size };
    },
    vider() { actives.clear(); parChunk.clear(); }
  };
}
