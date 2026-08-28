import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";
const PHASE = process.argv[2] || "avant";
const b = await chromium.launch({ executablePath: CHROME,
  args: [...GL_ARGS, "--js-flags=--expose-gc"] });
const c = await b.newContext({ ...devices["Pixel 7"], hasTouch:true, isMobile:true });
const p = await c.newPage();
const errors = [];
p.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
p.on("console", m => { if (m.type()==="error") errors.push("CONSOLE: "+m.text());
                       if (m.type()==="warning") errors.push("WARN: "+m.text()); });
await p.goto("http://127.0.0.1:8123/index.html", { waitUntil: "load" });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: "load" });
await p.waitForTimeout(2500);

const R = [];
const ok = (n, cond, d="") => { R.push({n,cond,d}); console.log(`${cond?"PASS":"FAIL"}  ${n}${d?"  — "+d:""}`); };
const NM = (n, d) => { R.push({n,cond:null,d}); console.log(`NON MESURABLE  ${n}  — ${d}`); };

console.log(`\n########## AUDIT ${PHASE.toUpperCase()} ##########`);
console.log("\n=== TEST A — Démarrage ===");
const A = await p.evaluate(() => ({
  ctx: window.HORIZON.depthBits, nearFar: window.HORIZON.nearFar,
  chunks: window.HORIZON.chunks, seed: window.HORIZON.seed, pos: window.HORIZON.pos,
  info: window.HORIZON.info, objs: window.HORIZON.objectsInScene, waterY: window.HORIZON.waterY,
  hudSeed: document.querySelector("#seed").textContent,
  hudChunks: document.querySelector("#chunk-count").textContent,
  ready: document.body.classList.contains("ready")
}));
console.log("contexte GL:", JSON.stringify(A.ctx));
ok("A: 25 chunks au démarrage", A.chunks === 25, `${A.chunks}`);
ok("A: joueur posé sur le sol", Math.abs(A.pos.y) < 12, `y=${A.pos.y.toFixed(2)}`);
ok("A: HUD renseigné", /Seed \d+/.test(A.hudSeed), A.hudSeed);
ok("A: première image rendue", A.ready);
ok("A: aucune texture", A.info.textures === 0, `${A.info.textures}`);

console.log("\n=== PHASE 5 — Mathématique des chunks / quadrants ===");
const chunkMath = await p.evaluate(() => {
  const S = 32, out = { continuity: [], quadrants: [], floorOk: true, overlap: false, gap: false };
  // continuité de terrainHeight aux frontières X = n*S et Z = n*S
  for (const n of [-5,-3,-1,0,1,3,5]) {
    const x = n*S, eps = 1e-6;
    const a = window.HORIZON.terrainAt(x-eps, 7.3), b2 = window.HORIZON.terrainAt(x+eps, 7.3);
    const cz = window.HORIZON.terrainAt(11.7, n*S-eps), d = window.HORIZON.terrainAt(11.7, n*S+eps);
    out.continuity.push({ n, dx: Math.abs(a-b2), dz: Math.abs(cz-d) });
  }
  // Math.floor sur les quadrants
  for (const [x,z] of [[1,1],[1,-1],[-1,1],[-1,-1],[-0.001,-0.001],[-32,-32],[-33,-33],[31.999,31.999]]) {
    out.quadrants.push({ x, z, cx: Math.floor(x/S), cz: Math.floor(z/S) });
  }
  return out;
});
const maxDisc = Math.max(...chunkMath.continuity.map(c => Math.max(c.dx, c.dz)));
ok("P5: terrainHeight continu aux frontières de chunk", maxDisc < 1e-4, `discontinuité max ${maxDisc.toExponential(2)}`);
console.log("     quadrants Math.floor:", chunkMath.quadrants.map(q=>`(${q.x},${q.z})->[${q.cx},${q.cz}]`).join(" "));

