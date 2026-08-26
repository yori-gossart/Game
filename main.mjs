import * as THREE from "./vendor/three/three.module.min.js";

const $ = (selector) => document.querySelector(selector);

const canvas = $("#world");
const loading = $("#loading");
const coordsEl = $("#coordinates");
const chunksEl = $("#chunk-count");
const discoveredEl = $("#discovered-count");
const seedEl = $("#seed");
const biomeEl = $("#biome");
const joystick = $("#joystick");
const stick = $("#stick");
const runButton = $("#run");
const newWorldButton = $("#new-world");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  alpha: false
});

// Paliers de résolution : on dégrade la densité de pixels avant la qualité visuelle.
// Le palier 0.85 descendait sous un pixel CSS : sur un écran DPR 3 cela rend à
// 28 % de la résolution physique, et l'image remonte visiblement en escalier.
// Le plancher est désormais 1.0.
const PIXEL_RATIO_STEPS = [1.35, 1.15, 1.0];
let pixelStep = 0;

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_STEPS[0]));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const SKY_COLOR = 0x8bc6df;
const FOG_COLOR = 0x9cc5cd;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);

const CHUNK_SIZE = 32;
const CHUNK_RADIUS = 2;
const CHUNK_SEGMENTS = 12;
const PLAYER_SPEED = 6.2;
const CAMERA_DISTANCE = 13;
const RUN_MULTIPLIER = 1.8;
const SAVE_KEY = "horizon-proto-0.2-save";

// Mode diagnostic (?diag) : déclaré ici car createChunk le consulte, et les
// premiers chunks sont bâtis pendant l'évaluation du module.
const DIAG = new URLSearchParams(location.search).has("diag");

const diagVisible = {
  terrain: true, troncs: true, houppiers: true, rochers: true,
  fleurs: true, eau: true, soleil: true
};

let diagUnlit = false;
let diagFlou = true;

// Le terrain chargé couvre au minimum CHUNK_RADIUS * CHUNK_SIZE unités dans chaque
// direction. Le brouillard doit être totalement opaque avant cette limite, sinon
// le bord du monde devient visible à l'horizon.
const TERRAIN_REACH = CHUNK_RADIUS * CHUNK_SIZE;
const FOG_FAR = TERRAIN_REACH - 2;
const FOG_NEAR = FOG_FAR * 0.42;

scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

// near/far : la précision du depth buffer varie en d²·(far-near)/(2·far·near).
// Avec near=0.1 et far=122, un tampon 16 bits — courant sur Android — ne
// distingue plus que 0.24 u à 40 u de distance : le terrain et le plan d'eau,
// quasi coplanaires sur les rives plates, se disputent alors la profondeur sur
// une bande large de 5 à 30 unités. near=0.5 et far resserré divisent l'erreur
// par cinq. near ne peut pas monter davantage sans rogner les arbres proches
// quand la caméra en traverse un.
const CAMERA_NEAR = 0.5;
const CAMERA_FAR = FOG_FAR + 20;

const camera = new THREE.PerspectiveCamera(56, 1, CAMERA_NEAR, CAMERA_FAR);

const hemiLight = new THREE.HemisphereLight(0xf7fbff, 0x645c42, 2.15);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffe5ad, 2.35);
sunLight.position.set(-42, 60, 24);
scene.add(sunLight);

// Le soleil était à 122 u du joueur pour un plan far à 122, et à 24° de
// hauteur alors que la caméra ne regarde jamais au-dessus de 21° : il n'était
// jamais rendu. On le rapproche dans le volume visible, à la même direction
// que la lumière et à une hauteur atteignable, en conservant sa taille
// apparente (rayon / distance constant).
const SUN_OFFSET = new THREE.Vector3(-50.3, 14.5, 28.8);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(1.71, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xffe9ac, fog: false })
);
sun.position.copy(SUN_OFFSET);
scene.add(sun);

const waterMaterial = new THREE.MeshLambertMaterial({
  color: 0x599aaa,
  transparent: true,
  opacity: 0.78,
  depthWrite: true,
  // Sur une rive plate, l'eau et le terrain sont à quelques centimètres l'un
  // de l'autre sur des dizaines d'unités. Le décalage de polygone tranche le
  // départage dans le même sens partout : le terrain gagne, la rive est nette
  // au lieu de scintiller.
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});

// Le plan d'eau suit le joueur et doit dépasser la portée du brouillard,
// sinon son bord apparaît à l'horizon.
const water = new THREE.Mesh(
  new THREE.PlaneGeometry((FOG_FAR + 30) * 2, (FOG_FAR + 30) * 2, 1, 1),
  waterMaterial
);
water.rotation.x = -Math.PI / 2;
water.position.y = -2.65;
scene.add(water);

let worldSeed = 0;
let activeChunkKey = "";
let running = false;
let joystickPointer = null;
let joystickVector = { x: 0, y: 0 };
let cameraPointer = null;
let cameraLastX = 0;
let cameraLastY = 0;
let cameraYaw = 0;
let cameraPitch = 0.5;
let walkTime = 0;
let idleTime = 0;

const CAMERA_PITCH_MIN = 0.12;
const CAMERA_PITCH_MAX = 0.98;

const chunks = new Map();
const discovered = new Set();
const buildQueue = [];

// Nombre de clés de chunks conservées dans la sauvegarde locale : borne la
// taille du localStorage tout en gardant le compteur « découverts » utile.
const MAX_SAVED_DISCOVERED = 1500;

const BIOMES = [
  {
    name: "Prairie haute",
    terrain: 0x74a45d,
    tree: 0x477444,
    density: 0.72,
    dry: false,
    humidity: 0.5,
    dryness: 0.5
  },
  {
    name: "Forêt douce",
    terrain: 0x628b50,
    tree: 0x345e3c,
    density: 0.92,
    dry: false,
    humidity: 0.55,
    dryness: -0.55
  },
  {
    name: "Plateau doré",
    terrain: 0xb09f68,
    tree: 0x6f7442,
    density: 0.55,
    dry: true,
    humidity: -0.55,
    dryness: 0.55
  },
  {
    name: "Landes",
    terrain: 0x7f8f69,
    tree: 0x4f6848,
    density: 0.48,
    dry: false,
    humidity: -0.5,
    dryness: -0.5
  }
];

