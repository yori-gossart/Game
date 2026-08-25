import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/+esm";

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

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bc6df);
scene.fog = new THREE.Fog(0x9cc5cd, 50, 105);

const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 180);

const hemiLight = new THREE.HemisphereLight(0xf7fbff, 0x645c42, 2.15);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffe5ad, 2.35);
sunLight.position.set(-42, 60, 24);
scene.add(sunLight);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(3.5, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xffe9ac, fog: false })
);
sun.position.set(-72, 49, -86);
scene.add(sun);

const waterMaterial = new THREE.MeshLambertMaterial({
  color: 0x599aaa,
  transparent: true,
  opacity: 0.78,
  depthWrite: true
});

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(170, 170, 1, 1),
  waterMaterial
);
water.rotation.x = -Math.PI / 2;
water.position.y = -2.65;
scene.add(water);

const CHUNK_SIZE = 24;
const CHUNK_RADIUS = 2;
const CHUNK_SEGMENTS = 9;
const PLAYER_SPEED = 6.2;
const RUN_MULTIPLIER = 1.8;
const SAVE_KEY = "horizon-proto-0.2-save";

let worldSeed = 0;
let activeChunkKey = "";
let running = false;
let joystickPointer = null;
let joystickVector = { x: 0, y: 0 };
let cameraPointer = null;
let cameraLastX = 0;
let cameraYaw = 0;
let cameraPitch = 0.5;
let walkTime = 0;
let fpsTime = 0;
let fpsFrames = 0;
let adaptivePixelRatioDone = false;

const chunks = new Map();
const discovered = new Set();

const BIOMES = [
  {
    name: "Prairie haute",
    terrain: 0x74a45d,
    tree: 0x477444,
    density: 0.72,
    dry: false
  },
  {
    name: "Forêt douce",
    terrain: 0x628b50,
    tree: 0x345e3c,
    density: 0.92,
    dry: false
  },
  {
    name: "Plateau doré",
    terrain: 0xb09f68,
    tree: 0x6f7442,
    density: 0.36,
    dry: true
  },
  {
    name: "Landes",
    terrain: 0x7f8f69,
    tree: 0x4f6848,
    density: 0.48,
    dry: false
  }
];

const terrainMaterials = BIOMES.map(
  (biome) =>
    new THREE.MeshLambertMaterial({
      color: biome.terrain,
      flatShading: true
    })
);

const rockMaterial = new THREE.MeshLambertMaterial({
  color: 0x7d7b73,
  flatShading: true
});

const trunkMaterial = new THREE.MeshLambertMaterial({
  color: 0x765336,
  flatShading: true
});

const flowerMaterials = [
  new THREE.MeshBasicMaterial({ color: 0xf2d07e }),
  new THREE.MeshBasicMaterial({ color: 0xe8a3a1 }),
  new THREE.MeshBasicMaterial({ color: 0xd7d0f0 })
];

const trunkGeometry = new THREE.CylinderGeometry(0.14, 0.23, 1.35, 5);
const crownGeometry = new THREE.ConeGeometry(0.88, 1.8, 6);
const crownSmallGeometry = new THREE.ConeGeometry(0.65, 1.4, 6);
const rockGeometry = new THREE.DodecahedronGeometry(0.5, 0);
const flowerGeometry = new THREE.SphereGeometry(0.075, 5, 4);

const player = createPlayer();
scene.add(player);

const keys = new Set();

function createPlayer() {
  const group = new THREE.Group();
  const blue = new THREE.MeshLambertMaterial({ color: 0x284d72, flatShading: true });
  const blueDark = new THREE.MeshLambertMaterial({ color: 0x18354e, flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8aa83, flatShading: true });
  const hair = new THREE.MeshLambertMaterial({ color: 0x3d2d27, flatShading: true });
  const bagMat = new THREE.MeshLambertMaterial({ color: 0x9a6b3d, flatShading: true });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.72, 4, 8), blue);
  body.position.y = 1.15;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), skin);
  head.position.y = 1.95;

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hair
  );
  hairCap.position.y = 2.04;

  const legGeo = new THREE.CapsuleGeometry(0.105, 0.48, 3, 5);
  const leftLeg = new THREE.Mesh(legGeo, blueDark);
  leftLeg.position.set(-0.19, 0.34, 0);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.19;

  const armGeo = new THREE.CapsuleGeometry(0.085, 0.43, 3, 5);
  const leftArm = new THREE.Mesh(armGeo, skin);
  leftArm.position.set(-0.48, 1.18, 0);
  leftArm.rotation.z = -0.15;

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.48;
  rightArm.rotation.z = 0.15;

  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.24), bagMat);
  bag.position.set(0, 1.17, 0.38);
  bag.rotation.x = -0.08;

  group.add(body, head, hairCap, leftLeg, rightLeg, leftArm, rightArm, bag);
  group.userData = { leftLeg, rightLeg, leftArm, rightArm };
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

  const detail =
    Math.cos((x - z) * 0.055 - sz * 2.1) * 0.42;

  return broad + ridge + detail;
}