// couverture : aucun trou, aucun recouvrement entre chunks voisins
const cover = await p.evaluate(() => {
  const S = 32, keys = window.HORIZON.chunkKeys.map(k => k.split(",").map(Number));
  const seen = new Set(); let dup = 0;
  for (const [cx,cz] of keys) { const k = cx+","+cz; if (seen.has(k)) dup++; seen.add(k); }
  const xs = keys.map(k=>k[0]), zs = keys.map(k=>k[1]);
  const spanX = Math.max(...xs)-Math.min(...xs)+1, spanZ = Math.max(...zs)-Math.min(...zs)+1;
  return { count: keys.length, dup, spanX, spanZ, dense: keys.length === spanX*spanZ };
});
ok("P5: aucun chunk dupliqué", cover.dup === 0, `doublons ${cover.dup}`);
ok("P5: grille pleine sans trou", cover.dense, `${cover.count} chunks sur ${cover.spanX}×${cover.spanZ}`);

console.log("\n=== PHASE 4 — Ressources : départ / 10 / 25 / 50 / 100 chunks ===");
async function snap() {
  return p.evaluate(() => ({ chunks: window.HORIZON.chunks, disc: window.HORIZON.discovered,
    info: window.HORIZON.info, objs: window.HORIZON.objectsInScene, heap: window.HORIZON.heapMB,
    inst: window.HORIZON.instances, pos: window.HORIZON.pos }));
}
async function travelChunks(n) {
  // téléporte de chunk en chunk (32 u) en diagonale, en laissant la file se vider
  for (let i = 0; i < n; i++) {
    await p.evaluate((i) => {
      const a = i * 0.7;
      window.HORIZON.teleport(Math.cos(a)*32*i*0.35, Math.sin(a)*32*i*0.35);
    }, i);
    await p.waitForTimeout(30);
  }
  await p.waitForTimeout(600);
}
const s0 = await snap();
console.log(`départ      chunks=${s0.chunks} geo=${s0.info.geometries} objs=${s0.objs} `
  + `calls=${s0.info.calls} tris=${s0.info.tris} heap=${s0.heap?s0.heap.used+"MB":"n/a"}`);
const marks = {};
for (const target of [10, 25, 50, 100]) {
  await travelChunks(target === 10 ? 10 : target - Object.keys(marks).length*0);
  const s = await snap();
  marks[target] = s;
  console.log(`${String(target).padStart(3)} chunks  chunks=${s.chunks} geo=${s.info.geometries} objs=${s.objs} `
    + `calls=${s.info.calls} tris=${s.info.tris} disc=${s.disc} heap=${s.heap?s.heap.used+"MB":"n/a"}`);
}
// `renderer.info.memory.geometries` ne compte une géométrie qu'une fois ses
// tampons GPU créés, c'est-à-dire à son premier rendu. Les géométries
// PARTAGÉES de la 0.5 — quatre familles de végétation, cinq structures
// narratives — n'apparaissent donc au compteur qu'au moment où le joueur
// croise le premier exemplaire de chaque. Cette montée-là est bornée par le
// nombre de types, pas par la distance parcourue.
//
// Comparer départ et 100 chunks confond ce chargement paresseux avec une
// fuite. On parcourt donc 100 chunks DE PLUS : une fuite continue de croître,
// un chargement paresseux, non.
await travelChunks(100);
const apresSecondTour = await snap();
console.log(`200 chunks  chunks=${apresSecondTour.chunks} geo=${apresSecondTour.info.geometries} `
  + `objs=${apresSecondTour.objs} heap=${apresSecondTour.heap?apresSecondTour.heap.used+"MB":"n/a"}`);

const geoStart = marks[100].info.geometries;
const geoEnd = apresSecondTour.info.geometries;
ok("P4: géométries GPU stables du 100e au 200e chunk", geoEnd <= geoStart + 6,
   `${geoStart} -> ${geoEnd}`);
ok("P4: objets de scène stables", marks[100].objs <= s0.objs * 1.4 + 10, `${s0.objs} -> ${marks[100].objs}`);
ok("P4: chunks actifs bornés à 25", marks[100].chunks <= 25, `${marks[100].chunks}`);

console.log("\n=== TEST B — 100+ chunks parcourus, intégrité ===");
const nan = await p.evaluate(() => window.HORIZON.scanNonFinite());
ok("B: aucune valeur non finie en scène", nan.length === 0, nan.length? JSON.stringify(nan.slice(0,3)) : "0 anomalie");

