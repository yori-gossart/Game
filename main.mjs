import * as THREE from "./vendor/three/three.module.min.js";
import { createFogNomad } from "./fognomad.mjs";
import { bindRunUI, bindPerfOverlay } from "./fognomad-ui.mjs";
import { demarrerAudio, mettreAJourAudio, sons, audioDisponible } from "./audio.mjs";

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

// Paliers de qualité. Déclarés ici, avec les constantes de rendu, parce que la
// génération du premier chunk lit `facteurDecor()` : les déclarer plus bas
// mettait `qualite` dans sa zone morte temporelle et empêchait le démarrage.
const QUALITE_NIVEAUX = ["haute", "moyenne", "basse"];
let qualite = 0;

/** Densité de décor, appliquée à la génération des chunks. */
function facteurDecor() {
  return [1, 0.55, 0][qualite];
}
let pixelStep = 0;

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_STEPS[0]));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

// Le monde est beau mais il meurt. Devant, une lumière pâle et chaude vers
// laquelle on fuit ; derrière, un ciel froid déjà gagné par la brume. Le joueur
// doit pouvoir lire « où est l'espoir » d'un seul regard, sans texte.
const SKY_COLOR = 0x9dc0cd;
const FOG_COLOR = 0xb9cbd0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);

// Ciel : une demi-sphère retournée dont le dégradé passe par les couleurs de
// sommets. Un seul appel de rendu, aucune texture, aucun shader.
//
// 0.5 — le dégradé n'est plus seulement vertical. Il est aussi DIRECTIONNEL :
// le joueur fuit vers les Z décroissants, donc le −Z du ciel s'éclaircit et se
// réchauffe (l'horizon vers lequel on va) tandis que le +Z se refroidit et
// s'assombrit vers le prune de la brume. Comme le dôme suit la caméra sans
// tourner avec elle, cette opposition reste vraie quel que soit le regard.
const SKY_ZENITH      = new THREE.Color(0x3f6f9c);
const SKY_AVANT       = new THREE.Color(0xf0d9b4);   // −Z : l'horizon d'espoir
const SKY_ARRIERE     = new THREE.Color(0x6a5f7d);   // +Z : déjà contaminé
const SKY_ZENITH_BACK = new THREE.Color(0x2e2a42);

const skyDome = (() => {
  const geometry = new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const bas = new THREE.Color();
  const haut = new THREE.Color();
  const tint = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const y = Math.max(0, position.getY(i));
    const z = position.getZ(i);
    const rayon = Math.hypot(position.getX(i), z) || 1;

    // 0 plein avant (−Z), 1 plein arrière (+Z). Adouci pour que la bascule se
    // fasse sur les côtés et non par une couture nette.
    const arriere = Math.min(1, Math.max(0, (z / rayon) * 0.5 + 0.5));
    const doux = arriere * arriere * (3 - 2 * arriere);

    bas.copy(SKY_AVANT).lerp(SKY_ARRIERE, doux);
    haut.copy(SKY_ZENITH).lerp(SKY_ZENITH_BACK, doux);

    // 0 à l'horizon, 1 au zénith, avec une transition resserrée vers le bas.
    const t = Math.pow(y, 0.62);
    tint.copy(bas).lerp(haut, t);

    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute("uv");
  geometry.deleteAttribute("normal");

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    })
  );

  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
})();

scene.add(skyDome);

const CHUNK_SIZE = 32;
const CHUNK_RADIUS = 2;
const CHUNK_SEGMENTS = 16;
const PLAYER_SPEED = 6.2;
const CAMERA_DISTANCE = 13;
// Plancher de distance caméra : en dessous, le personnage occupe tout l'écran.
const CAMERA_DISTANCE_MIN = 4.5;
// Débordement de l'avant-garde de brume vers le joueur (voir CONFIG.fog dans
// fognomad.mjs, nappe d'ordre 6) et marge de sécurité de la caméra.
const FOG_VANGUARD = 8;
const FOG_CAMERA_MARGE = 2.5;
const RUN_MULTIPLIER = 1.8;
const SAVE_KEY = "horizon-proto-0.2-save";

// Mode diagnostic (?diag) : déclaré ici car createChunk le consulte, et les
// premiers chunks sont bâtis pendant l'évaluation du module.
const PARAMS = new URLSearchParams(location.search);
const DIAG = PARAMS.has("diag");
const FOGTEST = PARAMS.has("fogtest") || DIAG;

const diagVisible = {
  terrain: true, troncs: true, houppiers: true, rochers: true,
  fleurs: true, eau: true, soleil: true,
  // Familles et objets ajoutés en 0.5.
  boismort: true, arbustes: true, herbes: true, structures: true
};

/**
 * Bascules 0.5, à isoler une par une SUR L'APPAREIL.
 *
 * L'artefact des fleurs de la 0.2 a coûté cinq hypothèses fausses formulées à
 * distance ; il n'a été résolu que le jour où l'appareil a pu désactiver une
 * propriété à la fois. Toute nouveauté de la 0.5 susceptible de mal se
 * comporter sur un GPU mobile a donc son interrupteur.
 */
const diagFeature = {
  // Instanciation : l'artefact des grands polygones noirs de la 0.2 venait de
  // là, et rien n'a jamais expliqué pourquoi. Couper cet interrupteur redessine
  // tout le monde en géométries fusionnées — le chemin de rendu qui, lui, a
  // toujours fonctionné sur l'appareil.
  instanciation: true,
  // Le shader de contamination : la seule injection GLSL du projet, donc le
  // premier suspect si quelque chose vire au noir ou refuse de compiler.
  contamination: true,
  // Ambiance de danger : teinte du brouillard, assombrissement du ciel.
  danger: true,
  // Nappes de brume arrière (profondeur) et effacement devant l'objectif.
  brumeProfonde: true,
  ciel: true,
  audio: true
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
// Horloge de scène, pour les animations d'ambiance qui ne dépendent ni de la
// run ni du joueur (balises, respiration de la brume).
let elapsedTotal = 0;

// Ambiance de danger : distance à partir de laquelle la bascule commence.
const DANGER_DISTANCE = 95;
const FOG_TINT_SAFE = new THREE.Color(FOG_COLOR);
const FOG_TINT_DANGER = new THREE.Color(0x4a3c58);
const SUN_INTENSITY = sunLight.intensity;
const HEMI_INTENSITY = hemiLight.intensity;

const CAMERA_PITCH_MIN = 0.12;
const CAMERA_PITCH_MAX = 0.98;

const chunks = new Map();
// Cœurs de balise en scène : suivis pour tourner, oubliés avec leur chunk.
const balises = new Set();
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

// Teintes de zone, mélangées au sol par-dessus la couleur de biome.
const ROC_COLOR = new THREE.Color(0x8c8b84);
const SEC_COLOR = new THREE.Color(0xa8925f);
const CLAIRIERE_COLOR = new THREE.Color(0x9fb872);

const biomeColors = BIOMES.map((biome) => new THREE.Color(biome.terrain));
const biomeTreeColors = BIOMES.map((biome) => new THREE.Color(biome.tree));

// ---------------------------------------------------------------------------
// Contamination — le monde meurt derrière le joueur.
//
// La brume ne se contente plus d'avaler : elle déteint. À l'approche du mur,
// la végétation se décolore, le sol vire au froid et le contraste tombe. Le
// joueur doit sentir que ce qu'il laisse derrière lui est perdu, pas seulement
// caché.
//
// Implémentation : une seule paire d'uniformes partagée par tous les matériaux
// du monde, injectée par onBeforeCompile. Le facteur se calcule à partir du Z
// monde du fragment et de la position courante de la brume — donc aucun coût
// par objet, aucune couleur de sommet à recalculer, et rien à refaire quand un
// chunk se recrée. Trois instructions dans le fragment shader.
const contamination = {
  fogZ: { value: 1e9 },
  // Distance sur laquelle la décoloration s'installe avant le mur. Calée sur
  // la portée de vue : le monde proche reste vivant et coloré, seule la bande
  // qui va être avalée se décolore. Plus court, la bande mourante était
  // masquée par le brouillard atmosphérique, qui éclaircit précisément là où
  // la contamination assombrit — les deux effets se neutralisaient.
  range: { value: 62 },   // voir CONTAM_RANGE
  // Vers quoi le monde tend : un gris-prune froid et désaturé.
  color: { value: new THREE.Color(0x4a4658) }
};

/**
 * Rend un matériau sensible à la contamination. À appeler sur tout matériau
 * du monde ; les objets d'interface et le ciel en sont exclus volontairement.
 */
// Portée nominale, mémorisée pour que le mode diagnostic puisse la couper
// puis la rétablir.
const CONTAM_RANGE = contamination.range.value;

function contaminable(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uContamFogZ = contamination.fogZ;
    shader.uniforms.uContamRange = contamination.range;
    shader.uniforms.uContamColor = contamination.color;

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vContamZ;")
      .replace(
        "#include <fog_vertex>",
        // La matrice d'instance n'est PAS dans modelMatrix : sans ce cas,
        // toutes les instances d'un chunk partageaient le Z du chunk, soit
        // jusqu'à 16 unités d'erreur sur des arbres voisins.
        "#include <fog_vertex>\n" +
        "#ifdef USE_INSTANCING\n" +
        "  vContamZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).z;\n" +
        "#else\n" +
        "  vContamZ = (modelMatrix * vec4(transformed, 1.0)).z;\n" +
        "#endif"
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vContamZ;\n" +
        "uniform float uContamFogZ;\nuniform float uContamRange;\nuniform vec3 uContamColor;"
      )
      // Juste avant le brouillard atmosphérique : la contamination agit sur la
      // couleur éclairée, le brouillard s'applique ensuite comme d'habitude.
      .replace(
        "#include <fog_fragment>",
        "float contam = smoothstep(uContamFogZ - uContamRange, uContamFogZ, vContamZ);\n" +
        "gl_FragColor.rgb = mix(gl_FragColor.rgb, uContamColor, contam * 0.82);\n" +
        "#include <fog_fragment>"
      );
  };

  // Deux matériaux au même programme ne sont mutualisés que si leur clé de
  // cache concorde : sans cela Three.js réutiliserait un programme non patché.
  material.customProgramCacheKey = () => "contam";
  return material;
}