function biomeIndexForChunk(cx, cz) {
  const n = random01(
    Math.floor(cx / 2) * 17,
    Math.floor(cz / 2) * 19,
    81
  );
  return Math.min(BIOMES.length - 1, Math.floor(n * BIOMES.length));
}

function makeTree(localX, localZ, worldY, scale, biomeIndex) {
  const biome = BIOMES[biomeIndex];
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 0.68 * scale;
  trunk.scale.setScalar(scale);

  const leafMaterial = new THREE.MeshLambertMaterial({
    color: biome.tree,
    flatShading: true
  });

  const crown1 = new THREE.Mesh(crownGeometry, leafMaterial);
  crown1.position.y = 1.72 * scale;
  crown1.scale.setScalar(scale);

  const crown2 = new THREE.Mesh(crownSmallGeometry, leafMaterial);
  crown2.position.y = 2.58 * scale;
  crown2.scale.setScalar(scale * 0.93);

  group.position.set(localX, worldY, localZ);
  group.add(trunk, crown1, crown2);
  group.userData.dynamicMaterial = leafMaterial;
  return group;
}

function makeRock(localX, localZ, y, scale, rotationSeed) {
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  rock.position.set(localX, y + 0.25 * scale, localZ);
  rock.scale.set(scale, scale * (0.58 + rotationSeed * 0.2), scale * 0.9);
  rock.rotation.set(rotationSeed * 0.7, rotationSeed * Math.PI * 1.8, 0);
  return rock;
}

function makeFlower(localX, localZ, y, materialIndex) {
  const flower = new THREE.Mesh(
    flowerGeometry,
    flowerMaterials[materialIndex % flowerMaterials.length]
  );
  flower.position.set(localX, y + 0.12, localZ);
  return flower;
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

  for (let i = 0; i < positions.count; i++) {
    const worldX = positions.getX(i) + centerX;
    const worldZ = positions.getZ(i) + centerZ;
    positions.setY(i, terrainHeight(worldX, worldZ));
  }

  geometry.computeVertexNormals();

  const biomeIndex = biomeIndexForChunk(cx, cz);
  const biome = BIOMES[biomeIndex];

  const terrain = new THREE.Mesh(geometry, terrainMaterials[biomeIndex]);
  group.add(terrain);

  const propCount =
    3 + Math.floor(random01(cx, cz, 12) * 5 * biome.density);

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

    const type = random01(cx * 41 + i, cz * 31 - i, 51);

    if (type < biome.density && !biome.dry) {
      const scale =
        0.66 + random01(cx + i * 7, cz - i * 11, 62) * 0.78;
      group.add(makeTree(localX, localZ, y, scale, biomeIndex));
    } else {
      const scale =
        0.38 + random01(cx - i * 5, cz + i * 3, 72) * 0.82;
      const rot = random01(i, cx + cz, 75);
      group.add(makeRock(localX, localZ, y, scale, rot));
    }
  }

  if (!biome.dry) {
    const flowerCount = Math.floor(random01(cx, cz, 101) * 5);

    for (let i = 0; i < flowerCount; i++) {
      const localX =
        (random01(cx * 131 + i, cz * 43, 103) - 0.5) *
        (CHUNK_SIZE - 2);
      const localZ =
        (random01(cx * 79, cz * 149 - i, 105) - 0.5) *
        (CHUNK_SIZE - 2);

      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;
      const y = terrainHeight(worldX, worldZ);

      if (y > -2.2) {
        group.add(makeFlower(localX, localZ, y, i + cx + cz));
      }
    }
  }

  scene.add(group);
  chunks.set(key, group);
  discovered.add(key);
}

function disposeChunk(group) {
  scene.remove(group);

  group.traverse((object) => {
    if (
      object.geometry &&
      object.geometry !== trunkGeometry &&
      object.geometry !== crownGeometry &&
      object.geometry !== crownSmallGeometry &&
      object.geometry !== rockGeometry &&
      object.geometry !== flowerGeometry
    ) {
      object.geometry.dispose();
    }

    if (object.userData?.dynamicMaterial) {
      object.userData.dynamicMaterial.dispose();
    }
  });
}

function refreshChunks(force = false) {
  const cx = Math.floor(player.position.x / CHUNK_SIZE);
  const cz = Math.floor(player.position.z / CHUNK_SIZE);
  const key = `${cx},${cz}`;

  if (!force && key === activeChunkKey) return;
  activeChunkKey = key;

  for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      createChunk(cx + dx, cz + dz);
    }
  }

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

function clearWorld() {
  for (const group of chunks.values()) {
    disposeChunk(group);
  }

  chunks.clear();
  discovered.clear();
}