console.log("\n=== TEST C — Aller-retour, déterminisme ===");
const rt = await p.evaluate(async () => {
  window.HORIZON.teleport(0, 0);
  const seed = window.HORIZON.seed;
  const before = [];
  for (let i = 0; i < 40; i++) before.push(window.HORIZON.terrainAt(i*3.7, -i*2.9));
  for (let i = 0; i < 25; i++) window.HORIZON.teleport(i*32, i*32);   // 25 chunks aller
  window.HORIZON.teleport(0, 0);                                      // retour
  const after = [];
  for (let i = 0; i < 40; i++) after.push(window.HORIZON.terrainAt(i*3.7, -i*2.9));
  let maxd = 0;
  for (let i = 0; i < before.length; i++) maxd = Math.max(maxd, Math.abs(before[i]-after[i]));
  return { seed, seedAfter: window.HORIZON.seed, maxd, chunks: window.HORIZON.chunks };
});
ok("C: seed inchangée après aller-retour", rt.seed === rt.seedAfter, `${rt.seed}`);
ok("C: terrain identique au retour", rt.maxd === 0, `écart max ${rt.maxd}`);
ok("C: 25 chunks au retour", rt.chunks === 25, `${rt.chunks}`);

console.log("\n=== TEST D — Changements de chunk très rapides ===");
const rapid = await p.evaluate(async () => {
  const before = window.HORIZON.info.geometries;
  for (let i = 0; i < 300; i++) window.HORIZON.teleport((i%17)*32, ((i*7)%13)*32);
  return { before, after: window.HORIZON.info.geometries, chunks: window.HORIZON.chunks,
           queued: window.HORIZON.queued };
});
await p.waitForTimeout(1200);
const rapidAfter = await snap();
// Référence : le compteur JUSTE AVANT les sauts. Le comparer au départ de la
// session mesurait aussi le chargement paresseux des géométries partagées.
ok("D: pas d'explosion de géométries sous 300 sauts",
   rapidAfter.info.geometries <= rapid.before + 8,
   `${rapid.before} -> ${rapidAfter.info.geometries}`);
ok("D: 25 chunks après stabilisation", rapidAfter.chunks === 25, `${rapidAfter.chunks}`);

console.log("\n=== TEST E — NOUVEAU répété ===");
const nw = await p.evaluate(async () => {
  const out = [];
  for (let i = 0; i < 8; i++) {
    window.HORIZON.newWorld();
    out.push({ geo: window.HORIZON.info.geometries, objs: window.HORIZON.objectsInScene,
               chunks: window.HORIZON.chunks, seed: window.HORIZON.seed,
               programs: window.HORIZON.info.programs });
  }
  return out;
});
nw.forEach((s,i) => console.log(`  NOUVEAU #${i+1}: geo=${s.geo} objs=${s.objs} chunks=${s.chunks} programmes=${s.programs}`));
ok("E: géométries constantes sur 8 mondes", nw[7].geo <= nw[0].geo + 2, `${nw[0].geo} -> ${nw[7].geo}`);
ok("E: objets constants sur 8 mondes", Math.abs(nw[7].objs - nw[0].objs) < nw[0].objs*0.5,
   `${nw[0].objs} -> ${nw[7].objs}`);
ok("E: programmes shader constants", nw[7].programs === nw[0].programs, `${nw[0].programs} -> ${nw[7].programs}`);
ok("E: seeds différentes", new Set(nw.map(s=>s.seed)).size >= 7, `${new Set(nw.map(s=>s.seed)).size}/8 uniques`);

console.log("\n=== PHASE 8 — Allocations par frame ===");
const alloc = await p.evaluate(() => new Promise(res => {
  const m0 = performance.memory ? performance.memory.usedJSHeapSize : null;
  if (m0 === null) return res(null);
  let frames = 0; const t0 = performance.now();
  const tick = () => { frames++;
    if (performance.now() - t0 < 8000) requestAnimationFrame(tick);
    else res({ frames, bytes: performance.memory.usedJSHeapSize - m0,
               perFrame: (performance.memory.usedJSHeapSize - m0)/frames }); };
  requestAnimationFrame(tick);
}));
if (alloc) console.log(`  ${alloc.frames} images, heap +${(alloc.bytes/1048576).toFixed(2)} MB `
  + `= ${alloc.perFrame.toFixed(0)} o/image (immobile, sans génération)`);
else NM("P8: allocations par image", "performance.memory indisponible");

