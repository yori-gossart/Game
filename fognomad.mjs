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
    speed: 4.6,             // unités/seconde, constante pour le Core Test
    acceleration: 0,        // réservé : 0 = vitesse constante
    damagePerSecond: 32,    // points de vie par seconde passée dedans
    color: 0x322b3d,
    opacity: 1,
    height: 34,
    width: 460,
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
    drainBase: 17,          // par seconde, sac vide
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

  // Les ressources lointaines valent plus. Le couloir latéral est mesuré en
  // écart absolu à l'axe de fuite de la run, c'est-à-dire au X de départ.
  resources: {
    bois:    { label: "Bois",    weight: 7,  value: 1,  color: 0x8a5a33, chance: 0.55, lateralMin: 0,  lateralMax: 20, size: 0.5 },
    pierre:  { label: "Pierre",  weight: 13, value: 4,  color: 0x8d9299, chance: 0.32, lateralMin: 14, lateralMax: 44, size: 0.55 },
    cristal: { label: "Cristal", weight: 5,  value: 14, color: 0x7fe6d8, chance: 0.13, lateralMin: 34, lateralMax: 78, size: 0.46 }
  },

  // Nombre de tentatives de pose par chunk. Chaque tentative peut échouer si
  // le couloir latéral ne correspond pas.
  spawnAttemptsPerChunk: 9,

  // Paliers visuels du sac : seuils sur le rapport poids/max.
  bagTiers: [0, 0.18, 0.42, 0.68, 0.88],

  telemetryKey: "fog-nomad-runs-0.3",
  maxStoredRuns: 20,

  // Au-delà de cet écart latéral, on comptabilise un détour.
  detourThreshold: 24
};

const RESOURCE_KEYS = Object.keys(CONFIG.resources);