// Un seul matériau de terrain : la couleur de biome passe par les couleurs de
// sommets, ce qui fond les biomes entre eux au lieu de les découper au chunk.
const terrainMaterial = contaminable(new THREE.MeshLambertMaterial({
  vertexColors: true
}));

const rockMaterial = contaminable(new THREE.MeshLambertMaterial({ color: 0x7d7b73 }));

const trunkMaterial = contaminable(new THREE.MeshLambertMaterial({ color: 0x765336 }));

// Matériaux mutualisés : la teinte de feuillage et de fleur passe par la
// couleur d'instance, pas par un matériau supplémentaire par objet.
const crownMaterial = contaminable(new THREE.MeshLambertMaterial());

// Les fleurs sont fusionnées par chunk en une seule géométrie : la teinte
// passe donc par les couleurs de sommets, comme pour le terrain.
const flowerMaterial = contaminable(new THREE.MeshLambertMaterial({ vertexColors: true }));
const flowerInstancedMaterial = new THREE.MeshLambertMaterial();

/** Modulo toujours positif : les coordonnées de chunk peuvent être négatives. */
function wrapIndex(value, length) {
  return ((value % length) + length) % length;
}

const FLOWER_COLORS = [
  new THREE.Color(0xf2d07e),
  new THREE.Color(0xe8a3a1),
  new THREE.Color(0xd7d0f0)
];

// Matériaux dédiés par teinte : permettent de dessiner les fleurs sans passer
// par la couleur d'instance (variante de diagnostic 1 et 3).
const FLOWER_MATERIALS = FLOWER_COLORS.map(
  (color) => new THREE.MeshLambertMaterial({ color })
);

// Chaque variante ne change qu'UNE propriété par rapport à la variante 0,
// pour que le test sur appareil désigne une cause et non un faisceau.
// La variante 0 est celle du jeu. Les deux autres restent accessibles en mode
// diagnostic pour rejouer la comparaison qui a désigné la cause.
const FLOWER_VARIANTS = [
  "0 fusionnees (defaut)",
  "1 instanciees (ancien, defaillant)",
  "2 un objet par fleur"
];

let flowerVariant = 0;

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
 *
 * L'attribut `uv` est également supprimé. Aucun matériau du projet n'est
 * texturé, donc il n'est jamais lu — mais il occupe un emplacement d'attribut
 * de sommet. Les fleurs étaient le seul objet à cumuler `uv` et couleur
 * d'instance, soit huit emplacements là où tout le reste en utilise sept, et
 * elles étaient précisément le seul objet à se corrompre sur GPU mobile
 * (forme géante et noire : transformation et couleur lues au mauvais endroit).
 * Le supprimer partout aligne toutes les géométries sur le même agencement.
 */
function faceted(geometry) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();

  result.deleteAttribute("uv");
  result.deleteAttribute("uv1");
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

// ---------------------------------------------------------------------------
// Familles de végétation.
//
// 0.4 n'avait qu'un houppier, décliné par mise à l'échelle non uniforme. À
// l'usage cela restait « le même sapin recopié partout » : une silhouette ne
// se déguise pas en une autre par un facteur d'échelle.
//
// 0.5 en a donc quatre, chacune une géométrie fusionnée distincte, chacune
// instanciée par chunk. Le coût est de trois objets de scène supplémentaires
// par chunk — et zéro quand la famille est absente, `buildInstanced` rendant
// null sur une liste vide.
// ---------------------------------------------------------------------------

/** Conifère élancé : trois étages étroits, silhouette verticale. */
const coniferTallGeometry = (() => {
  const etages = [
    new THREE.ConeGeometry(0.82, 1.55, 6),
    new THREE.ConeGeometry(0.62, 1.35, 6),
    new THREE.ConeGeometry(0.4, 1.15, 6)
  ];
  etages[0].translate(0, 1.62, 0);
  etages[1].translate(0, 2.42, 0);
  etages[2].translate(0, 3.12, 0);

  const merged = mergeGeometries(etages);
  for (const g of etages) g.dispose();
  return faceted(merged);
})();

/** Conifère large : deux étages trapus, silhouette pyramidale. */
const coniferBroadGeometry = (() => {
  const etages = [
    new THREE.ConeGeometry(1.25, 1.5, 7),
    new THREE.ConeGeometry(0.85, 1.25, 7)
  ];
  etages[0].translate(0, 1.35, 0);
  etages[1].translate(0, 2.15, 0);

  const merged = mergeGeometries(etages);
  for (const g of etages) g.dispose();
  return faceted(merged);
})();

/**
 * Arbre mort : tronc et branches nues en une seule géométrie, sans houppier.
 * C'est la famille qui raconte que le monde se meurt — elle se densifie près
 * de la brume (voir createChunk).
 */
const deadTreeGeometry = (() => {
  const parts = [];

  const tronc = new THREE.CylinderGeometry(0.09, 0.17, 2.6, 5);
  tronc.translate(0, 1.3, 0);
  parts.push(tronc);

  // Quatre branches en oblique, longueurs et hauteurs dépareillées.
  const branches = [
    { l: 1.05, y: 2.05, a: 0.55, r: 0 },
    { l: 0.82, y: 1.62, a: -0.62, r: Math.PI * 0.62 },
    { l: 0.68, y: 2.35, a: 0.48, r: Math.PI * 1.15 },
    { l: 0.5,  y: 1.28, a: -0.5, r: Math.PI * 1.62 }
  ];

  for (const b of branches) {
    const g = new THREE.CylinderGeometry(0.035, 0.07, b.l, 4);
    g.translate(0, b.l / 2, 0);
    g.rotateZ(b.a);
    g.rotateY(b.r);
    g.translate(0, b.y, 0);
    parts.push(g);
  }

  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return faceted(merged);
})();

/** Arbuste : masse basse et irrégulière, sans tronc visible. */
const bushGeometry = (() => {
  const g = new THREE.IcosahedronGeometry(0.62, 0);
  g.scale(1, 0.66, 1);
  g.translate(0, 0.4, 0);
  return faceted(g);
})();

/** Touffe d'herbe : trois lames croisées, pour le couvert bas. */
const grassGeometry = (() => {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.ConeGeometry(0.07, 0.44, 3);
    g.translate(0, 0.22, 0);
    g.rotateZ((i - 1) * 0.28);
    g.rotateY(i * 2.1);
    g.translate((i - 1) * 0.09, 0, (i - 1) * 0.06);
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return faceted(merged);
})();

// ---------------------------------------------------------------------------
// Narration environnementale.
//
// Le monde doit poser des questions avant qu'un scénario y réponde. Il n'y a
// donc ni texte, ni quête, ni PNJ : seulement des traces. Quelqu'un a campé
// ici. Quelqu'un a bâti ça. Quelque chose fonctionne encore, et on ne sait pas
// pourquoi.
//
// Quatre catégories, toutes RARES : la fréquence est ce qui fait la question.
// Un camp abandonné dans chaque chunk n'est plus un camp abandonné, c'est du
// décor. Les tirages ci-dessous donnent une structure tous les ~14 chunks.
//
// Chaque structure est une géométrie fusionnée unique, construite une fois
// pour tout le jeu et instanciée par chunk : une structure coûte un appel de
// rendu, et un chunk sans structure n'en coûte aucun.
// ---------------------------------------------------------------------------

const structureMaterial = contaminable(new THREE.MeshLambertMaterial({ color: 0x6e6656 }));
const structureBoisMaterial = contaminable(new THREE.MeshLambertMaterial({ color: 0x4c3a29 }));

// La balise luit faiblement : c'est le seul objet du monde qui semble encore
// alimenté. Volontairement inexpliqué.
const baliseMaterial = new THREE.MeshLambertMaterial({
  color: 0x7fd8cf,
  emissive: 0x2f8f86,
  emissiveIntensity: 1.0
});

/** Camp abandonné : un feu mort, deux sacs, une perche. Quelqu'un a dormi là. */
const campGeometry = (() => {
  const parts = [];

  // Cercle de pierres autour d'un foyer éteint.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const g = new THREE.DodecahedronGeometry(0.17, 0);
    g.scale(1, 0.7, 1);
    g.translate(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
    parts.push(g);
  }

  // Bois calciné, retombé en croix.
  for (let i = 0; i < 3; i++) {
    const g = new THREE.CylinderGeometry(0.045, 0.045, 0.75, 4);
    g.rotateZ(Math.PI / 2 - 0.25);
    g.rotateY(i * 1.15);
    g.translate(0, 0.09, 0);
    parts.push(g);
  }

  // Deux ballots laissés sur place.
  const ballot = new THREE.BoxGeometry(0.42, 0.3, 0.34);
  ballot.translate(1.15, 0.15, 0.3);
  parts.push(ballot);

  const ballot2 = new THREE.BoxGeometry(0.3, 0.26, 0.3);
  ballot2.rotateY(0.6);
  ballot2.translate(-0.95, 0.13, -0.55);
  parts.push(ballot2);

  // Une perche plantée, penchée.
  const perche = new THREE.CylinderGeometry(0.04, 0.05, 1.9, 4);
  perche.translate(0, 0.95, 0);
  perche.rotateZ(0.22);
  perche.translate(-1.3, 0, 0.7);
  parts.push(perche);

  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return faceted(merged);
})();

/** Ruine : un pan de mur, une arche brisée, des pierres tombées. */
const ruineGeometry = (() => {
  const parts = [];

  const mur = new THREE.BoxGeometry(3.4, 2.5, 0.5);
  mur.translate(0, 1.25, 0);
  parts.push(mur);

  // Brèche : deux blocs qui poursuivent le mur, plus bas, avec un manque.
  const suite = new THREE.BoxGeometry(1.5, 1.4, 0.5);
  suite.translate(2.7, 0.7, 0);
  parts.push(suite);

  const moignon = new THREE.BoxGeometry(0.8, 0.7, 0.5);
  moignon.translate(-2.35, 0.35, 0);
  parts.push(moignon);

  // Amorce d'arche : deux montants et un claveau resté en place.
  const montantA = new THREE.BoxGeometry(0.42, 2.1, 0.44);
  montantA.translate(-0.85, 1.05, 2.3);
  parts.push(montantA);

  const montantB = new THREE.BoxGeometry(0.42, 1.6, 0.44);
  montantB.translate(0.85, 0.8, 2.3);
  parts.push(montantB);

  const claveau = new THREE.BoxGeometry(0.9, 0.4, 0.44);
  claveau.rotateZ(-0.5);
  claveau.translate(-0.6, 2.25, 2.3);
  parts.push(claveau);

  // Pierres tombées au pied.
  for (let i = 0; i < 5; i++) {
    const g = new THREE.DodecahedronGeometry(0.28, 0);
    g.scale(1, 0.6, 1);
    g.rotateY(i * 1.3);
    g.translate(-1.6 + i * 0.9, 0.14, 1.15 + (i % 2) * 0.5);
    parts.push(g);
  }

  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return faceted(merged);
})();