console.log("\n=== PHASE 3 — Performance ===");
const perf = await p.evaluate(() => new Promise(res => {
  const f = []; let last = performance.now(); const t0 = last;
  window.HORIZON.move(0,-1); window.HORIZON.setRun(true);
  const tick = () => { const n = performance.now(); f.push(n-last); last = n;
    if (n - t0 < 15000) requestAnimationFrame(tick);
    else { window.HORIZON.move(0,0); window.HORIZON.setRun(false);
      const s=[...f].sort((a,b)=>a-b);
      res({ fps: f.length/((last-t0)/1000), avg: f.reduce((a,b)=>a+b,0)/f.length,
            p50:s[(s.length*0.5)|0], p95:s[(s.length*0.95)|0], max:s[s.length-1],
            minFps: 1000/s[s.length-1], info: window.HORIZON.info,
            chunks: window.HORIZON.chunks, pr: window.HORIZON.pixelRatio }); } };
  requestAnimationFrame(tick);
}));
console.log(`  FPS moyen ${perf.fps.toFixed(1)} | FPS min ${perf.minFps.toFixed(1)} | `
  + `frame avg ${perf.avg.toFixed(1)}ms p50 ${perf.p50.toFixed(1)} p95 ${perf.p95.toFixed(1)} max ${perf.max.toFixed(1)}`);
console.log(`  draw calls ${perf.info.calls} | triangles ${perf.info.tris} | géométries ${perf.info.geometries} `
  + `| textures ${perf.info.textures} | programmes ${perf.info.programs} | pixelRatio ${perf.pr}`);

console.log("\n=== TEST F — Sauvegarde ===");
await p.evaluate(() => { window.HORIZON.teleport(137.5, -242.25); });
await p.waitForTimeout(300);
const saveBefore = await p.evaluate(() => { document.dispatchEvent(new Event("visibilitychange"));
  return { seed: window.HORIZON.seed, pos: window.HORIZON.pos }; });
await p.waitForTimeout(300);
await p.reload({ waitUntil: "load" }); await p.waitForTimeout(2500);
const saveAfter = await p.evaluate(() => ({ seed: window.HORIZON.seed, pos: window.HORIZON.pos,
  chunks: window.HORIZON.chunks }));
ok("F: seed conservée", saveBefore.seed === saveAfter.seed, `${saveBefore.seed} -> ${saveAfter.seed}`);
// 0.3 : position volontairement non restaurée (voir suite.mjs).
ok("F: run repart du départ après rechargement",
   Math.hypot(saveAfter.pos.x, saveAfter.pos.z) < 5,
   `(${saveBefore.pos.x.toFixed(1)},${saveBefore.pos.z.toFixed(1)}) -> (${saveAfter.pos.x.toFixed(1)},${saveAfter.pos.z.toFixed(1)})`);
ok("F: monde rechargé à 25 chunks", saveAfter.chunks === 25, `${saveAfter.chunks}`);

console.log("\n=== TEST G — Caméra ===");
const cam = await p.evaluate(async () => {
  const out = { belowTerrain: 0, samples: 0, minClear: Infinity };
  for (let i = 0; i < 60; i++) {
    const yaw = i*0.31, pitch = 0.12 + (i%9)*0.095;
    window.HORIZON.setYaw(yaw); window.HORIZON.setPitch(pitch);
    window.HORIZON.speckle();
    const cp = window.HORIZON.camPos;
    const ground = window.HORIZON.terrainAt(cp.x, cp.z);
    const clear = cp.y - ground;
    out.minClear = Math.min(out.minClear, clear);
    if (clear < 0) out.belowTerrain++;
    out.samples++;
  }
  return out;
});
ok("G: caméra jamais sous le terrain", cam.belowTerrain === 0,
   `${cam.belowTerrain}/${cam.samples} sous le sol, marge min ${cam.minClear.toFixed(2)} u`);

console.log("\n=== Erreurs runtime ===");
const real = errors.filter(e => !e.includes("favicon"));
ok("Aucune erreur / warning console", real.length === 0, real.length? JSON.stringify(real.slice(0,4)) : "propre");

const failed = R.filter(r => r.cond === false);
console.log(`\n===== ${R.filter(r=>r.cond===true).length} PASS / ${failed.length} FAIL / ${R.filter(r=>r.cond===null).length} NON MESURABLE =====`);
failed.forEach(f => console.log("  ✗ " + f.n + " — " + f.d));
await b.close();