function currentBiome() {
  const cx = Math.floor(player.position.x / CHUNK_SIZE);
  const cz = Math.floor(player.position.z / CHUNK_SIZE);
  return BIOMES[biomeIndexForChunk(cx, cz)];
}

function saveGame() {
  const data = {
    seed: worldSeed,
    x: Number(player.position.x.toFixed(3)),
    z: Number(player.position.z.toFixed(3)),
    yaw: Number(cameraYaw.toFixed(3))
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
    return true;
  } catch {
    return false;
  }
}

function startNewWorld() {
  clearWorld();

  worldSeed = Math.floor(100000 + Math.random() * 899999);
  activeChunkKey = "";
  cameraYaw = 0;

  player.position.set(1.5, 0, 1.5);
  player.position.y = terrainHeight(player.position.x, player.position.z);

  refreshChunks(true);
  updateHud();
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
  updateHud();
}

function updateHud() {
  const biome = currentBiome();

  biomeEl.textContent = biome.name;
  coordsEl.textContent =
    `X ${player.position.x.toFixed(1)} · Z ${player.position.z.toFixed(1)}`;

  chunksEl.textContent = `${chunks.size} chunks actifs`;
  discoveredEl.textContent = `${discovered.size} découverts`;
  seedEl.textContent = `Seed ${worldSeed}`;
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

joystick.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  joystick.setPointerCapture?.(event.pointerId);
  updateJoystick(event.clientX, event.clientY);
});

joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId !== joystickPointer) return;
  updateJoystick(event.clientX, event.clientY);
});

joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);
joystick.addEventListener("lostpointercapture", releaseJoystick);

canvas.addEventListener("pointerdown", (event) => {
  if (event.clientX < window.innerWidth * 0.42) return;

  cameraPointer = event.pointerId;
  cameraLastX = event.clientX;
  canvas.setPointerCapture?.(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== cameraPointer) return;

  const dx = event.clientX - cameraLastX;
  cameraLastX = event.clientX;
  cameraYaw -= dx * 0.0085;
});

const releaseCamera = (event) => {
  if (event.pointerId === cameraPointer) {
    cameraPointer = null;
  }
};

canvas.addEventListener("pointerup", releaseCamera);
canvas.addEventListener("pointercancel", releaseCamera);
canvas.addEventListener("lostpointercapture", () => {
  cameraPointer = null;
});

runButton.addEventListener("pointerdown", () => {
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
  } catch {}
  startNewWorld();
});

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
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

  return { x, z };
}

function animatePlayer(moving, sprinting, delta) {
  const { leftLeg, rightLeg, leftArm, rightArm } = player.userData;

  if (moving) {
    walkTime += delta * (sprinting ? 12 : 8);
    const swing = Math.sin(walkTime) * (sprinting ? 0.62 : 0.42);

    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    leftArm.rotation.x = -swing * 0.78;
    rightArm.rotation.x = swing * 0.78;

    player.position.y += Math.abs(Math.sin(walkTime * 2)) * 0.025;
  } else {
    const settle = Math.min(1, delta * 10);

    leftLeg.rotation.x *= 1 - settle;
    rightLeg.rotation.x *= 1 - settle;
    leftArm.rotation.x *= 1 - settle;
    rightArm.rotation.x *= 1 - settle;
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

resumeOrCreateWorld();

const clock = new THREE.Clock();
let hudTimer = 0;
let saveTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.04);
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

    const ground = terrainHeight(player.position.x, player.position.z);
    player.position.y = Math.max(ground, -2.45);

    refreshChunks();
  } else {
    const ground = terrainHeight(player.position.x, player.position.z);
    player.position.y = Math.max(ground, -2.45);
  }

  animatePlayer(moving, sprinting, delta);

  water.position.x = Math.round(player.position.x / 20) * 20;
  water.position.z = Math.round(player.position.z / 20) * 20;

  const distance = 11.8;
  const cameraX = player.position.x - Math.sin(cameraYaw) * distance;
  const cameraZ = player.position.z + Math.cos(cameraYaw) * distance;

  const desiredCamera = new THREE.Vector3(
    cameraX,
    player.position.y + 6.8 + cameraPitch,
    cameraZ
  );

  camera.position.lerp(
    desiredCamera,
    1 - Math.pow(0.002, delta)
  );

  camera.lookAt(
    player.position.x,
    player.position.y + 1.25,
    player.position.z
  );

  sun.position.x = player.position.x - 72;
  sun.position.z = player.position.z - 86;

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

  fpsTime += delta;
  fpsFrames++;

  if (!adaptivePixelRatioDone && fpsTime > 4) {
    const fps = fpsFrames / fpsTime;

    if (fps < 37) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.0));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }

    adaptivePixelRatioDone = true;
  }

  renderer.render(scene, camera);
}

loading.remove();
animate();