/** Socle de balise : la partie inerte, en pierre. */
const baliseSocleGeometry = (() => {
  const parts = [];

  const base = new THREE.CylinderGeometry(0.75, 0.95, 0.45, 6);
  base.translate(0, 0.22, 0);
  parts.push(base);

  const fut = new THREE.CylinderGeometry(0.26, 0.36, 2.3, 6);
  fut.translate(0, 1.6, 0);
  parts.push(fut);

  // Trois contreforts inclinés : la chose a été bâtie pour durer.
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BoxGeometry(0.17, 1.3, 0.17);
    g.translate(0, 0.65, 0);
    g.rotateZ(0.3);
    g.rotateY((i / 3) * Math.PI * 2);
    g.translate(0, 0.3, 0);
    parts.push(g);
  }

  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return faceted(merged);
})();

/** Cœur de balise : l'octaèdre lumineux, qui tourne lentement. */
const baliseCoeurGeometry = faceted(new THREE.OctahedronGeometry(0.42, 0));

/**
 * Monument : la structure visible de loin, celle qui donne une direction.
 * Une arche haute posée sur un tertre, avec un anneau suspendu.
 */
const monumentGeometry = (() => {
  const parts = [];

  const tertre = new THREE.CylinderGeometry(4.2, 5.6, 1.4, 8);
  tertre.translate(0, 0.7, 0);
  parts.push(tertre);

  // Deux piliers massifs, légèrement inclinés l'un vers l'autre.
  for (const s of [-1, 1]) {
    const pilier = new THREE.BoxGeometry(1.1, 9.5, 1.1);
    pilier.translate(0, 4.75, 0);
    pilier.rotateZ(s * 0.055);
    pilier.translate(s * 2.5, 1.3, 0);
    parts.push(pilier);
  }

  // Linteau.
  const linteau = new THREE.BoxGeometry(6.6, 1.2, 1.3);
  linteau.translate(0, 10.9, 0);
  parts.push(linteau);

  // Anneau suspendu sous le linteau : huit segments, pas un tore coûteux.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.85, 0.26, 0.26);
    g.translate(1.5, 0, 0);
    g.rotateZ(a);
    g.translate(0, 8.7, 0);
    parts.push(g);
  }

  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return faceted(merged);
})();

/**
 * Arbre gigantesque : l'autre repère lointain. Un tronc énorme et trois
 * couronnes étagées, à une échelle qui n'appartient à aucune autre végétation.
 */
// Deux géométries et non une : le tronc est en bois, le feuillage en vert. Les
// fusionner sous un seul matériau donnait un arbre géant entièrement marron.
const grandArbreTroncGeometry = (() => {
  const parts = [];

  const tronc = new THREE.CylinderGeometry(0.85, 1.9, 9, 7);
  tronc.translate(0, 4.5, 0);
  parts.push(tronc);

  for (let i = 0; i < 4; i++) {
    const g = new THREE.CylinderGeometry(0.16, 0.3, 3.2, 4);
    g.translate(0, 1.6, 0);
    g.rotateZ(0.75);
    g.rotateY((i / 4) * Math.PI * 2 + 0.4);
    g.translate(0, 6.4, 0);
    parts.push(g);
  }

  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return faceted(merged);
})();

const grandArbreFeuillageGeometry = (() => {
  const couronnes = [
    new THREE.ConeGeometry(5.2, 4.6, 7),
    new THREE.ConeGeometry(3.9, 3.8, 7),
    new THREE.ConeGeometry(2.4, 3, 7)
  ];
  couronnes[0].translate(0, 10.2, 0);
  couronnes[1].translate(0, 12.6, 0);
  couronnes[2].translate(0, 14.7, 0);

  const merged = mergeGeometries(couronnes);
  for (const g of couronnes) g.dispose();
  return faceted(merged);
})();

// Feuillage des grands arbres : une teinte propre, plus sombre que la
// végétation courante — un arbre de cette taille a vu passer autre chose.
const grandArbreMaterial = contaminable(new THREE.MeshLambertMaterial({ color: 0x2f5540 }));

const rockGeometry = faceted(new THREE.DodecahedronGeometry(0.5, 0));

/** Bloc anguleux : les zones rocheuses ont besoin d'autre chose qu'un galet. */
const boulderGeometry = (() => {
  const g = new THREE.DodecahedronGeometry(1.15, 0);
  g.scale(1, 0.78, 0.92);
  return faceted(g);
})();
const flowerGeometry = faceted(new THREE.SphereGeometry(0.11, 5, 4));


const player = createPlayer();
scene.add(player);

// La couche de jeu est créée avant la génération du premier chunk : createChunk
// lui demande de peupler chaque chunk en ressources.
const game = createFogNomad({
  THREE,
  scene,
  camera,
  player,
  renderer,
  terrainHeight,
  onRestart: () => startNewRun(),
  son: sons,
  // Le chunk qui contient une position : sert à rattacher un objet jeté ou un
  // feu, pour qu'ils disparaissent avec lui.
  chunkAt: (x, z) => {
    const key = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
    const group = chunks.get(key);
    return group ? { key, group } : null;
  }
});

const keys = new Set();

// L'audio ne peut démarrer que depuis un geste du joueur. On s'accroche donc
// au premier contact ou à la première touche, une seule fois, et le jeu ne
// dépend en rien du résultat.
{
  const amorcer = () => {
    demarrerAudio();
    window.removeEventListener("pointerdown", amorcer);
    window.removeEventListener("keydown", amorcer);
  };
  window.addEventListener("pointerdown", amorcer, { once: false });
  window.addEventListener("keydown", amorcer, { once: false });
}

function createPlayer() {
  const group = new THREE.Group();

  // Palette : un voyageur, pas un mannequin. Manteau sombre et froid, capuche,
  // écharpe claire — la seule tache vive de la silhouette, pour qu'on le
  // retrouve d'un coup d'œil sur un fond de prairie ou de brume.
  const manteau = new THREE.MeshLambertMaterial({ color: 0x2f3a4d });
  const manteauSombre = new THREE.MeshLambertMaterial({ color: 0x222a38 });
  const pantalon = new THREE.MeshLambertMaterial({ color: 0x3d3a34 });
  const peau = new THREE.MeshLambertMaterial({ color: 0xd8aa83 });
  const echarpe = new THREE.MeshLambertMaterial({ color: 0xc4553f });
  const cuir = new THREE.MeshLambertMaterial({ color: 0x7d5734 });
  const cuirFonce = new THREE.MeshLambertMaterial({ color: 0x5d3f26 });

  // --- torse -----------------------------------------------------------
  // Un tronc de cône à huit pans, plus large aux épaules qu'à la taille :
  // c'est cet évasement qui fait lire « personne » plutôt que « boîte ».
  const buste = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.33, 0.235, 0.8, 8)), manteau);
  buste.position.y = 1.3;

  // Basque du manteau : une jupe courte qui casse la verticale des jambes.
  const basque = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.3, 0.36, 0.3, 8)), manteauSombre);
  basque.position.y = 0.98;

  const epaules = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.315, 0.35, 0.17, 8)), manteau);
  epaules.position.y = 1.7;

  // --- tête -------------------------------------------------------------
  const cou = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.085, 0.1, 0.12, 6)), peau);
  cou.position.y = 1.8;

  const tete = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.235, 10, 8)), peau);
  tete.position.y = 1.99;
  tete.scale.set(1, 1.1, 0.92);

  // Capuche rabattue : une demi-sphère un peu plus large que la tête, ouverte
  // vers l'avant. Elle donne la silhouette reconnaissable de dos.
  const capuche = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.29, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62)),
    manteauSombre);
  capuche.position.set(0, 1.98, -0.035);
  capuche.scale.set(1, 1.12, 1.06);

  // Écharpe : l'accent de couleur, à hauteur de cou.
  const foulard = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.155, 0.175, 0.14, 8)), echarpe);
  foulard.position.y = 1.79;

  const panFoulard = new THREE.Mesh(
    faceted(new THREE.BoxGeometry(0.13, 0.34, 0.06)), echarpe);
  panFoulard.position.set(0.1, 1.62, 0.16);
  panFoulard.rotation.z = 0.16;

  // --- membres ----------------------------------------------------------
  // Géométries décalées vers le bas : la rotation part de la hanche et de
  // l'épaule, pas du milieu du membre.
  const cuisseGeo = faceted(new THREE.CapsuleGeometry(0.115, 0.44, 3, 6));
  cuisseGeo.translate(0, -0.28, 0);

  const jambeGauche = new THREE.Mesh(cuisseGeo, pantalon);
  jambeGauche.position.set(-0.15, 0.92, 0);
  const jambeDroite = jambeGauche.clone();
  jambeDroite.position.x = 0.15;

  // Bottes : un pied lisible vaut mieux qu'une capsule qui s'arrête.
  const botteGeo = faceted(new THREE.BoxGeometry(0.17, 0.16, 0.26));
  const botteGauche = new THREE.Mesh(botteGeo, cuirFonce);
  botteGauche.position.set(-0.15, 0.09, 0.03);
  const botteDroite = botteGauche.clone();
  botteDroite.position.x = 0.15;

  const brasGeo = faceted(new THREE.CapsuleGeometry(0.078, 0.42, 3, 6));
  brasGeo.translate(0, -0.26, 0);

  const brasGauche = new THREE.Mesh(brasGeo, manteau);
  brasGauche.position.set(-0.36, 1.66, 0);
  brasGauche.rotation.z = -0.13;

  const brasDroit = brasGauche.clone();
  brasDroit.position.x = 0.36;
  brasDroit.rotation.z = 0.13;

  // Mains : deux petites masses au bout des bras, pour que le balancier se lise.
  const mainGeo = faceted(new THREE.SphereGeometry(0.075, 6, 5));
  const mainGauche = new THREE.Mesh(mainGeo, peau);
  mainGauche.position.y = -0.5;
  brasGauche.add(mainGauche);
  const mainDroite = new THREE.Mesh(mainGeo, peau);
  mainDroite.position.y = -0.5;
  brasDroit.add(mainDroite);

  // --- sac --------------------------------------------------------------
  // L'avant du personnage est son +Z local : le sac se porte donc en −Z.
  // Il doit rester plus large que le buste (0,66 d'envergure), sans quoi il
  // disparaît derrière lui dès qu'on s'éloigne.
  const sac = new THREE.Mesh(faceted(new THREE.BoxGeometry(0.5, 0.56, 0.3)), cuir);
  sac.position.set(0, 1.36, -0.4);

  // Rabat et sangles : trois volumes qui font lire « sac » et pas « caisse ».
  const rabat = new THREE.Mesh(faceted(new THREE.BoxGeometry(0.52, 0.16, 0.32)), cuirFonce);
  rabat.position.set(0, 0.26, 0.01);
  rabat.rotation.x = -0.12;
  sac.add(rabat);

  const sangleGeo = faceted(new THREE.BoxGeometry(0.075, 0.4, 0.06));
  const sangleGauche = new THREE.Mesh(sangleGeo, cuirFonce);
  sangleGauche.position.set(-0.18, 1.55, -0.13);
  sangleGauche.rotation.x = -0.2;
  const sangleDroite = sangleGauche.clone();
  sangleDroite.position.x = 0.18;

  group.add(buste, basque, epaules, cou, tete, capuche, foulard, panFoulard,
            jambeGauche, jambeDroite, botteGauche, botteDroite,
            brasGauche, brasDroit, sac, sangleGauche, sangleDroite);

  group.userData = {
    body: buste, basque, shoulders: epaules, head: tete, hairCap: capuche,
    foulard, panFoulard, cou,
    leftLeg: jambeGauche, rightLeg: jambeDroite,
    leftBoot: botteGauche, rightBoot: botteDroite,
    leftArm: brasGauche, rightArm: brasDroit,
    bag: sac
  };

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

  // 0.5 — le relief manquait de franchise : tout ondulait au même rythme.
  //
  // `creux` ajoute de vraies dépressions, larges et rares (la puissance 3
  // écrase la partie haute de la sinusoïde et ne garde que les creux).
  // `plis` ajoute un plissement court qui donne du grain aux pentes sans
  // rendre le sol bruyant, parce qu'il est modulé par la pente elle-même.
  const bosse = Math.sin(x * 0.0195 + sx * 7.3) * Math.cos(z * 0.0172 - sz * 6.1);
  const creux = -Math.pow(Math.max(0, bosse), 3) * 3.6;

  const plis =
    Math.sin(x * 0.112 - sz * 3.3) *
    Math.cos(z * 0.098 + sx * 2.9) * 0.34;

  // Le relèvement compense les creux : sans lui ils noyaient 25 % du terrain
  // (contre 19,5 % en 0.4), et un quart du monde devenait un lac. Mesuré avec
  // ces valeurs : 15,1 % sous l'eau, pour des dépressions plus profondes
  // qu'avant — plus de relief ET moins d'eau.
  return broad + ridge + hills + detail + creux + plis + 0.9;
}