const biomeColors = BIOMES.map((biome) => new THREE.Color(biome.terrain));
const biomeTreeColors = BIOMES.map((biome) => new THREE.Color(biome.tree));

// Un seul matériau de terrain : la couleur de biome passe par les couleurs de
// sommets, ce qui fond les biomes entre eux au lieu de les découper au chunk.
const terrainMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true
});

const rockMaterial = new THREE.MeshLambertMaterial({ color: 0x7d7b73 });

const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x765336 });

// Matériaux mutualisés : la teinte de feuillage et de fleur passe par la
// couleur d'instance, pas par un matériau supplémentaire par objet.
const crownMaterial = new THREE.MeshLambertMaterial();
const flowerMaterial = new THREE.MeshLambertMaterial();

/** Modulo toujours positif : les coordonnées de chunk peuvent être négatives. */
function wrapIndex(value, length) {
  return ((value % length) + length) % length;
}

const FLOWER_COLORS = [
  new THREE.Color(0xf2d07e),
  new THREE.Color(0xe8a3a1),
  new THREE.Color(0xd7d0f0)
];

/**
 * Rend une géométrie « à facettes » en dupliquant ses sommets et en portant la
 * normale de face sur chacun.
 *
 * `flatShading: true` demande au fragment shader de reconstruire la normale
 * avec dFdx/dFdy sur la position vue. Sur une surface regardée en rasant, ces
 * dérivées deviennent colinéaires et leur produit vectoriel tend vers zéro :
 * en précision mediump — celle des GPU mobiles — la normale part en vrille et
 * l'éclairement scintille sur une bande entière. La normale portée par
 * l'attribut donne exactement le même rendu facetté, sans dérivée.
 */
function faceted(geometry) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  result.computeVertexNormals();
  return result;
}

/**
 * Concatène des géométries non indexées partageant les mêmes attributs.
 * Évite d'embarquer BufferGeometryUtils pour un seul usage.
 */
function mergeGeometries(geometries) {
  const parts = geometries.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
  let total = 0;

  for (const part of parts) total += part.attributes.position.count;

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  let offset = 0;

  for (const part of parts) {
    position.set(part.attributes.position.array, offset * 3);
    normal.set(part.attributes.normal.array, offset * 3);
    offset += part.attributes.position.count;
    part.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  return merged;
}

const trunkGeometry = (() => {
  const g = new THREE.CylinderGeometry(0.14, 0.23, 1.35, 5);
  g.translate(0, 0.675, 0);
  return faceted(g);
})();

// Les deux cônes du feuillage sont fusionnés : un arbre = 1 tronc + 1 houppier.
const crownGeometry = (() => {
  const lower = new THREE.ConeGeometry(0.88, 1.8, 6);
  lower.translate(0, 1.72, 0);
  const upper = new THREE.ConeGeometry(0.65, 1.4, 6);
  upper.translate(0, 2.58, 0);

  const merged = mergeGeometries([lower, upper]);
  lower.dispose();
  upper.dispose();
  return faceted(merged);
})();

const rockGeometry = faceted(new THREE.DodecahedronGeometry(0.5, 0));
const flowerGeometry = faceted(new THREE.SphereGeometry(0.11, 5, 4));

const player = createPlayer();
scene.add(player);

const keys = new Set();

function createPlayer() {
  const group = new THREE.Group();
  const blue = new THREE.MeshLambertMaterial({ color: 0x284d72 });
  const blueDark = new THREE.MeshLambertMaterial({ color: 0x18354e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8aa83 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x3d2d27 });
  const bagMat = new THREE.MeshLambertMaterial({ color: 0x8a5f36 });

  const body = new THREE.Mesh(faceted(new THREE.CapsuleGeometry(0.38, 0.72, 4, 8)), blue);
  body.position.y = 1.15;

  const head = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.34, 10, 8)), skin);
  head.position.y = 1.95;

  const hairCap = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52)),
    hair
  );
  hairCap.position.y = 2.04;

  const legGeo = faceted(new THREE.CapsuleGeometry(0.105, 0.48, 3, 5));
  const leftLeg = new THREE.Mesh(legGeo, blueDark);
  leftLeg.position.set(-0.19, 0.34, 0);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.19;

  const armGeo = faceted(new THREE.CapsuleGeometry(0.085, 0.43, 3, 5));
  const leftArm = new THREE.Mesh(armGeo, skin);
  leftArm.position.set(-0.48, 1.18, 0);
  leftArm.rotation.z = -0.15;

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.48;
  rightArm.rotation.z = 0.15;

  // L'avant du personnage est son +Z local (voir player.rotation.y plus bas) :
  // le sac se porte donc en -Z, côté caméra quand on s'éloigne.
  const bag = new THREE.Mesh(faceted(new THREE.BoxGeometry(0.42, 0.56, 0.26)), bagMat);
  bag.position.set(0, 1.19, -0.4);
  bag.rotation.x = 0.08;

  group.add(body, head, hairCap, leftLeg, rightLeg, leftArm, rightArm, bag);
  group.userData = { body, head, hairCap, leftLeg, rightLeg, leftArm, rightArm, bag };
  return group;
}