/** Vitesse relative en fonction de la charge. Une seule formule, ici. */
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
  const { THREE, scene, player, renderer, terrainHeight, onRestart } = ctx;

  // -------------------------------------------------------------------------
  // Ressources : géométries et matériaux partagés, objets individuels.
  //
  // Pas d'InstancedMesh ici. Le rendu instancié des fleurs se corrompait sur le
  // GPU cible (voir AUDIT_PERFORMANCE_BUGS_0.2.md, B0) et rien n'indique que le
  // défaut se limite aux fleurs. Les ressources sont peu nombreuses, doivent
  // disparaître à l'unité quand on les ramasse, et un Mesh ordinaire est le
  // chemin de rendu déjà éprouvé sur l'appareil. Le coût est mesuré, pas supposé.
  // -------------------------------------------------------------------------

  const resourceGeometries = {
    bois: faceted(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 6)),
    pierre: faceted(new THREE.DodecahedronGeometry(0.42, 0)),
    cristal: faceted(new THREE.OctahedronGeometry(0.46, 0))
  };

  const resourceMaterials = {};
  for (const key of RESOURCE_KEYS) {
    resourceMaterials[key] = new THREE.MeshLambertMaterial({
      color: CONFIG.resources[key].color,
      emissive: key === "cristal" ? 0x1c5a52 : 0x000000
    });
  }

  function faceted(geometry) {
    const result = geometry.index ? geometry.toNonIndexed() : geometry;
    if (result !== geometry) geometry.dispose();
    result.deleteAttribute("uv");
    result.computeVertexNormals();
    return result;
  }

  // -------------------------------------------------------------------------
  // Brume : deux plans, quatre triangles. Le dégradé vertical passe par les
  // couleurs de sommets, donc aucun shader et aucune texture.
  // -------------------------------------------------------------------------

  /**
   * Mur de brume : un plan à quatre rangées, dont l'opacité décroît vers le
   * haut. L'alpha passe par un attribut de couleur à 4 composantes — Three.js
   * l'accepte nativement — donc aucun shader et aucune texture.
   */
  function buildFogWall(width, height, topAlpha) {
    const geometry = new THREE.PlaneGeometry(width, height, 1, 3);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 4);
    const base = new THREE.Color(CONFIG.fog.color);

    for (let i = 0; i < position.count; i++) {
      // 0 en bas du mur, 1 en haut.
      const t = (position.getY(i) + height / 2) / height;
      // Opaque au sol, effacée en altitude : un mur, pas une dalle.
      const alpha = topAlpha * Math.pow(1 - t, 2.1);

      // La brume s'éclaircit un peu en montant, comme une vapeur qui se dilue.
      colors[i * 4] = base.r + t * 0.10;
      colors[i * 4 + 1] = base.g + t * 0.10;
      colors[i * 4 + 2] = base.b + t * 0.13;
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
    fog: false
  });

  const fogGroup = new THREE.Group();

  // Le mur est enfoncé sous le terrain : il doit sortir du sol, pas flotter.
  const fogFront = new THREE.Mesh(
    buildFogWall(CONFIG.fog.width, CONFIG.fog.height, 1),
    fogMaterial
  );
  fogFront.position.y = CONFIG.fog.height / 2 - 11;
  fogFront.renderOrder = 5;

  // Second plan en retrait : donne de l'épaisseur sans coût réel.
  const fogBack = new THREE.Mesh(
    buildFogWall(CONFIG.fog.width, CONFIG.fog.height * 1.5, 0.72),
    fogMaterial
  );
  fogBack.position.set(0, CONFIG.fog.height * 0.75 - 11, 11);
  fogBack.renderOrder = 4;

  fogGroup.add(fogFront, fogBack);
  scene.add(fogGroup);

  // -------------------------------------------------------------------------
  // Sac visuel : le sac du personnage grossit et reçoit des caisses.
  // -------------------------------------------------------------------------

  const bag = player.userData.bag;
  const bagBaseScale = bag.scale.clone();
  const bagCrateMaterial = new THREE.MeshLambertMaterial({ color: 0x6f7d55 });
  const bagCrates = [];

  {
    const crateGeometry = faceted(new THREE.BoxGeometry(0.2, 0.18, 0.16));
    const spots = [
      { x: -0.11, y: 0.34, z: -0.04 },
      { x: 0.12, y: 0.36, z: 0.03 },
      { x: 0.0, y: 0.47, z: -0.02 }
    ];

    for (const spot of spots) {
      const crate = new THREE.Mesh(crateGeometry, bagCrateMaterial);
      crate.position.set(spot.x, spot.y, spot.z);
      crate.rotation.y = spot.x * 3;
      crate.visible = false;
      bag.add(crate);
      bagCrates.push(crate);
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
    elapsed: 0,
    distance: 0,
    maxWeight: 0,
    collected: 0,
    dropped: 0,
    sprintTime: 0,
    minFogGap: Infinity,
    detours: 0,
    inFog: false,
    collecting: null,
    collectProgress: 0,
    sinceSprint: 0,
    wasFarLateral: false
  };

  // Ressources actives, groupées par chunk pour être libérées avec lui.
  const chunkResources = new Map();
  const activeResources = new Set();

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
    state.fogZ = player.position.z + CONFIG.fog.startDistance;
    state.elapsed = 0;
    state.distance = 0;
    state.maxWeight = 0;
    state.collected = 0;
    state.dropped = 0;
    state.sprintTime = 0;
    state.minFogGap = Infinity;
    state.detours = 0;
    state.inFog = false;
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

    for (let i = 0; i < CONFIG.spawnAttemptsPerChunk; i++) {
      const roll = random01(cx * 31 + i * 17, cz * 47 - i * 23, 211);
      let chosen = null;
      let acc = 0;

      for (const key2 of RESOURCE_KEYS) {
        acc += CONFIG.resources[key2].chance;
        if (roll < acc) { chosen = key2; break; }
      }

      if (!chosen) continue;

      const spec = CONFIG.resources[chosen];
      const localX = (random01(cx * 71 + i * 13, cz * 29 + i * 7, 223) - 0.5) * (32 - 4);
      const localZ = (random01(cx * 19 - i * 11, cz * 83 + i * 5, 227) - 0.5) * (32 - 4);
      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;

      // Couloir latéral, mesuré depuis l'axe de la run : c'est ce qui rend le
      // détour nécessaire. Ancré sur le départ, pas sur l'origine du monde,
      // pour qu'une run lancée n'importe où ait le même couloir.
      const lateral = Math.abs(worldX - state.startX);
      if (lateral < spec.lateralMin || lateral > spec.lateralMax) continue;

      const y = terrainHeight(worldX, worldZ);
      if (y < -2.2) continue;

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

    if (placed.length > 0) chunkResources.set(key, placed);
  }

  function onChunkDisposed(key) {
    const list = chunkResources.get(key);
    if (!list) return;

    for (const mesh of list) activeResources.delete(mesh);
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
    state.maxWeight = Math.max(state.maxWeight, state.weight);
    updateBagVisual();
  }

  function dropOne(type) {
    if (!state.inventory[type]) return false;

    state.inventory[type]--;
    state.weight = Math.max(0, state.weight - CONFIG.resources[type].weight);
    state.dropped++;
    updateBagVisual();
    return true;
  }

  function updateBagVisual() {
    const ratio = Math.min(1, weightRatio());
    const tier = bagTierFor(ratio);

    // Le sac gonfle par paliers : la charge doit se lire sur la silhouette.
    const grow = 1 + tier * 0.22;
    bag.scale.set(
      bagBaseScale.x * grow,
      bagBaseScale.y * (1 + tier * 0.3),
      bagBaseScale.z * grow
    );

    for (let i = 0; i < bagCrates.length; i++) {
      bagCrates[i].visible = tier >= i + 2;
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

    // --- brume ---
    const speed = CONFIG.fog.speed + CONFIG.fog.acceleration * state.elapsed;
    state.fogZ -= speed * delta;

    fogGroup.position.set(player.position.x, 0, state.fogZ);

    const gap = state.fogZ - player.position.z;
    state.minFogGap = Math.min(state.minFogGap, gap);
    state.inFog = gap <= 0;

    if (state.inFog) {
      state.health -= CONFIG.fog.damagePerSecond * delta;

      if (state.health <= 0) {
        state.health = 0;
        die("Rattrapé par la brume");
        return;
      }
    }

    // --- distance et détours ---
    state.distance = Math.max(state.distance, state.startZ - player.position.z);

    const lateral = Math.abs(player.position.x - state.startX);
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

    state.dead = true;
    state.running = false;
    state.deathCause = cause;
    state.collecting = null;
    storeRun();
    emit();
  }

  function restart() {
    for (const mesh of [...activeResources]) removeResource(mesh);
    chunkResources.clear();
    activeResources.clear();

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
      valeur: valueCarried()
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
    die,
    weightRatio,
    valueCarried,
    storedRuns,
    bagTier: () => bagTierFor(Math.min(1, weightRatio())),
    onChange: (fn) => listeners.change.push(fn),
    playerZ: () => player.position.z,
    playerX: () => player.position.x,
    get fogGap() { return state.fogZ - player.position.z; },
    get resourceCount() { return activeResources.size; },
    get resourceObjects() { return [...activeResources]; },
    setFogZ: (z) => { state.fogZ = z; },
    resetRun
  };
}