/**
 * Champ de biome continu. Deux ondes lentes décorrélées donnent un couple
 * (humidité, aridité) dont on déduit un poids par biome. Comme le champ dépend
 * uniquement de la position monde, les biomes se fondent sans coupure aux
 * frontières de chunk.
 */
/**
 * Champ de zones — le terrain n'est plus un tapis uniforme.
 *
 * Trois champs lents et décorrélés, lus à la même position monde par le
 * terrain (couleur) et par la végétation (familles). C'est ce partage qui fait
 * qu'une zone rocheuse a l'air rocheuse : le sol grisonne ET les arbres
 * cèdent la place à des blocs, au même endroit et sans concertation explicite.
 *
 * Aucun coût de mémoire : rien n'est stocké, tout se recalcule à la demande à
 * partir de la position et de la seed.
 */
function zoneAt(x, z) {
  const sx = worldSeed * 0.00011;
  const sz = worldSeed * 0.00007;

  const rocaille =
    Math.sin(x * 0.0125 + sx * 5.1) * 0.5 +
    Math.cos(z * 0.0163 - sz * 3.7) * 0.5;

  const clairiere =
    Math.sin((x - z) * 0.0208 + sx * 2.3) * 0.5 +
    Math.cos((x + z) * 0.0141 - sz * 4.9) * 0.5;

  const sec =
    Math.sin(z * 0.0094 - sx * 6.2) * 0.5 +
    Math.cos(x * 0.0117 + sz * 5.4) * 0.5;

  return { rocaille, clairiere, sec };
}

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

/**
 * Même contenu qu'un InstancedMesh, mais SANS instanciation : les sommets sont
 * écrits à leur position finale dans une géométrie unique, et la teinte passe
 * par les couleurs de sommets.
 *
 * C'est exactement le chemin retenu pour les fleurs en 0.2, seul remède trouvé
 * à l'artefact des grands polygones noirs sur le GPU cible — mécanisme jamais
 * expliqué (voir AUDIT_PERFORMANCE_BUGS_0.2.md, B0). Le coût est le même en
 * appels de rendu : un objet par famille et par chunk.
 */