function random01(x, z, salt = 0) {
  let n =
    Math.imul((x | 0) ^ worldSeed ^ salt, 374761393) +
    Math.imul((z | 0) + worldSeed + salt, 668265263);

  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

function terrainHeight(x, z) {
  const sx = worldSeed * 0.00013;
  const sz = worldSeed * 0.00009;

  const broad =
    Math.sin(x * 0.035 + sx) * 2.35 +
    Math.cos(z * 0.038 - sz) * 1.8;

  const ridge =
    Math.sin((x + z) * 0.017 + sx * 2.7) * 1.45;

  const hills =
    Math.sin(x * 0.075 + sx * 4.3) *
    Math.cos(z * 0.068 - sz * 3.1) * 1.3;

  const detail =
    Math.cos((x - z) * 0.055 - sz * 2.1) * 0.42;

  return broad + ridge + hills + detail;
}

/**
 * Champ de biome continu. Deux ondes lentes décorrélées donnent un couple
 * (humidité, aridité) dont on déduit un poids par biome. Comme le champ dépend
 * uniquement de la position monde, les biomes se fondent sans coupure aux
 * frontières de chunk.
 */
const biomeWeights = new Float32Array(BIOMES.length);

function computeBiomeWeights(x, z) {
  const sx = worldSeed * 0.00013;
  const sz = worldSeed * 0.00009;

  const humidity =
    Math.sin(x * 0.022 + sx * 3.1) * 0.5 +
    Math.cos(z * 0.026 - sz * 2.3) * 0.5;

  const dryness =
    Math.cos((x + z * 0.6) * 0.019 + sx * 1.7) * 0.5 +
    Math.sin((z - x * 0.4) * 0.025 - sz) * 0.5;

  let total = 0;

  for (let i = 0; i < BIOMES.length; i++) {
    const dh = humidity - BIOMES[i].humidity;
    const dd = dryness - BIOMES[i].dryness;
    const weight = Math.exp(-(dh * dh + dd * dd) / 0.34);

    biomeWeights[i] = weight;
    total += weight;
  }

  if (total > 0) {
    for (let i = 0; i < BIOMES.length; i++) biomeWeights[i] /= total;
  } else {
    biomeWeights.fill(1 / BIOMES.length);
  }

  return biomeWeights;
}

function dominantBiomeIndex(x, z) {
  const weights = computeBiomeWeights(x, z);
  let best = 0;

  for (let i = 1; i < BIOMES.length; i++) {
    if (weights[i] > weights[best]) best = i;
  }

  return best;
}

const scratchColor = new THREE.Color();

function blendedTerrainColor(x, z, target) {
  const weights = computeBiomeWeights(x, z);

  target.setRGB(0, 0, 0);

  for (let i = 0; i < BIOMES.length; i++) {
    scratchColor.copy(biomeColors[i]).multiplyScalar(weights[i]);
    target.add(scratchColor);
  }

  return target;
}

const dummy = new THREE.Object3D();

// Objets temporaires réutilisés par la boucle de rendu : allouer à chaque
// image fait travailler le ramasse-miettes en continu sur mobile.
const desiredCamera = new THREE.Vector3();
const keyboardVector = { x: 0, z: 0 };

function buildInstanced(geometry, material, items, applyTransform, colorOf) {
  if (items.length === 0) return null;

  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  for (let i = 0; i < items.length; i++) {
    applyTransform(dummy, items[i]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    if (colorOf) mesh.setColorAt(i, colorOf(items[i]));
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return mesh;
}

function createChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunks.has(key)) return;

  const group = new THREE.Group();
  const centerX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
  const centerZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
  group.position.set(centerX, 0, centerZ);

  const geometry = new THREE.PlaneGeometry(
    CHUNK_SIZE,
    CHUNK_SIZE,
    CHUNK_SEGMENTS,
    CHUNK_SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const vertexColor = new THREE.Color();

  for (let i = 0; i < positions.count; i++) {
    const worldX = positions.getX(i) + centerX;
    const worldZ = positions.getZ(i) + centerZ;

    positions.setY(i, terrainHeight(worldX, worldZ));

    blendedTerrainColor(worldX, worldZ, vertexColor);
    colors[i * 3] = vertexColor.r;
    colors[i * 3 + 1] = vertexColor.g;
    colors[i * 3 + 2] = vertexColor.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute("uv");   // aucun matériau texturé : autant ne pas le dupliquer

  // Dédouble les sommets et porte la normale de face : même aspect facetté,
  // sans reconstruction par dérivées dans le fragment shader (voir faceted()).
  const terrainGeometry = faceted(geometry);

  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.userData.ownedGeometry = true;
  group.add(terrain);

  const chunkBiome = BIOMES[dominantBiomeIndex(centerX, centerZ)];

  // Densité rapportée à la surface du chunk pour rester visuellement stable.
  const propCount =
    7 + Math.floor(random01(cx, cz, 12) * 16 * chunkBiome.density);

  const trees = [];
  const bushes = [];
  const rocks = [];
  const flowers = [];

  for (let i = 0; i < propCount; i++) {
    const localX =
      (random01(cx * 97 + i * 19, cz * 67 - i * 13, 23) - 0.5) *
      (CHUNK_SIZE - 3);

    const localZ =
      (random01(cx * 53 - i * 17, cz * 113 + i * 29, 37) - 0.5) *
      (CHUNK_SIZE - 3);

    const worldX = centerX + localX;
    const worldZ = centerZ + localZ;
    const y = terrainHeight(worldX, worldZ);

    if (y < -2.3) continue;

    const biomeIndex = dominantBiomeIndex(worldX, worldZ);
    const biome = BIOMES[biomeIndex];
    const type = random01(cx * 41 + i, cz * 31 - i, 51);

    if (type < biome.density && !biome.dry) {
      trees.push({
        x: localX,
        y,
        z: localZ,
        scale: 0.66 + random01(cx + i * 7, cz - i * 11, 62) * 0.78,
        rotation: random01(cx - i * 3, cz + i * 9, 64) * Math.PI * 2,
        biomeIndex
      });
    } else if (biome.dry && type < biome.density) {
      // Les terres sèches n'ont pas d'arbres mais gardent un couvert bas :
      // même géométrie de houppier, sans tronc et à petite échelle.
      bushes.push({
        x: localX,
        y,
        z: localZ,
        scale: 0.34 + random01(cx + i * 7, cz - i * 11, 62) * 0.22,
        rotation: random01(cx - i * 3, cz + i * 9, 64) * Math.PI * 2,
        biomeIndex,
        bushy: true
      });
    } else {
      rocks.push({
        x: localX,
        y,
        z: localZ,
        scale: 0.38 + random01(cx - i * 5, cz + i * 3, 72) * 0.82,
        seed: random01(i, cx + cz, 75)
      });
    }
  }

  if (!chunkBiome.dry) {
    const clusterCount = Math.floor(random01(cx, cz, 101) * 5);

    for (let i = 0; i < clusterCount; i++) {
      const localX =
        (random01(cx * 131 + i, cz * 43, 103) - 0.5) * (CHUNK_SIZE - 2);
      const localZ =
        (random01(cx * 79, cz * 149 - i, 105) - 0.5) * (CHUNK_SIZE - 2);

      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;

      if (terrainHeight(worldX, worldZ) <= -2.2) continue;

      // Petit bouquet : les fleurs isolées se lisaient comme des pixels perdus.
      for (let p = 0; p < 3; p++) {
        const offsetX = (random01(cx + i * 13, cz + p * 7, 107) - 0.5) * 1.1;
        const offsetZ = (random01(cx + p * 11, cz + i * 5, 109) - 0.5) * 1.1;
        const fx = localX + offsetX;
        const fz = localZ + offsetZ;
        const fy = terrainHeight(centerX + fx, centerZ + fz);

        if (fy <= -2.2) continue;

        flowers.push({
          x: fx,
          y: fy,
          z: fz,
          colorIndex: wrapIndex(i + p + cx + cz, FLOWER_COLORS.length)
        });
      }
    }
  }

  const trunkMesh = buildInstanced(
    trunkGeometry,
    trunkMaterial,
    trees,
    (obj, tree) => {
      obj.position.set(tree.x, tree.y, tree.z);
      obj.rotation.set(0, tree.rotation, 0);
      obj.scale.setScalar(tree.scale);
    }
  );

  // Arbres et buissons partagent la géométrie de houppier : un seul appel de rendu.
  const crownMesh = buildInstanced(
    crownGeometry,
    crownMaterial,
    [...trees, ...bushes],
    (obj, item) => {
      const sink = item.bushy ? 0.82 * item.scale : 0;

      obj.position.set(item.x, item.y - sink, item.z);
      obj.rotation.set(0, item.rotation, 0);
      obj.scale.setScalar(item.scale);
    },
    (item) => biomeTreeColors[item.biomeIndex]
  );

  const rockMesh = buildInstanced(
    rockGeometry,
    rockMaterial,
    rocks,
    (obj, rock) => {
      obj.position.set(rock.x, rock.y + 0.25 * rock.scale, rock.z);
      obj.rotation.set(rock.seed * 0.7, rock.seed * Math.PI * 1.8, 0);
      obj.scale.set(
        rock.scale,
        rock.scale * (0.58 + rock.seed * 0.2),
        rock.scale * 0.9
      );
    }
  );

  const flowerMesh = buildInstanced(
    flowerGeometry,
    flowerMaterial,
    flowers,
    (obj, flower) => {
      obj.position.set(flower.x, flower.y + 0.14, flower.z);
      obj.rotation.set(0, 0, 0);
      obj.scale.setScalar(1);
    },
    (flower) => FLOWER_COLORS[flower.colorIndex]
  );

  for (const mesh of [trunkMesh, crownMesh, rockMesh, flowerMesh]) {
    if (mesh) group.add(mesh);
  }

  scene.add(group);
  chunks.set(key, group);
  discovered.add(key);

  if (DIAG) applyDiagVisibility();
}

function disposeChunk(group) {
  scene.remove(group);

  group.traverse((object) => {
    // Seules les géométries propres au chunk sont libérées : les géométries
    // d'arbres, rochers et fleurs sont mutualisées entre tous les chunks.
    if (object.userData?.ownedGeometry && object.geometry) {
      object.geometry.dispose();
    }

    // Libère les tampons d'instances (matrices et couleurs).
    if (object.isInstancedMesh) object.dispose();
  });
}

function refreshChunks(force = false) {
  const cx = Math.floor(player.position.x / CHUNK_SIZE);
  const cz = Math.floor(player.position.z / CHUNK_SIZE);
  const key = `${cx},${cz}`;

  if (!force && key === activeChunkKey) return;
  activeChunkKey = key;

  buildQueue.length = 0;

  for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      const nx = cx + dx;
      const nz = cz + dz;

      if (chunks.has(`${nx},${nz}`)) continue;

      // Les chunks proches sont construits en premier.
      buildQueue.push({ cx: nx, cz: nz, priority: dx * dx + dz * dz });
    }
  }

  buildQueue.sort((a, b) => a.priority - b.priority);

  // Au démarrage ou après un changement de monde, tout est bâti immédiatement.
  if (force) flushBuildQueue();

  for (const [chunkKey, group] of [...chunks.entries()]) {
    const [chunkX, chunkZ] = chunkKey.split(",").map(Number);

    if (
      Math.abs(chunkX - cx) > CHUNK_RADIUS ||
      Math.abs(chunkZ - cz) > CHUNK_RADIUS
    ) {
      disposeChunk(group);
      chunks.delete(chunkKey);
    }
  }
}

/**
 * Construit au plus `budget` chunks par image : franchir une frontière demande
 * jusqu'à 5 chunks, les bâtir d'un coup provoquait un à-coup visible.
 */
function processBuildQueue(budget = 1) {
  let built = 0;

  while (buildQueue.length > 0 && built < budget) {
    const next = buildQueue.shift();
    createChunk(next.cx, next.cz);
    built++;
  }

  return built;
}

function flushBuildQueue() {
  while (buildQueue.length > 0) {
    const next = buildQueue.shift();
    createChunk(next.cx, next.cz);
  }
}

function clearWorld() {
  for (const group of chunks.values()) {
    disposeChunk(group);
  }

  chunks.clear();
  discovered.clear();
  buildQueue.length = 0;
}

function currentBiome() {
  return BIOMES[dominantBiomeIndex(player.position.x, player.position.z)];
}

function saveGame() {
  const data = {
    seed: worldSeed,
    x: Number(player.position.x.toFixed(3)),
    z: Number(player.position.z.toFixed(3)),
    yaw: Number(cameraYaw.toFixed(3)),
    pitch: Number(cameraPitch.toFixed(3)),
    discovered: [...discovered].slice(-MAX_SAVED_DISCOVERED)
  };

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // La sauvegarde n'est pas essentielle au fonctionnement du prototype.
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);

    if (
      !Number.isFinite(data.seed) ||
      !Number.isFinite(data.x) ||
      !Number.isFinite(data.z)
    ) {
      return false;
    }

    worldSeed = Math.floor(data.seed);
    player.position.x = data.x;
    player.position.z = data.z;
    cameraYaw = Number.isFinite(data.yaw) ? data.yaw : 0;
    cameraPitch = Number.isFinite(data.pitch)
      ? clampPitch(data.pitch)
      : 0.5;

    if (Array.isArray(data.discovered)) {
      for (const key of data.discovered) {
        if (typeof key === "string") discovered.add(key);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function clampPitch(value) {
  return Math.min(CAMERA_PITCH_MAX, Math.max(CAMERA_PITCH_MIN, value));
}

function startNewWorld() {
  clearWorld();

  worldSeed = Math.floor(100000 + Math.random() * 899999);
  activeChunkKey = "";
  cameraYaw = 0;
  cameraPitch = 0.5;

  player.position.set(1.5, 0, 1.5);
  player.position.y = terrainHeight(player.position.x, player.position.z);

  refreshChunks(true);
  snapCamera();
  updateHud(true);
  saveGame();
}

function resumeOrCreateWorld() {
  clearWorld();

  if (!loadGame()) {
    worldSeed = Math.floor(100000 + Math.random() * 899999);
    player.position.set(1.5, 0, 1.5);
  }

  activeChunkKey = "";
  player.position.y = terrainHeight(player.position.x, player.position.z);
  refreshChunks(true);
  snapCamera();
  updateHud(true);
}

// Le HUD n'est réécrit que lorsqu'une valeur change réellement.
const hudCache = {};

function setHudText(element, key, value) {
  if (hudCache[key] === value) return;
  hudCache[key] = value;
  element.textContent = value;
}

function updateHud(force = false) {
  if (force) for (const key of Object.keys(hudCache)) delete hudCache[key];

  setHudText(biomeEl, "biome", currentBiome().name);
  setHudText(
    coordsEl,
    "coords",
    `X ${player.position.x.toFixed(1)} · Z ${player.position.z.toFixed(1)}`
  );
  setHudText(chunksEl, "chunks", `${chunks.size} chunks actifs`);
  setHudText(discoveredEl, "discovered", `${discovered.size} découverts`);
  setHudText(seedEl, "seed", `Seed ${worldSeed}`);
}

function updateJoystick(clientX, clientY) {
  const rect = joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = rect.width * 0.31;

  let dx = clientX - centerX;
  let dy = clientY - centerY;

  const length = Math.hypot(dx, dy);

  if (length > radius) {
    dx = (dx / length) * radius;
    dy = (dy / length) * radius;
  }

  joystickVector.x = dx / radius;
  joystickVector.y = dy / radius;
  stick.style.transform = `translate(${dx}px, ${dy}px)`;
}

function releaseJoystick(event) {
  if (event && joystickPointer !== null && event.pointerId !== joystickPointer) {
    return;
  }

  joystickPointer = null;
  joystickVector.x = 0;
  joystickVector.y = 0;
  stick.style.transform = "translate(0, 0)";
}

/** setPointerCapture lève si le pointeur n'est plus actif : jamais bloquant. */
function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Le pointeur a déjà été relâché, la capture n'est qu'un confort.
  }
}

joystick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  joystickPointer = event.pointerId;
  capturePointer(joystick, event.pointerId);
  updateJoystick(event.clientX, event.clientY);
});

joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId !== joystickPointer) return;
  event.preventDefault();
  updateJoystick(event.clientX, event.clientY);
});

joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);
joystick.addEventListener("lostpointercapture", releaseJoystick);

canvas.addEventListener("pointerdown", (event) => {
  if (cameraPointer !== null) return;
  if (event.clientX < window.innerWidth * 0.42) return;

  cameraPointer = event.pointerId;
  cameraLastX = event.clientX;
  cameraLastY = event.clientY;
  capturePointer(canvas, event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== cameraPointer) return;

  const dx = event.clientX - cameraLastX;
  const dy = event.clientY - cameraLastY;

  cameraLastX = event.clientX;
  cameraLastY = event.clientY;

  cameraYaw -= dx * 0.0085;
  cameraPitch = clampPitch(cameraPitch + dy * 0.005);
});

const releaseCamera = (event) => {
  if (event.pointerId === cameraPointer) {
    cameraPointer = null;
  }
};

canvas.addEventListener("pointerup", releaseCamera);
canvas.addEventListener("pointercancel", releaseCamera);
canvas.addEventListener("lostpointercapture", releaseCamera);

runButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  running = true;
  runButton.classList.add("active");
});

const stopRunning = () => {
  running = false;
  runButton.classList.remove("active");
};