function buildMerged(geometry, material, items, applyTransform, colorOf) {
  if (items.length === 0) return null;

  const source = geometry.attributes.position;
  const sourceNormal = geometry.attributes.normal;
  const parSommet = source.count;
  const total = parSommet * items.length;

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let out = 0;

  for (const item of items) {
    applyTransform(dummy, item);
    dummy.updateMatrix();
    normalMatrix.getNormalMatrix(dummy.matrix);

    const tint = colorOf ? colorOf(item) : null;

    for (let i = 0; i < parSommet; i++) {
      v.set(source.getX(i), source.getY(i), source.getZ(i)).applyMatrix4(dummy.matrix);
      position[out * 3] = v.x;
      position[out * 3 + 1] = v.y;
      position[out * 3 + 2] = v.z;

      n.set(sourceNormal.getX(i), sourceNormal.getY(i), sourceNormal.getZ(i))
        .applyMatrix3(normalMatrix).normalize();
      normal[out * 3] = n.x;
      normal[out * 3 + 1] = n.y;
      normal[out * 3 + 2] = n.z;

      // Sans teinte d'instance, on écrit du blanc : la couleur du matériau
      // s'applique alors telle quelle.
      color[out * 3] = tint ? tint.r : 1;
      color[out * 3 + 1] = tint ? tint.g : 1;
      color[out * 3 + 2] = tint ? tint.b : 1;

      out++;
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(color, 3));

  const mesh = new THREE.Mesh(merged, materiauFusionne(material));
  mesh.userData.ownedGeometry = true;
  return mesh;
}

// Un matériau fusionné doit lire les couleurs de sommets ; on en garde une
// version par matériau source, partagée entre tous les chunks.
const materiauxFusionnes = new Map();

function materiauFusionne(material) {
  let m = materiauxFusionnes.get(material);
  if (!m) {
    m = material.clone();
    m.vertexColors = true;
    // Le clone perd le correctif de contamination : on le réapplique.
    contaminable(m);
    materiauxFusionnes.set(material, m);
  }
  return m;
}

function buildInstanced(geometry, material, items, applyTransform, colorOf) {
  if (items.length === 0) return null;

  // Mode diagnostic : on retire toute instanciation d'un seul geste, pour
  // savoir si l'artefact vient de là — c'est ce qui avait tranché en 0.2.
  if (DIAG && !diagFeature.instanciation) {
    return buildMerged(geometry, material, items, applyTransform, colorOf);
  }

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

/**
 * Structures d'un chunk : au plus une, et rarement.
 *
 * Le tirage se fait sur les coordonnées du chunk, donc il est stable : la même
 * ruine réapparaît au même endroit après un rechargement, et deux joueurs de
 * la même seed voient le même monde.
 *
 * Les repères lointains (monument, grand arbre) ne sont PAS tirés par chunk :
 * ils le sont sur une grille grossière de LANDMARK_GRID chunks. Sans cela ils
 * apparaîtraient et disparaîtraient au gré du streaming, alors que leur raison
 * d'être est justement d'être visés de loin et d'orienter une traversée.
 */
const LANDMARK_GRID = 6;      // un repère candidat toutes les 6×6 cases de chunk
const LANDMARK_CHANCE = 0.42; // ... et seulement une case candidate sur deux

function structureAt(cx, cz) {
  // --- repère lointain ---------------------------------------------------
  const gx = Math.floor(cx / LANDMARK_GRID);
  const gz = Math.floor(cz / LANDMARK_GRID);

  if (random01(gx * 313, gz * 571, 401) < LANDMARK_CHANCE) {
    // La case candidate désigne un chunk précis en son sein : le repère n'est
    // pas au coin de la grille, sinon l'alignement se verrait.
    const dx = Math.floor(random01(gx * 17, gz * 29, 403) * LANDMARK_GRID);
    const dz = Math.floor(random01(gx * 41, gz * 11, 405) * LANDMARK_GRID);

    if (cx - gx * LANDMARK_GRID === dx && cz - gz * LANDMARK_GRID === dz) {
      return random01(gx, gz, 407) < 0.5 ? "monument" : "grandarbre";
    }
  }

  // --- petite structure ---------------------------------------------------
  // ~7 % des chunks, soit une trouvaille toutes les quatorze zones environ.
  const tirage = random01(cx * 89, cz * 127, 409);
  if (tirage > 0.07) return null;

  const type = random01(cx * 149, cz * 97, 411);
  if (type < 0.42) return "camp";
  if (type < 0.78) return "ruine";
  return "balise";
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

    // Variation de teinte par sommet : deux ondes courtes décorrélées cassent
    // l'aplat sans coûter un seul triangle de plus. L'altitude éclaircit
    // légèrement les crêtes et assombrit les creux.
    const grain =
      Math.sin(worldX * 0.31 + worldZ * 0.17) * 0.5 +
      Math.cos(worldX * 0.13 - worldZ * 0.27) * 0.5;

    const height = positions.getY(i);
    const shade = 1 + grain * 0.10 + Math.max(-1, Math.min(1, height / 7)) * 0.08;

    vertexColor.multiplyScalar(shade);

    // Le sol dit la même chose que la végétation : la zone rocheuse grisonne,
    // le sol sec vire à l'ocre pâle, la clairière s'éclaircit un peu. Les
    // teintes sont lues au même endroit que les familles d'arbres.
    const zone = zoneAt(worldX, worldZ);

    if (zone.rocaille > 0.35) {
      const t = Math.min(1, (zone.rocaille - 0.35) / 0.5) * 0.62;
      vertexColor.lerp(ROC_COLOR, t);
    }

    if (zone.sec > 0.35) {
      const t = Math.min(1, (zone.sec - 0.35) / 0.5) * 0.55;
      vertexColor.lerp(SEC_COLOR, t);
    }

    if (zone.clairiere > 0.5) {
      const t = Math.min(1, (zone.clairiere - 0.5) / 0.4) * 0.3;
      vertexColor.lerp(CLAIRIERE_COLOR, t);
    }

    colors[i * 3] = Math.min(1, vertexColor.r);
    colors[i * 3 + 1] = Math.min(1, vertexColor.g);
    colors[i * 3 + 2] = Math.min(1, vertexColor.b);
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // Dédouble les sommets et porte la normale de face : même aspect facetté,
  // sans reconstruction par dérivées dans le fragment shader (voir faceted()).
  const terrainGeometry = faceted(geometry);

  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.userData.ownedGeometry = true;
  terrain.userData.kind = "terrain";
  group.add(terrain);

  const chunkBiome = BIOMES[dominantBiomeIndex(centerX, centerZ)];

  // Densité rapportée à la surface du chunk pour rester visuellement stable.
  //
  // 0.5 — nettement relevée. Deux raisons : les props se répartissent
  // maintenant sur huit familles au lieu de trois, donc chacune recevait trop
  // peu d'exemplaires pour se lire ; et l'appareil réel a montré de la marge
  // (60 FPS à 9 000 triangles). Un monde vide n'est pas un monde sobre.
  const propCount =
    16 + Math.floor(random01(cx, cz, 12) * 30 * chunkBiome.density);

  const troncs = [];        // troncs des deux conifères
  const coniferesHauts = [];
  const coniferesLarges = [];
  const arbresMorts = [];
  const arbustes = [];
  const rocks = [];
  const blocs = [];
  const herbes = [];
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
    const rotation = random01(cx - i * 3, cz + i * 9, 64) * Math.PI * 2;
    const echelle = 0.66 + random01(cx + i * 7, cz - i * 11, 62) * 0.78;
    const relief = zoneAt(worldX, worldZ);

    // Une zone rocheuse ne porte presque pas d'arbres, une clairière pas du
    // tout, un sol contaminé ne porte que du bois mort. C'est le terrain qui
    // décide, pas un tirage indépendant : les deux doivent raconter la même
    // chose au même endroit.
    if (relief.clairiere > 0.55) {
      // Clairière : herbe rase et rien d'autre. C'est le vide qui la dessine.
      if (type < 0.55) {
        herbes.push({ x: localX, y, z: localZ, rotation,
                      scale: 0.7 + random01(cx + i, cz - i, 91) * 0.6, biomeIndex });
      }
      continue;
    }

    if (relief.rocaille > 0.5) {
      // Zone rocheuse : blocs anguleux, quelques arbustes accrochés.
      if (type < 0.62) {
        blocs.push({ x: localX, y, z: localZ,
                     scale: 0.5 + random01(cx - i * 5, cz + i * 3, 72) * 0.75,
                     seed: random01(i, cx + cz, 75) });
      } else if (type < 0.82) {
        arbustes.push({ x: localX, y, z: localZ, rotation,
                        scale: 0.7 + random01(cx + i, cz - i, 93) * 0.5, biomeIndex });
      } else {
        rocks.push({ x: localX, y, z: localZ,
                     scale: 0.38 + random01(cx - i * 5, cz + i * 3, 72) * 0.6,
                     seed: random01(i, cx + cz, 75) });
      }
      continue;
    }

    if (relief.sec > 0.5 || biome.dry) {
      // Sol sec ou contaminé : bois mort et broussaille, pas de couvert vert.
      if (type < 0.42) {
        arbresMorts.push({ x: localX, y, z: localZ, rotation,
                           scale: 0.72 + random01(cx + i * 3, cz - i * 5, 95) * 0.66 });
      } else if (type < 0.74) {
        arbustes.push({ x: localX, y, z: localZ, rotation,
                        scale: 0.6 + random01(cx + i, cz - i, 93) * 0.55, biomeIndex });
      } else {
        rocks.push({ x: localX, y, z: localZ,
                     scale: 0.38 + random01(cx - i * 5, cz + i * 3, 72) * 0.82,
                     seed: random01(i, cx + cz, 75) });
      }
      continue;
    }

    // Terrain ordinaire : les deux conifères se partagent le couvert, avec
    // un peu de bois mort et de broussaille pour casser la régularité.
    if (type < biome.density * 0.52) {
      coniferesHauts.push({ x: localX, y, z: localZ, rotation, scale: echelle, biomeIndex });
      troncs.push({ x: localX, y, z: localZ, rotation, scale: echelle });
    } else if (type < biome.density * 0.86) {
      coniferesLarges.push({ x: localX, y, z: localZ, rotation,
                             scale: echelle * 0.92, biomeIndex });
      troncs.push({ x: localX, y, z: localZ, rotation, scale: echelle * 0.8 });
    } else if (type < biome.density * 0.94) {
      arbresMorts.push({ x: localX, y, z: localZ, rotation,
                         scale: 0.8 + random01(cx + i * 3, cz - i * 5, 95) * 0.6 });
    } else if (type < biome.density + 0.14) {
      arbustes.push({ x: localX, y, z: localZ, rotation,
                      scale: 0.65 + random01(cx + i, cz - i, 93) * 0.55, biomeIndex });
    } else if (type < biome.density + 0.3) {
      if (i % 4 < facteurDecor() * 4) {
        herbes.push({ x: localX, y, z: localZ, rotation,
                      scale: 0.75 + random01(cx + i, cz - i, 91) * 0.6, biomeIndex });
      }
    } else {
      rocks.push({ x: localX, y, z: localZ,
                   scale: 0.38 + random01(cx - i * 5, cz + i * 3, 72) * 0.82,
                   seed: random01(i, cx + cz, 75) });
    }
  }

  if (!chunkBiome.dry) {
    const clusterCount = Math.floor(random01(cx, cz, 101) * 5 * facteurDecor());

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

  // Une famille absente ne coûte rien : buildInstanced rend null sur une liste
  // vide, donc un chunk de clairière ne porte que son terrain et son herbe.
  const placerDroit = (obj, item, penche = 0) => {
    obj.position.set(item.x, item.y, item.z);
    obj.rotation.set(penche, item.rotation, 0);
    obj.scale.setScalar(item.scale);
  };

  const trunkMesh = buildInstanced(trunkGeometry, trunkMaterial, troncs, placerDroit);

  const coniferTallMesh = buildInstanced(
    coniferTallGeometry, crownMaterial, coniferesHauts,
    (obj, item) => {
      // Étirement vertical propre à chaque arbre : deux conifères hauts
      // voisins ne se superposent pas.
      const elan = 0.86 + ((item.x * 7 + item.z * 13) % 1 + 1) % 1 * 0.42;
      obj.position.set(item.x, item.y, item.z);
      obj.rotation.set(0, item.rotation, 0);
      obj.scale.set(item.scale * 0.94, item.scale * elan, item.scale * 0.94);
    },
    (item) => biomeTreeColors[item.biomeIndex]
  );

  const coniferBroadMesh = buildInstanced(
    coniferBroadGeometry, crownMaterial, coniferesLarges,
    (obj, item) => {
      const large = 0.92 + ((item.z * 11 + item.x * 5) % 1 + 1) % 1 * 0.36;
      obj.position.set(item.x, item.y, item.z);
      obj.rotation.set(0, item.rotation, 0);
      obj.scale.set(item.scale * large, item.scale * 0.9, item.scale * large);
    },
    (item) => biomeTreeColors[item.biomeIndex]
  );

  // Le bois mort garde la couleur du tronc : c'est ce qui le distingue de loin.
  const deadMesh = buildInstanced(
    deadTreeGeometry, trunkMaterial, arbresMorts,
    (obj, item) => {
      obj.position.set(item.x, item.y, item.z);
      // Légère inclinaison : un arbre mort ne se tient pas droit.
      obj.rotation.set(((item.x * 3) % 1) * 0.12 - 0.06, item.rotation, 0);
      obj.scale.setScalar(item.scale);
    }
  );

  const bushMesh = buildInstanced(
    bushGeometry, crownMaterial, arbustes,
    (obj, item) => {
      obj.position.set(item.x, item.y, item.z);
      obj.rotation.set(0, item.rotation, 0);
      obj.scale.set(item.scale, item.scale * 0.82, item.scale);
    },
    (item) => biomeTreeColors[item.biomeIndex]
  );

  // L'herbe est fusionnée, jamais instanciée.
  //
  // C'est le profil exact des fleurs de la 0.2 : objet minuscule, instancié,
  // avec couleur d'instance — la combinaison qui produisait de grands
  // polygones noirs sur le GPU cible, sans que le mécanisme ait jamais été
  // expliqué. La 0.5 avait rétabli ce profil sans y penser. Le chemin fusionné
  // coûte le même nombre d'appels de rendu, et c'est celui qui a été validé
  // sur l'appareil.
  const grassMesh = buildMerged(
    grassGeometry, crownMaterial, herbes,
    (obj, item) => {
      obj.position.set(item.x, item.y, item.z);
      obj.rotation.set(0, item.rotation, 0);
      obj.scale.setScalar(item.scale);
    },
    (item) => biomeTreeColors[item.biomeIndex]
  );

  const rockMesh = buildInstanced(
    rockGeometry, rockMaterial, rocks,
    (obj, rock) => {
      obj.position.set(rock.x, rock.y + 0.25 * rock.scale, rock.z);
      obj.rotation.set(rock.seed * 1.7, rock.seed * Math.PI * 1.8, rock.seed * 0.9);
      obj.scale.set(
        rock.scale * (0.8 + rock.seed * 0.5),
        rock.scale * (0.45 + rock.seed * 0.55),
        rock.scale * (0.75 + (1 - rock.seed) * 0.5)
      );
    }
  );

  const boulderMesh = buildInstanced(
    boulderGeometry, rockMaterial, blocs,
    (obj, bloc) => {
      obj.position.set(bloc.x, bloc.y + 0.15 * bloc.scale, bloc.z);
      obj.rotation.set(bloc.seed * 0.6, bloc.seed * Math.PI * 2, bloc.seed * 0.4);
      obj.scale.set(
        bloc.scale * (0.85 + bloc.seed * 0.45),
        bloc.scale * (0.7 + bloc.seed * 0.6),
        bloc.scale * (0.8 + (1 - bloc.seed) * 0.45)
      );
    }
  );

  const familles = [
    [trunkMesh, "troncs"],
    [coniferTallMesh, "houppiers"],
    [coniferBroadMesh, "houppiers"],
    [deadMesh, "boismort"],
    [bushMesh, "arbustes"],
    [grassMesh, "herbes"],
    [rockMesh, "rochers"],
    [boulderMesh, "rochers"]
  ];

  for (const [mesh, kind] of familles) {
    if (!mesh) continue;
    mesh.userData.kind = kind;
    group.add(mesh);
  }

  addFlowers(group, flowers);
  addStructure(group, cx, cz, centerX, centerZ);
  game.populateChunk(group, key, cx, cz, centerX, centerZ, random01);

  scene.add(group);
  chunks.set(key, group);
  discovered.add(key);

  if (DIAG) applyDiagVisibility();
}

/**
 * Fusionne toutes les fleurs d'un chunk en une seule géométrie : les sommets
 * sont écrits à leur position finale et la teinte passe par les couleurs de
 * sommets. Un appel de rendu par chunk, et surtout aucune instanciation.
 *
 * L'InstancedMesh des fleurs corrompait le rendu sur certains GPU mobiles
 * (grands polygones noirs clignotants), ce qu'aucune de ses propriétés prise
 * isolément n'expliquait : ni la couleur d'instance, ni la géométrie, ni la
 * taille. Seule la suppression de l'instanciation y mettait fin. Les troncs,
 * houppiers et rochers restent instanciés — eux n'ont jamais posé problème.
 */
function buildFlowerPatch(flowers) {
  const source = flowerGeometry.attributes.position;
  const sourceNormal = flowerGeometry.attributes.normal;
  const perFlower = source.count;
  const total = perFlower * flowers.length;

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);

  let out = 0;

  for (const flower of flowers) {
    const tint = FLOWER_COLORS[flower.colorIndex];

    for (let i = 0; i < perFlower; i++) {
      position[out * 3] = source.getX(i) + flower.x;
      position[out * 3 + 1] = source.getY(i) + flower.y + 0.14;
      position[out * 3 + 2] = source.getZ(i) + flower.z;

      normal[out * 3] = sourceNormal.getX(i);
      normal[out * 3 + 1] = sourceNormal.getY(i);
      normal[out * 3 + 2] = sourceNormal.getZ(i);

      color[out * 3] = tint.r;
      color[out * 3 + 1] = tint.g;
      color[out * 3 + 2] = tint.b;

      out++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  return geometry;
}

function addFlowers(group, flowers) {
  if (flowers.length === 0) return;

  // Variante 2 : un objet ordinaire par fleur (coûteux, gardé pour référence).
  if (flowerVariant === 2) {
    for (const flower of flowers) {
      const mesh = new THREE.Mesh(flowerGeometry, FLOWER_MATERIALS[flower.colorIndex]);
      mesh.position.set(flower.x, flower.y + 0.14, flower.z);
      mesh.userData.kind = "fleurs";
      group.add(mesh);
    }
    return;
  }

  // Variante 1 : l'ancien rendu instancié, celui qui se corrompt.
  if (flowerVariant === 1) {
    const mesh = buildInstanced(
      flowerGeometry,
      flowerInstancedMaterial,
      flowers,
      (obj, flower) => {
        obj.position.set(flower.x, flower.y + 0.14, flower.z);
        obj.rotation.set(0, 0, 0);
        obj.scale.setScalar(1);
      },
      (flower) => FLOWER_COLORS[flower.colorIndex]
    );

    if (mesh) {
      mesh.userData.kind = "fleurs";
      group.add(mesh);
    }
    return;
  }

  // Variante 0, celle du jeu : une seule géométrie fusionnée par chunk.
  const patch = new THREE.Mesh(buildFlowerPatch(flowers), flowerMaterial);
  patch.userData.kind = "fleurs";
  patch.userData.ownedGeometry = true;   // propre au chunk : à libérer avec lui
  group.add(patch);
}

/**
 * Pose la structure d'un chunk, s'il en a une.
 *
 * Les structures partagent leurs géométries avec tout le jeu (aucune n'est
 * propre au chunk), donc `disposeChunk` ne doit surtout pas les libérer : elles
 * ne portent pas `ownedGeometry`.
 */
function addStructure(group, cx, cz, centerX, centerZ) {
  const type = structureAt(cx, cz);
  if (!type) return;

  // Placement dans le chunk, à l'écart du bord pour que rien ne chevauche la
  // frontière et ne se retrouve coupé quand le chunk voisin est déchargé.
  const localX = (random01(cx * 7, cz * 13, 413) - 0.5) * (CHUNK_SIZE - 14);
  const localZ = (random01(cx * 19, cz * 23, 415) - 0.5) * (CHUNK_SIZE - 14);
  const worldX = centerX + localX;
  const worldZ = centerZ + localZ;
  const y = terrainHeight(worldX, worldZ);

  // Rien ne se construit sous l'eau.
  if (y < -1.8) return;

  const rotation = random01(cx * 31, cz * 37, 417) * Math.PI * 2;

  const poser = (geometry, material, echelle = 1, enfonce = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(localX, y - enfonce, localZ);
    mesh.rotation.y = rotation;
    mesh.scale.setScalar(echelle);
    mesh.userData.kind = "structures";
    group.add(mesh);
    return mesh;
  };

  if (type === "camp") {
    poser(campGeometry, structureBoisMaterial,
          0.9 + random01(cx, cz, 419) * 0.3);
    return;
  }

  if (type === "ruine") {
    // Enfoncée de quelques dizaines de centimètres : une ruine est reprise
    // par le sol, elle ne se pose pas dessus.
    poser(ruineGeometry, structureMaterial,
          0.85 + random01(cx, cz, 421) * 0.5, 0.35);
    return;
  }

  if (type === "balise") {
    poser(baliseSocleGeometry, structureMaterial, 1, 0.15);

    // Le cœur est suivi image par image pour tourner : il est enregistré
    // à part, et disparaît avec son chunk comme le reste.
    const coeur = poser(baliseCoeurGeometry, baliseMaterial, 1);
    coeur.position.y = y + 2.95;
    coeur.userData.balise = true;
    balises.add(coeur);
    return;
  }

  if (type === "monument") {
    poser(monumentGeometry, structureMaterial,
          1 + random01(cx, cz, 423) * 0.35, 0.6);
    return;
  }

  if (type === "grandarbre") {
    const echelle = 0.9 + random01(cx, cz, 425) * 0.4;
    poser(grandArbreTroncGeometry, trunkMaterial, echelle);
    poser(grandArbreFeuillageGeometry, grandArbreMaterial, echelle);
    return;
  }
}

function disposeChunk(group) {
  scene.remove(group);

  group.traverse((object) => {
    // Un cœur de balise cesse d'être animé quand son chunk part : sans cela
    // le registre grossirait indéfiniment au fil d'une longue run.
    if (object.userData?.balise) balises.delete(object);

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
      game.onChunkDisposed(chunkKey);
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
  for (const [key, group] of chunks.entries()) {
    disposeChunk(group);
    game.onChunkDisposed(key);
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
    // Position volontairement NON restaurée : voir startNewRun().
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

/**
 * Redémarre une run sur le monde courant : même seed, joueur ramené à
 * l'origine, brume et sac remis à zéro.
 */
function startNewRun() {
  clearWorld();

  activeChunkKey = "";
  player.position.set(1.5, 0, 1.5);
  player.position.y = Math.max(terrainHeight(1.5, 1.5), -2.45);
  cameraYaw = 0;
  cameraPitch = 0.5;

  refreshChunks(true);
  snapCamera();
  game.resetRun();
  updateHud(true);
  saveGame();
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
  game.resetRun();
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
  game.resetRun();
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
  const u = player.userData;
  const { body, basque, head, hairCap, foulard, panFoulard, cou,
          leftLeg, rightLeg, leftBoot, rightBoot, leftArm, rightArm, shoulders } = u;

  // Le sac alourdit la démarche : à pleine charge le pas se raccourcit et le
  // buste se penche. La charge se lit donc dans le mouvement, pas seulement
  // dans le volume du sac.
  const charge = Math.min(1, game.state.weight / game.config.weight.max);

  if (moving) {
    idleTime = 0;
    walkTime += delta * (sprinting ? 12.5 : 8) * (1 - charge * 0.22);

    const ampleur = (sprinting ? 0.82 : 0.54) * (1 - charge * 0.3);
    const swing = Math.sin(walkTime) * ampleur;

    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;

    // Les bottes contre-tournent : le pied reste à plat plus longtemps.
    leftBoot.rotation.x = -swing * 0.45;
    rightBoot.rotation.x = swing * 0.45;
    leftBoot.position.z = 0.03 + Math.sin(walkTime) * 0.11;
    rightBoot.position.z = 0.03 - Math.sin(walkTime) * 0.11;
    leftBoot.position.y = 0.09 + Math.max(0, Math.sin(walkTime)) * 0.07;
    rightBoot.position.y = 0.09 + Math.max(0, -Math.sin(walkTime)) * 0.07;

    leftArm.rotation.x = -swing * 0.8;
    rightArm.rotation.x = swing * 0.8;
    // Les bras s'écartent un peu du corps à la course.
    leftArm.rotation.z = -0.13 - (sprinting ? 0.1 : 0);
    rightArm.rotation.z = 0.13 + (sprinting ? 0.1 : 0);

    // Roulis du buste et contre-roulis des épaules : c'est ce décalage qui
    // fait qu'une marche ressemble à une marche et non à un pantin qui glisse.
    const penche = (sprinting ? 0.2 : 0.07) + charge * 0.16;
    body.rotation.x = penche;
    body.rotation.z = Math.sin(walkTime) * 0.035;
    shoulders.rotation.y = Math.sin(walkTime) * 0.13;
    shoulders.rotation.x = penche;
    basque.rotation.x = penche * 0.5;
    basque.rotation.z = Math.sin(walkTime) * 0.05;

    // La tête reste plus stable que le corps : le regard tient l'horizon.
    head.rotation.z = -Math.sin(walkTime) * 0.02;
    head.position.y = 1.99 - penche * 0.1;
    hairCap.position.y = 1.98 - penche * 0.1;
    cou.position.y = 1.8 - penche * 0.08;
    foulard.position.y = 1.79 - penche * 0.08;

    // Le pan de l'écharpe flotte derrière : le seul élément qui traîne.
    panFoulard.rotation.x = -0.3 - (sprinting ? 0.45 : 0.15) +
                            Math.sin(walkTime * 1.6) * 0.12;
    panFoulard.rotation.z = 0.16 + Math.sin(walkTime * 1.3) * 0.09;

    player.position.y += Math.abs(Math.sin(walkTime * 2)) * 0.025 * (1 - charge * 0.4);
  } else {
    const settle = Math.min(1, delta * 10);
    const detend = (o, prop) => { o.rotation[prop] *= 1 - settle; };

    for (const o of [leftLeg, rightLeg, leftArm, rightArm, leftBoot, rightBoot]) {
      detend(o, "x");
    }
    body.rotation.x *= 1 - settle;
    body.rotation.z *= 1 - settle;
    basque.rotation.x *= 1 - settle;
    basque.rotation.z *= 1 - settle;
    shoulders.rotation.y *= 1 - settle;
    shoulders.rotation.x *= 1 - settle;
    head.rotation.z *= 1 - settle;

    leftArm.rotation.z += (-0.13 - leftArm.rotation.z) * settle;
    rightArm.rotation.z += (0.13 - rightArm.rotation.z) * settle;
    leftBoot.position.z += (0.03 - leftBoot.position.z) * settle;
    rightBoot.position.z += (0.03 - rightBoot.position.z) * settle;
    leftBoot.position.y += (0.09 - leftBoot.position.y) * settle;
    rightBoot.position.y += (0.09 - rightBoot.position.y) * settle;

    // Respiration : le personnage ne se fige pas complètement à l'arrêt, et
    // souffle plus fort quand il est chargé.
    idleTime += delta;
    const breath = Math.sin(idleTime * (1.7 + charge * 1.1)) * (0.012 + charge * 0.008);

    body.position.y = 1.3 + breath;
    head.position.y = 1.99 + breath * 1.6;
    hairCap.position.y = 1.98 + breath * 1.6;
    cou.position.y = 1.8 + breath * 1.3;
    foulard.position.y = 1.79 + breath * 1.3;
    panFoulard.rotation.x = -0.12 + Math.sin(idleTime * 0.9) * 0.07;
    panFoulard.rotation.z = 0.16 + Math.sin(idleTime * 0.7) * 0.05;
  }
}

/**
 * Distance caméra-joueur, réduite quand le front de brume s'en approche.
 *
 * Le front visible n'est pas `fogZ` mais l'avant-garde, qui déborde de
 * `FOG_VANGUARD` unités vers le joueur. On garde en plus une marge de
 * sécurité, sans quoi la caméra rase le plan et le traverse au moindre
 * à-coup.
 *
 * `CAMERA_DISTANCE_MIN` est un plancher assumé : passé ce point le joueur est
 * dans la brume et perd effectivement la vue — mais il y entre en même temps
 * que sa caméra, pas douze unités avant.
 */
function distanceCameraUtile() {
  // Le joueur fuit vers les Z décroissants ; la caméra est derrière lui, donc
  // du côté des Z croissants, uniquement quand elle regarde vers l'avant.
  const versArriere = Math.cos(cameraYaw);
  if (versArriere <= 0) return CAMERA_DISTANCE;   // on regarde le mur en face

  const frontZ = game.state.fogZ - FOG_VANGUARD - FOG_CAMERA_MARGE;
  const place = (frontZ - player.position.z) / (Math.cos(cameraPitch) * versArriere);

  if (!Number.isFinite(place)) return CAMERA_DISTANCE;
  return Math.max(CAMERA_DISTANCE_MIN, Math.min(CAMERA_DISTANCE, place));
}

function snapCamera() {
  const distance = distanceCameraUtile();
  const horizontal = Math.cos(cameraPitch) * distance;
  const vertical = Math.sin(cameraPitch) * distance;

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

/**
 * Qualité automatique.
 *
 * Ordre de sacrifice, du moins coûteux au plus visible :
 *   1. la densité de pixels, par paliers (déjà en place depuis la 0.2) ;
 *   2. les décorations — herbes et fleurs, qui ne portent aucune information ;
 *   3. les nappes de brume arrière, qui ne portent que de la profondeur.
 *
 * RÈGLE : la qualité ne touche JAMAIS aux mécaniques. Aucune ressource, aucune
 * structure, aucun repère lointain, aucune distance, aucune vitesse ne dépend
 * de ce réglage. Deux joueurs sur deux téléphones différents jouent au même
 * jeu ; ils ne le voient simplement pas aussi bien.
 */
function appliquerQualite() {
  // Les nappes de brume arrière tombent en qualité basse : c'est le poste de
  // remplissage le plus lourd, et le seul dont la perte ne cache aucune
  // information de jeu.
  game.setFogDetail(qualite < 2);

  // Les décorations déjà construites ne sont pas reconstruites : le changement
  // prend effet sur les chunks suivants. Reconstruire tout le monde visible
  // provoquerait une saccade bien pire que ce qu'on cherche à corriger.
}

function updateAdaptiveResolution(delta) {
  fpsWindowTime += delta;
  fpsWindowFrames++;

  if (fpsWindowTime < 2.5) return;

  const fps = fpsWindowFrames / fpsWindowTime;

  fpsWindowTime = 0;
  fpsWindowFrames = 0;

  if (fps < 38) {
    // On épuise d'abord les paliers de résolution, moins visibles.
    if (pixelStep < PIXEL_RATIO_STEPS.length - 1) {
      pixelStep++;
      goodWindows = 0;
      applyPixelRatio();
      return;
    }

    // Résolution au plancher et toujours trop lent : on retire du décor.
    if (qualite < QUALITE_NIVEAUX.length - 1) {
      qualite++;
      goodWindows = 0;
      appliquerQualite();
    }
    return;
  }

  // Le seuil de remontée était à 57 alors que l'affichage plafonne à 60 : un
  // téléphone stabilisé à 50-56 ne remontait jamais. 52 laisse la marge.
  if (fps > 52 && (pixelStep > 0 || qualite > 0)) {
    goodWindows++;

    if (goodWindows >= 2) {
      goodWindows = 0;
      // On rend d'abord le décor, puis la résolution : l'inverse ferait
      // osciller la netteté, bien plus perceptible qu'une touffe d'herbe.
      if (qualite > 0) { qualite--; appliquerQualite(); }
      else { pixelStep--; applyPixelRatio(); }
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
  const wantsSprint = running || keys.has("shift");
  const sprinting = wantsSprint && game.canSprint();

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

    // Le poids du sac et la collecte en cours pèsent sur la vitesse.
    const speed = PLAYER_SPEED *
      (sprinting ? RUN_MULTIPLIER : 1) *
      game.speedFactor();

    player.position.x += moveX * speed * delta;
    player.position.z += moveZ * speed * delta;

    player.rotation.y = Math.atan2(moveX, moveZ);

    refreshChunks();
  }

  const ground = terrainHeight(player.position.x, player.position.z);
  player.position.y = Math.max(ground, -2.45);

  animatePlayer(moving, sprinting, delta);
  game.update(delta, moving, sprinting);

  // Le son ne lit que des états déjà calculés : il ne décide de rien, et
  // le jeu tourne identiquement s'il est indisponible.
  mettreAJourAudio(delta, {
    marge: game.fogGap,
    marche: moving,
    course: sprinting
  });

  // Étalement de la génération sur plusieurs images.
  //
  // Un chunk de 0.5 coûte nettement plus cher à construire qu'un chunk de
  // 0.4 : terrain en 16 segments au lieu de 12 (et `faceted` en triple les
  // sommets), huit familles instanciées au lieu de trois, plus les structures.
  // En construire deux par image produisait des à-coups visibles — mesuré en
  // marche continue : 19 images au-dessus de 120 ms contre 7 en 0.4, et un
  // 99e centile à 242 ms contre 153.
  processBuildQueue(1);

  water.position.x = player.position.x;
  water.position.z = player.position.z;

  // --- distance de caméra, bornée par le front de brume ---------------------
  //
  // La caméra est 13 unités DERRIÈRE le joueur : la brume l'atteignait donc
  // une douzaine d'unités avant lui. Mesuré : à 14 de marge la caméra était
  // déjà 1,8 unité derrière le front, à 2 de marge elle était 9,8 unités
  // dedans. Le mur opaque s'intercalait entre l'objectif et le personnage, et
  // le joueur devenait AVEUGLE au moment précis où il devait choisir où
  // courir. C'est la cause de l'écran noir observé sur l'appareil.
  //
  // La caméra se rapproche donc du joueur quand le front approche, exactement
  // comme une caméra de jeu à la troisième personne se rapproche d'un mur.
  const distance = distanceCameraUtile();
  const horizontal = Math.cos(cameraPitch) * distance;
  const vertical = Math.sin(cameraPitch) * distance;

  desiredCamera.set(
    player.position.x - Math.sin(cameraYaw) * horizontal,
    player.position.y + vertical + 1.4,
    player.position.z + Math.cos(cameraYaw) * horizontal
  );

  // Le rapprochement doit être plus vif que l'éloignement : se faire avaler
  // par le mur pendant que la caméra rattrape doucement reviendrait au même
  // défaut. On resserre immédiatement, on desserre en douceur.
  const suivi = desiredCamera.z < camera.position.z
    ? 1 - Math.pow(0.002, delta)          // recul : lissage habituel
    : 1 - Math.pow(0.0000005, delta);     // resserrement : quasi immédiat
  camera.position.lerp(desiredCamera, suivi);

  camera.lookAt(
    player.position.x,
    player.position.y + 1.25,
    player.position.z
  );

  // Le dôme est centré sur la caméra et dimensionné juste sous le plan far.
  // Il ne tourne PAS avec elle : l'opposition avant/arrière du ciel doit rester
  // liée au monde, pas au regard.
  skyDome.position.copy(camera.position);
  skyDome.scale.setScalar(CAMERA_FAR * 0.92);

  elapsedTotal += delta;

  // Une seule écriture par image, partagée par tous les matériaux du monde.
  if (!DIAG || diagFeature.contamination) contamination.fogZ.value = game.state.fogZ;

  // --- ambiance de danger ---------------------------------------------------
  // La tension doit se sentir AVANT de regarder le compteur. Trois choses
  // basculent ensemble à mesure que la brume approche : le brouillard
  // atmosphérique se teinte de prune, le ciel s'assombrit, et la lumière
  // du soleil faiblit. Aucun de ces effets ne rend l'image illisible : ils
  // saturent tous à 70 % de leur amplitude.
  const marge = game.fogGap;
  const proche = 1 - Math.min(1, Math.max(0, (marge - 8) / DANGER_DISTANCE));
  const t = (DIAG && !diagFeature.danger) ? 0 : proche * proche * 0.7;

  scene.fog.color.copy(FOG_TINT_SAFE).lerp(FOG_TINT_DANGER, t);
  skyDome.material.color.setRGB(1 - t * 0.55, 1 - t * 0.62, 1 - t * 0.5);
  sunLight.intensity = SUN_INTENSITY * (1 - t * 0.5);
  hemiLight.intensity = HEMI_INTENSITY * (1 - t * 0.35);

  // Les balises tournent lentement et respirent : c'est le seul mouvement
  // artificiel du monde, et la seule chose qui a l'air encore alimentée.
  for (const coeur of balises) {
    coeur.rotation.y += delta * 0.55;
    coeur.rotation.x = Math.sin(elapsedTotal * 0.7) * 0.12;
    coeur.scale.setScalar(1 + Math.sin(elapsedTotal * 1.6) * 0.07);
  }

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

  if (updatePerf) updatePerf(delta);

  renderer.render(scene, camera);

  if (!firstFrameDone) {
    firstFrameDone = true;
    document.body.classList.add("ready");
    // Laisse le fondu se jouer avant de retirer l'écran de chargement.
    setTimeout(() => loading?.remove(), 700);
  }
}

// Le HUD hérité (biome, seed, chunks) est un outil de développement : il
// encombre l'écran de jeu et n'apparaît qu'en mode debug.
if (FOGTEST) document.body.classList.add("dev");

// Interface de run, puis overlay de métriques sous ?fogtest ou ?diag.
bindRunUI(game);

const updatePerf = FOGTEST
  ? bindPerfOverlay(renderer, () => ({
      chunks: chunks.size,
      objects: (() => { let n = 0; scene.traverse(() => n++); return n; })(),
      resources: game.resourceCount
    }))
  : null;

animate();

// ---------------------------------------------------------------------------
// Mode diagnostic : ?diag dans l'URL.
// Sert à isoler sur l'appareil un artefact non reproductible en test. Chaque
// bouton retire une famille d'objets de la scène ; celui qui fait disparaître
// l'artefact le désigne. Inactif — et non construit — sans le paramètre.
// ---------------------------------------------------------------------------
function applyDiagFeatures() {
  if (!DIAG) return;

  // Contamination désactivée : la portée passe à 0, donc le facteur est nul
  // partout. Le shader reste compilé — c'est bien lui qu'on veut mettre hors
  // jeu, pas seulement son effet visible.
  contamination.range.value = diagFeature.contamination ? CONTAM_RANGE : 0.0001;
  contamination.fogZ.value = diagFeature.contamination ? game.state.fogZ : -1e9;

  skyDome.visible = diagFeature.ciel;
  game.setFogDetail(diagFeature.brumeProfonde);

  if (!diagFeature.danger) {
    scene.fog.color.copy(FOG_TINT_SAFE);
    sunLight.intensity = SUN_INTENSITY;
    hemiLight.intensity = HEMI_INTENSITY;
    skyDome.material.color.setRGB(1, 1, 1);
  }
}

function applyDiagVisibility() {
  if (!DIAG) return;

  water.visible = diagVisible.eau;
  sun.visible = diagVisible.soleil;
  applyDiagFeatures();

  for (const group of chunks.values()) {
    for (const child of group.children) {
      const kind = child.userData.kind;
      if (kind && kind in diagVisible) child.visible = diagVisible[kind];
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

  // Nouveautés 0.5, chacune isolable séparément.
  const row05 = document.createElement("div");
  row05.className = "diag-row";

  for (const key of Object.keys(diagFeature)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = key;
    button.className = "on";
    button.addEventListener("click", () => {
      diagFeature[key] = !diagFeature[key];
      button.className = diagFeature[key] ? "on" : "off";
      applyDiagFeatures();

      // L'instanciation se décide à la construction : il faut rebâtir le
      // monde. Seed et position sont conservées, pour comparer la même vue.
      if (key === "instanciation") {
        const pos = { x: player.position.x, z: player.position.z };
        clearWorld();
        refreshChunks(true);
        flushBuildQueue();
        player.position.x = pos.x;
        player.position.z = pos.z;
      }
    });
    row05.appendChild(button);
  }

  panel.appendChild(row05);

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

  // Variante de fleurs : chaque appui reconstruit le monde avec une seule
  // propriété changée. Le but est de désigner la cause, pas de la deviner.
  const variante = document.createElement("button");
  variante.type = "button";
  variante.className = "on wide";
  variante.textContent = FLOWER_VARIANTS[flowerVariant];
  variante.addEventListener("click", () => {
    flowerVariant = (flowerVariant + 1) % FLOWER_VARIANTS.length;
    variante.textContent = FLOWER_VARIANTS[flowerVariant];

    const keep = { x: player.position.x, z: player.position.z };
    clearWorld();
    activeChunkKey = "";
    player.position.x = keep.x;
    player.position.z = keep.z;
    refreshChunks(true);
    applyDiagVisibility();
    updateHud(true);
  });
  row.appendChild(variante);

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
    const tally = { troncs: 0, houppiers: 0, rochers: 0, fleurs: 0, terrain: 0 };

    for (const group of chunks.values()) {
      for (const child of group.children) {
        const kind = child.userData.kind;
        if (!(kind in tally)) continue;
        tally[kind] += child.isInstancedMesh ? child.count : 1;
      }
    }

    return tally;
  },
  get kindVisibility() {
    const tally = {};
    for (const group of chunks.values()) {
      for (const child of group.children) {
        const kind = child.userData.kind || "?";
        tally[kind] = tally[kind] || { objets: 0, visibles: 0 };
        tally[kind].objets++;
        if (child.visible) tally[kind].visibles++;
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

  get chunkKeys() { return [...chunks.keys()]; },

  // La scène elle-même : sert à mesurer le coût marginal d'un élément en le
  // masquant, plutôt qu'à l'estimer.
  scene,



  /**
   * Rend une image puis mesure la part de pixels quasi noirs. Sert à répondre
   * à une question précise : le joueur voit-il encore quelque chose ?
   */
  darkFraction(seuil = 46) {
    // Rendu dans une cible hors écran, PAS dans le tampon par défaut : une
    // fois l'image présentée, le contenu du tampon arrière n'est plus garanti
    // et readPixels y renvoyait du noir, ce qui donnait 100 % sur des images
    // manifestement lisibles.
    const cible = new THREE.WebGLRenderTarget(256, 512);
    // Sans cet espace colorimétrique, la cible reçoit des valeurs LINÉAIRES
    // alors que le canevas reçoit du sRGB : une image parfaitement lisible y
    // mesurait 100 % de pixels sombres.
    cible.texture.colorSpace = THREE.SRGBColorSpace;
    const precedent = renderer.getRenderTarget();

    renderer.setRenderTarget(cible);
    renderer.render(scene, camera);

    const px = new Uint8Array(256 * 512 * 4);
    renderer.readRenderTargetPixels(cible, 0, 0, 256, 512, px);

    renderer.setRenderTarget(precedent);
    cible.dispose();

    let sombres = 0;
    let total = 0;

    for (let i = 0; i < px.length; i += 4 * 7) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      if (l < seuil) sombres++;
      total++;
    }

    return +(100 * sombres / total).toFixed(1);
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
  // --- Fog Nomad ---
  get game() { return game.state; },
  get config() { return game.config; },
  get spawnStats() { return game.spawnStats; },
  get axisX() { return game.axisX; },
  get fireCount() { return game.fireCount; },
  get canLightFire() { return game.canLightFire(); },
  get canPulse() { return game.canPulse(); },
  lightFire() { return game.lightFire(); },
  usePulse() { return game.usePulse(); },
  resetSpawnStats() { game.resetSpawnStats(); },
  get fogGap() { return game.fogGap; },
  get fogSpeed() { return game.fogSpeed; },
  // Constantes du moteur, pour que les simulations d'équilibrage travaillent
  // sur les vraies valeurs au lieu de les recopier.
  engine: {
    playerSpeed: PLAYER_SPEED,
    runMultiplier: RUN_MULTIPLIER,
    chunkSize: CHUNK_SIZE,
    chunkRadius: CHUNK_RADIUS
  },
  get bands() { return game.bands; },
  get qualite() { return QUALITE_NIVEAUX[qualite]; },
  setQualite(n) { qualite = Math.max(0, Math.min(QUALITE_NIVEAUX.length - 1, n)); appliquerQualite(); },
  get resourceCount() { return game.resourceCount; },
  get bookkeeping() { return game.bookkeeping; },
  get bagTier() { return game.bagTier(); },
  get speedFactor() { return game.speedFactor(); },
  get canSprint() { return game.canSprint(); },
  get runs() { return game.storedRuns(); },
  drop(type) { return game.dropOne(type); },
  kill(cause = "test") { game.die(cause); },
  restartRun() { game.restart(); },
  setFogZ(z) { game.setFogZ(z); },
  /** Rapproche la brume jusqu'à la marge voulue, pour tester sans attendre. */
  setFogGap(gap) { game.setFogZ(player.position.z + gap); },
  /** Ressources en scène avec leur type et leur écart latéral. */
  get resourceSample() {
    return game.resourceObjects.slice(0, 200).map((mesh) => ({
      type: mesh.userData.resource.type,
      x: mesh.userData.resource.worldX,
      z: mesh.userData.resource.worldZ,
      // L'écart latéral se mesure depuis l'axe de fuite courant, pas depuis
      // X = 0 : l'axe suit le joueur depuis la 0.4.
      lateral: Math.abs(mesh.userData.resource.worldX - game.axisX),
      jete: mesh.userData.resource.jete === true
    }));
  },

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