runButton.addEventListener("pointerup", stopRunning);
runButton.addEventListener("pointercancel", stopRunning);
runButton.addEventListener("pointerleave", stopRunning);

newWorldButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Rien à faire : on repart quand même sur un nouveau monde.
  }
  startNewWorld();
});

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

// Le clavier reste actif si l'onglet perd le focus : on relâche tout.
window.addEventListener("blur", () => {
  keys.clear();
  releaseJoystick();
  stopRunning();
});

window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});

function keyboardMovement() {
  let x = 0;
  let z = 0;

  if (keys.has("arrowleft") || keys.has("a") || keys.has("q")) x -= 1;
  if (keys.has("arrowright") || keys.has("d")) x += 1;
  if (keys.has("arrowup") || keys.has("w") || keys.has("z")) z -= 1;
  if (keys.has("arrowdown") || keys.has("s")) z += 1;

  const length = Math.hypot(x, z);

  if (length > 1) {
    x /= length;
    z /= length;
  }

  keyboardVector.x = x;
  keyboardVector.z = z;
  return keyboardVector;
}

function animatePlayer(moving, sprinting, delta) {
  const { body, head, leftLeg, rightLeg, leftArm, rightArm } = player.userData;

  if (moving) {
    idleTime = 0;
    walkTime += delta * (sprinting ? 12 : 8);

    const swing = Math.sin(walkTime) * (sprinting ? 0.62 : 0.42);

    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    leftArm.rotation.x = -swing * 0.78;
    rightArm.rotation.x = swing * 0.78;

    // Buste légèrement penché en avant à la course.
    body.rotation.x = sprinting ? 0.16 : 0.06;
    body.position.y = 1.15;
    head.position.y = 1.95;

    player.position.y += Math.abs(Math.sin(walkTime * 2)) * 0.025;
  } else {
    const settle = Math.min(1, delta * 10);

    leftLeg.rotation.x *= 1 - settle;
    rightLeg.rotation.x *= 1 - settle;
    leftArm.rotation.x *= 1 - settle;
    rightArm.rotation.x *= 1 - settle;
    body.rotation.x *= 1 - settle;

    // Respiration : le personnage ne se fige pas complètement à l'arrêt.
    idleTime += delta;
    const breath = Math.sin(idleTime * 1.7) * 0.012;

    body.position.y = 1.15 + breath;
    head.position.y = 1.95 + breath * 1.6;
  }
}

function snapCamera() {
  const horizontal = Math.cos(cameraPitch) * CAMERA_DISTANCE;
  const vertical = Math.sin(cameraPitch) * CAMERA_DISTANCE;

  camera.position.set(
    player.position.x - Math.sin(cameraYaw) * horizontal,
    player.position.y + vertical + 1.4,
    player.position.z + Math.cos(cameraYaw) * horizontal
  );

  camera.lookAt(
    player.position.x,
    player.position.y + 1.25,
    player.position.z
  );
}

function applyPixelRatio() {
  const target = Math.min(
    window.devicePixelRatio || 1,
    PIXEL_RATIO_STEPS[pixelStep]
  );

  renderer.setPixelRatio(target);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

let resizeTimer = 0;

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

// Sur mobile, l'apparition/disparition de la barre d'URL déclenche des resize
// en rafale : on les regroupe.
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 120);
});

window.addEventListener("orientationchange", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 220);
});

resize();
resumeOrCreateWorld();

let lastTime = performance.now();
let hudTimer = 0;
let saveTimer = 0;
let firstFrameDone = false;

// Mesure glissante des FPS pour l'adaptation de résolution.
let fpsWindowTime = 0;
let fpsWindowFrames = 0;
let goodWindows = 0;

function updateAdaptiveResolution(delta) {
  fpsWindowTime += delta;
  fpsWindowFrames++;

  if (fpsWindowTime < 2.5) return;

  const fps = fpsWindowFrames / fpsWindowTime;

  fpsWindowTime = 0;
  fpsWindowFrames = 0;

  if (fps < 38 && pixelStep < PIXEL_RATIO_STEPS.length - 1) {
    pixelStep++;
    goodWindows = 0;
    applyPixelRatio();
    return;
  }

  // Le seuil de remontée était à 57 alors que l'affichage plafonne à 60 : un
  // téléphone stabilisé à 50-56 ne remontait jamais. 52 laisse la marge.
  if (fps > 52 && pixelStep > 0) {
    goodWindows++;

    if (goodWindows >= 2) {
      pixelStep--;
      goodWindows = 0;
      applyPixelRatio();
    }
  } else {
    goodWindows = 0;
  }
}

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;

  const keyboard = keyboardMovement();

  let localX = joystickVector.x + keyboard.x;
  let localZ = joystickVector.y + keyboard.z;

  const magnitude = Math.hypot(localX, localZ);
  const moving = magnitude > 0.08;
  const sprinting = running || keys.has("shift");

  if (moving) {
    if (magnitude > 1) {
      localX /= magnitude;
      localZ /= magnitude;
    }

    const forwardX = Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = Math.sin(cameraYaw);

    const moveX = rightX * localX + forwardX * -localZ;
    const moveZ = rightZ * localX + forwardZ * -localZ;

    const speed = PLAYER_SPEED * (sprinting ? RUN_MULTIPLIER : 1);

    player.position.x += moveX * speed * delta;
    player.position.z += moveZ * speed * delta;

    player.rotation.y = Math.atan2(moveX, moveZ);

    refreshChunks();
  }

  const ground = terrainHeight(player.position.x, player.position.z);
  player.position.y = Math.max(ground, -2.45);

  animatePlayer(moving, sprinting, delta);

  // Étalement de la génération sur plusieurs images.
  processBuildQueue(2);

  water.position.x = player.position.x;
  water.position.z = player.position.z;

  const horizontal = Math.cos(cameraPitch) * CAMERA_DISTANCE;
  const vertical = Math.sin(cameraPitch) * CAMERA_DISTANCE;

  desiredCamera.set(
    player.position.x - Math.sin(cameraYaw) * horizontal,
    player.position.y + vertical + 1.4,
    player.position.z + Math.cos(cameraYaw) * horizontal
  );

  camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, delta));

  camera.lookAt(
    player.position.x,
    player.position.y + 1.25,
    player.position.z
  );

  sun.position.set(
    player.position.x + SUN_OFFSET.x,
    player.position.y + SUN_OFFSET.y,
    player.position.z + SUN_OFFSET.z
  );

  hudTimer += delta;
  saveTimer += delta;

  if (hudTimer > 0.16) {
    updateHud();
    hudTimer = 0;
  }

  if (saveTimer > 4) {
    saveGame();
    saveTimer = 0;
  }

  updateAdaptiveResolution(delta);

  renderer.render(scene, camera);

  if (!firstFrameDone) {
    firstFrameDone = true;
    document.body.classList.add("ready");
    // Laisse le fondu se jouer avant de retirer l'écran de chargement.
    setTimeout(() => loading?.remove(), 700);
  }
}

animate();

// ---------------------------------------------------------------------------
// Mode diagnostic : ?diag dans l'URL.
// Sert à isoler sur l'appareil un artefact non reproductible en test. Chaque
// bouton retire une famille d'objets de la scène ; celui qui fait disparaître
// l'artefact le désigne. Inactif — et non construit — sans le paramètre.
// ---------------------------------------------------------------------------
function applyDiagVisibility() {
  if (!DIAG) return;

  water.visible = diagVisible.eau;
  sun.visible = diagVisible.soleil;

  for (const group of chunks.values()) {
    for (const child of group.children) {
      if (!child.isInstancedMesh) {
        child.visible = diagVisible.terrain;
      } else if (child.geometry === trunkGeometry) {
        child.visible = diagVisible.troncs;
      } else if (child.geometry === crownGeometry) {
        child.visible = diagVisible.houppiers;
      } else if (child.geometry === rockGeometry) {
        child.visible = diagVisible.rochers;
      } else if (child.geometry === flowerGeometry) {
        child.visible = diagVisible.fleurs;
      }
    }
  }
}

function buildDiagPanel() {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const frag = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);

  const panel = document.createElement("div");
  panel.id = "diag";

  const info = document.createElement("div");
  info.className = "diag-info";
  info.textContent =
    `depth ${gl.getParameter(gl.DEPTH_BITS)} · stencil ${gl.getParameter(gl.STENCIL_BITS)} · ` +
    `msaa ${gl.getParameter(gl.SAMPLES)} · highp ${frag ? frag.precision : "?"} · ` +
    `dpr ${(window.devicePixelRatio || 1).toFixed(2)} · pr ${renderer.getPixelRatio().toFixed(2)}\n` +
    (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "GPU inconnu");
  panel.appendChild(info);

  const row = document.createElement("div");
  row.className = "diag-row";

  for (const key of Object.keys(diagVisible)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = key;
    button.className = "on";
    button.addEventListener("click", () => {
      diagVisible[key] = !diagVisible[key];
      button.className = diagVisible[key] ? "on" : "off";
      applyDiagVisibility();
    });
    row.appendChild(button);
  }

  // Éclairage : bascule tous les matériaux en couleur plate, sans lumière.
  // Si le noir disparaît ainsi, il vient du calcul d'éclairement (normales).
  const unlit = document.createElement("button");
  unlit.type = "button";
  unlit.textContent = "sans lumière";
  unlit.className = "on";
  unlit.addEventListener("click", () => {
    diagUnlit = !diagUnlit;
    hemiLight.intensity = diagUnlit ? 0 : 2.15;
    sunLight.intensity = diagUnlit ? 0 : 2.35;
    ambient.intensity = diagUnlit ? 3.2 : 0;
    unlit.className = diagUnlit ? "off" : "on";
  });
  row.appendChild(unlit);

  // Le flou d'arrière-plan de l'interface relit le canevas à chaque image.
  const flou = document.createElement("button");
  flou.type = "button";
  flou.textContent = "flou UI";
  flou.className = "on";
  flou.addEventListener("click", () => {
    diagFlou = !diagFlou;
    document.body.classList.toggle("no-blur", !diagFlou);
    flou.className = diagFlou ? "on" : "off";
  });
  row.appendChild(flou);

  panel.appendChild(row);
  document.body.appendChild(panel);
}

// Lumière plate utilisée uniquement par le mode diagnostic.
const ambient = new THREE.AmbientLight(0xffffff, 0);
scene.add(ambient);

if (DIAG) {
  buildDiagPanel();
  applyDiagVisibility();
}

// Sonde de diagnostic, utilisée par les tests automatisés.
window.HORIZON = {
  get chunks() { return chunks.size; },
  get discovered() { return discovered.size; },
  get seed() { return worldSeed; },
  get pos() { return { x: player.position.x, y: player.position.y, z: player.position.z }; },
  get yaw() { return cameraYaw; },
  get pitch() { return cameraPitch; },
  get pixelRatio() { return renderer.getPixelRatio(); },
  get biome() { return currentBiome().name; },
  get queued() { return buildQueue.length; },
  get info() {
    return {
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? -1
    };
  },
  get objectsInScene() { let n = 0; scene.traverse(() => n++); return n; },
  get instances() {
    const tally = { trunks: 0, crowns: 0, rocks: 0, flowers: 0 };

    for (const group of chunks.values()) {
      for (const child of group.children) {
        if (!child.isInstancedMesh) continue;
        if (child.geometry === trunkGeometry) tally.trunks += child.count;
        else if (child.geometry === crownGeometry) tally.crowns += child.count;
        else if (child.geometry === rockGeometry) tally.rocks += child.count;
        else if (child.geometry === flowerGeometry) tally.flowers += child.count;
      }
    }

    return tally;
  },
  get camPos() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z }; },
  move(dx, dy) { joystickVector.x = dx; joystickVector.y = dy; },
  setRun(value) { running = value; },
  setYaw(value) { cameraYaw = value; },
  setPitch(value) { cameraPitch = clampPitch(value); },

  // --- Hooks d'audit ---
  get depthBits() {
    const gl = renderer.getContext();
    return {
      depth: gl.getParameter(gl.DEPTH_BITS),
      stencil: gl.getParameter(gl.STENCIL_BITS),
      samples: gl.getParameter(gl.SAMPLES),
      renderer: (() => {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "n/a";
      })()
    };
  },
  get nearFar() { return { near: camera.near, far: camera.far }; },
  setNearFar(near, far) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  },
  get heapMB() {
    const m = performance.memory;
    return m ? {
      used: +(m.usedJSHeapSize / 1048576).toFixed(2),
      total: +(m.totalJSHeapSize / 1048576).toFixed(2)
    } : null;
  },
  get waterY() { return water.position.y; },
  terrainAt(x, z) { return terrainHeight(x, z); },
  teleport(x, z) {
    player.position.x = x;
    player.position.z = z;
    player.position.y = Math.max(terrainHeight(x, z), -2.45);
    refreshChunks(true);
    snapCamera();
    updateHud(true);
  },
  newWorld() { startNewWorld(); },
  setSeed(seed, x = 1.5, z = 1.5) {
    clearWorld();
    worldSeed = Math.floor(seed);
    activeChunkKey = "";
    player.position.set(x, 0, z);
    player.position.y = Math.max(terrainHeight(x, z), -2.45);
    refreshChunks(true);
    snapCamera();
    updateHud(true);
    return { seed: worldSeed, pos: window.HORIZON.pos };
  },
  /** Couleurs d'instance nulles = objet rendu en noir pur (le matériau est blanc). */
  scanBlackInstances() {
    const bad = [];
    for (const [key, group] of chunks.entries()) {
      for (const child of group.children) {
        if (!child.isInstancedMesh || !child.instanceColor) continue;
        const a = child.instanceColor.array;
        for (let i = 0; i < child.count; i++) {
          if (a[i*3] === 0 && a[i*3+1] === 0 && a[i*3+2] === 0) {
            bad.push({ chunk: key, instance: i, count: child.count,
                       bufferLength: a.length, expected: child.count * 3 });
          }
        }
      }
    }
    return bad;
  },
  /** Cherche des instances à l'échelle ou à la position aberrante. */
  scanGiantInstances(maxScale = 5, maxDist = 200) {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const bad = [];
    for (const [key, group] of chunks.entries()) {
      for (const child of group.children) {
        if (!child.isInstancedMesh) continue;
        for (let i = 0; i < child.count; i++) {
          child.getMatrixAt(i, m);
          m.decompose(pos, quat, scl);
          const s = Math.max(scl.x, scl.y, scl.z);
          if (!Number.isFinite(s) || s > maxScale || pos.length() > maxDist) {
            bad.push({ chunk: key, instance: i, scale: [scl.x, scl.y, scl.z],
                       pos: [pos.x, pos.y, pos.z] });
          }
        }
      }
    }
    return bad;
  },
  timeSave(n = 30) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) saveGame();
    const ms = (performance.now() - t0) / n;
    return { msParEcriture: +ms.toFixed(3), octets: (localStorage.getItem(SAVE_KEY) || "").length,
             decouverts: discovered.size };
  },
  get chunkKeys() { return [...chunks.keys()]; },

  /**
   * Déplace la caméra d'une fraction d'unité et compare les deux images.
   * Une surface saine bouge de quelques pixels ; deux surfaces qui se
   * disputent la profondeur basculent sur de larges zones.
   */
  jitterTest(delta = 0.01, threshold = 12) {
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    const grab = () => {
      renderer.render(scene, camera);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };

    const before = grab();
    camera.position.y += delta;
    camera.updateMatrixWorld(true);
    const after = grab();
    camera.position.y -= delta;
    camera.updateMatrixWorld(true);

    let diff = 0;
    for (let i = 0; i < before.length; i += 4) {
      const d = Math.max(
        Math.abs(before[i] - after[i]),
        Math.abs(before[i + 1] - after[i + 1]),
        Math.abs(before[i + 2] - after[i + 2])
      );
      if (d > threshold) diff++;
    }

    return { differing: diff, total: w * h, fraction: +(diff / (w * h)).toFixed(5) };
  },

  /**
   * Rend deux fois la même scène avec deux réglages near/far et compare les
   * tampons pixel à pixel. Même image, même résolution : toute différence
   * vient de la précision de profondeur.
   */
  compareNearFar(a, b, threshold = 12) {
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    const grab = ([near, far]) => {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);

      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };

    const pa = grab(a);
    const pb = grab(b);

    let diff = 0;
    for (let i = 0; i < pa.length; i += 4) {
      const d = Math.max(
        Math.abs(pa[i] - pb[i]),
        Math.abs(pa[i + 1] - pb[i + 1]),
        Math.abs(pa[i + 2] - pb[i + 2])
      );
      if (d > threshold) diff++;
    }

    return { differing: diff, total: w * h, fraction: +(diff / (w * h)).toFixed(5), w, h };
  },

  /**
   * Rend une image puis relit le tampon : mesure la proportion de pixels
   * voisins fortement discordants. Le z-fighting produit un moucheté à haute
   * fréquence, invisible pour cette métrique sur un rendu low-poly sain.
   */
  speckle(threshold = 40) {
    renderer.render(scene, camera);

    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4);

    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let noisy = 0;
    let total = 0;

    // Bande médiane verticale : on ignore le HUD et les bords.
    for (let y = Math.floor(h * 0.15); y < Math.floor(h * 0.85); y++) {
      for (let x = 1; x < w - 1; x++) {
        const a = (y * w + x) * 4;
        const b = (y * w + x + 1) * 4;
        const d = Math.max(
          Math.abs(pixels[a] - pixels[b]),
          Math.abs(pixels[a + 1] - pixels[b + 1]),
          Math.abs(pixels[a + 2] - pixels[b + 2])
        );

        if (d > threshold) noisy++;
        total++;
      }
    }

    return { noisyFraction: +(noisy / total).toFixed(5), noisy, total, w, h };
  },

  /** Cherche des coordonnées ou couleurs non finies dans toutes les géométries en scène. */
  scanNonFinite() {
    const bad = [];

    scene.traverse((object) => {
      const geometry = object.geometry;
      if (!geometry || !geometry.attributes) return;

      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const array = attribute.array;

        for (let i = 0; i < array.length; i++) {
          if (!Number.isFinite(array[i])) {
            bad.push({ object: object.type, attribute: name, index: i, value: String(array[i]) });
            break;
          }
        }
      }

      if (object.isInstancedMesh) {
        const m = object.instanceMatrix.array;
        for (let i = 0; i < m.length; i++) {
          if (!Number.isFinite(m[i])) { bad.push({ object: "instanceMatrix", index: i }); break; }
        }
      }

      const p = object.position;
      if (p && (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) {
        bad.push({ object: object.type, attribute: "position", value: `${p.x},${p.y},${p.z}` });
      }
    });

    return bad;
  }
};
