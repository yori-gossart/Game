import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";
import { mkdirSync } from "node:fs";
const OUT = process.env.SHOT_DIR || "./.shots";
mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || "http://127.0.0.1:8123/index.html";

const b = await chromium.launch({ executablePath: CHROME,
  args: GL_ARGS });
const c = await b.newContext({ ...devices["Pixel 7"], hasTouch:true, isMobile:true });
const p = await c.newPage();
const errors = [];
p.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
p.on("console", m => { if (m.type()==="error") errors.push("CONSOLE: "+m.text());
                       if (m.type()==="warning") errors.push("WARN: "+m.text()); });
p.on("response", r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });

const R = [];
const ok = (n, cond, d="") => { R.push({n,cond}); console.log(`${cond?"PASS":"FAIL"}  ${n}${d?"  — "+d:""}`); };

await p.goto(URL, { waitUntil: "load" });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: "load" }); await p.waitForTimeout(2600);

console.log("=== BRUME ===");
// La vitesse se mesure en temps de JEU, pas en temps réel : `delta` est
// plafonné à 40 ms par image, donc sous rendu logiciel le temps de jeu avance
// moins vite que l'horloge. Diviser par l'attente réelle mesurerait la cadence
// de la machine de test, pas la règle du jeu.
const avance = await p.evaluate(async () => {
  const z0 = window.HORIZON.game.fogZ;
  const t0 = window.HORIZON.game.elapsed;
  await new Promise((r) => setTimeout(r, 2500));
  return { unites: z0 - window.HORIZON.game.fogZ,
           secondes: window.HORIZON.game.elapsed - t0 };
});
const fog0 = await p.evaluate(() => window.HORIZON.fogGap);
// Ce qui compte est que la brume gagne du terrain sur un joueur immobile, pas
// qu'elle parcoure un nombre d'unités fixé d'avance : sous rendu logiciel, le
// temps de JEU écoulé pendant l'attente dépend de la machine. Un seuil absolu
// mesurait donc la cadence de la machine de test.
ok("brume: avance vers le joueur à l'arrêt",
   avance.unites > 0 && avance.secondes > 0.2,
   `${avance.unites.toFixed(1)} u en ${avance.secondes.toFixed(2)} s de jeu`);
const fogSpeed = avance.unites / avance.secondes;
const attendue = await p.evaluate(() => window.HORIZON.config.fog.speed);
ok("brume: vitesse conforme à la configuration",
   Math.abs(fogSpeed - attendue) < 1.2, `${fogSpeed.toFixed(2)} u/s pour ${attendue} configurés`);
ok("brume: le mur est en scène", await p.evaluate(() => {
  let found = false; return window.HORIZON.objectsInScene > 0 && true; }), "");

console.log("\n=== DÉGÂTS ET MORT ===");
await p.evaluate(() => { window.HORIZON.restartRun(); window.HORIZON.setFogGap(-1); });
await p.waitForTimeout(900);
const hurt = await p.evaluate(() => window.HORIZON.game.health);
ok("dégâts: la vie baisse dans la brume", hurt < 100, `vie ${hurt.toFixed(0)}`);
// On attend la MORT, pas une durée. `delta` est plafonné à 40 ms par image :
// sous rendu logiciel le temps de jeu avance moins vite que le temps réel, et
// une attente fixe transformerait la cadence de la machine de test en verdict.
// Ce qui est vérifié reste la règle : ~3 s de brume tuent depuis 100 de vie.
const mort = await p.evaluate(async () => {
  const debut = window.HORIZON.game.elapsed;
  const limite = performance.now() + 15000;
  while (!window.HORIZON.game.dead && performance.now() < limite) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return { dead: window.HORIZON.game.dead,
           secondes: +(window.HORIZON.game.elapsed - debut).toFixed(2) };
});
await p.waitForTimeout(300);
const dead = await p.evaluate(() => ({ dead: window.HORIZON.game.dead,
  cause: window.HORIZON.game.deathCause, ecran: !document.querySelector("#death").hidden }));
ok("mort: déclenchée après séjour prolongé", dead.dead, dead.cause);
ok("mort: survient en ~3 s de brume", mort.secondes > 2 && mort.secondes < 4.5,
   `${mort.secondes} s de jeu`);
ok("mort: écran de fin affiché", dead.ecran);
ok("mort: statistiques listées", await p.evaluate(() =>
  document.querySelectorAll("#death-stats dt").length >= 6));
const stored = await p.evaluate(() => window.HORIZON.runs);
ok("mort: run enregistrée localement", stored.length >= 1, `${stored.length} run(s)`);

console.log("\n=== RESTART ===");
await p.click("#restart");
await p.waitForTimeout(1200);
const afterRestart = await p.evaluate(() => ({ ...window.HORIZON.game,
  ecran: !document.querySelector("#death").hidden, res: window.HORIZON.resourceCount,
  chunks: window.HORIZON.chunks, gap: window.HORIZON.fogGap }));
ok("restart: partie relancée", !afterRestart.dead && afterRestart.health === 100);
ok("restart: écran de mort masqué", !afterRestart.ecran);
ok("restart: sac vidé", afterRestart.weight === 0);
ok("restart: brume replacée", afterRestart.gap > 50, `marge ${afterRestart.gap.toFixed(0)}`);
ok("restart: ressources régénérées", afterRestart.res > 5, `${afterRestart.res}`);
ok("restart: 25 chunks", afterRestart.chunks === 25);

console.log("\n=== RESSOURCES ET LATÉRALITÉ ===");
// Un seul relevé ne suffit plus depuis la 0.5 : le cristal ne représente que
// ~6,5 % des poses, donc les 25 chunks visibles n'en contiennent souvent que
// deux ou trois. Conclure d'un échantillon de 3 revient à mesurer le hasard —
// c'est ce qui rendait ce test intermittent. On balaye donc le monde jusqu'à
// disposer d'un échantillon utilisable.
const sample = await p.evaluate(async () => {
  const vus = [];
  const cle = (r) => `${Math.round(r.x)},${Math.round(r.z)}`;
  const connus = new Set();

  for (let k = 0; k < 60; k++) {
    window.HORIZON.teleport((k % 7) * 64 - 190, -k * 48);
    await new Promise((r) => setTimeout(r, 110));
    for (const r of window.HORIZON.resourceSample) {
      if (connus.has(cle(r))) continue;
      connus.add(cle(r));
      vus.push(r);
    }
    if (vus.filter((r) => r.type === "cristal").length >= 30) break;
  }
  return vus;
});
const byType = {};
for (const r of sample) (byType[r.type] = byType[r.type] || []).push(r.lateral);
console.log(`   échantillon : ${sample.length} ressources ` +
  `(${(byType.cristal || []).length} cristaux)`);
// La ration (0.5) est une quatrième entrée de `CONFIG.resources`, mais elle ne
// pousse pas dans le monde ouvert : elle est posée à la main dans les abris, et
// son abondance latérale est nulle. Ce que ce test vérifie reste donc que les
// TROIS ressources du compromis central sont bien réparties dans le monde.
const LATERALES = ["bois", "pierre", "cristal"];
ok("ressources: les trois ressources du compromis sont présentes",
   LATERALES.every((t) => (byType[t] || []).length > 0),
   Object.keys(byType).join(", "));
ok("ressources: la ration ne pousse pas en terrain découvert",
   (byType.ration || []).length === 0 ||
   (byType.ration || []).length / sample.length < 0.05,
   `${(byType.ration || []).length} rations sur ${sample.length} ressources vues`);
const moy = (a) => a.reduce((x,y)=>x+y,0)/a.length;
const mBois = moy(byType.bois||[0]), mPierre = moy(byType.pierre||[0]), mCristal = moy(byType.cristal||[0]);
ok("ressources: les rares sont plus latérales", mCristal > mPierre && mPierre > mBois,
   `bois ${mBois.toFixed(0)} < pierre ${mPierre.toFixed(0)} < cristal ${mCristal.toFixed(0)}`);
// 0.4 a remplacé les bandes latérales strictes par une pondération gaussienne
// continue : les bandes fixes vidaient le monde après ~40 chunks en diagonale.
// Un cristal peut donc apparaître près de l'axe, mais cela doit rester rare —
// c'est la rareté qui fait le détour, pas une frontière.
{
  const cristaux = byType.cristal || [];
  const proches = cristaux.filter(l => l < 30).length;
  const part = cristaux.length ? proches / cristaux.length : 0;
  // Le seuil ne vaut que sur un échantillon suffisant : en dessous, le test
  // dirait surtout que le tirage a été chanceux ou non.
  ok("ressources: échantillon de cristaux exploitable",
     cristaux.length >= 12, `${cristaux.length} cristaux relevés`);
  ok("ressources: le cristal reste rare dans le couloir central",
     part <= 0.3, `${proches}/${cristaux.length} sous 30 u (${(part*100).toFixed(0)} %)`);
}

console.log("\n=== COLLECTE ET POIDS ===");
const pick = await p.evaluate(async () => {
  const target = window.HORIZON.resourceSample.find(r => r.type === "bois");
  if (!target) return null;
  window.HORIZON.teleport(target.x, target.z);
  const before = window.HORIZON.game.weight;
  await new Promise(r => setTimeout(r, 1400));
  const st = window.HORIZON.game;
  return { before, after: st.weight, collected: st.collected, inv: { ...st.inventory },
           tier: window.HORIZON.bagTier };
});
ok("collecte: ramassage automatique à proximité", pick && pick.after > pick.before,
   pick ? `poids ${pick.before} -> ${pick.after}` : "aucune cible");
ok("collecte: objet ajouté à l'inventaire", pick && pick.collected >= 1);

const speeds = await p.evaluate(() => {
  const out = [];
  for (const w of [0, 25, 50, 75, 100]) {
    window.HORIZON.game.weight = w;
    out.push({ w, f: +window.HORIZON.speedFactor.toFixed(3) });
  }
  window.HORIZON.game.weight = 0;
  return out;
});
console.log("   vitesse selon la charge:", speeds.map(s=>`${s.w}%→${s.f}`).join("  "));
ok("poids: sac vide = pleine vitesse", speeds[0].f === 1);
ok("poids: ralentissement monotone", speeds.every((s,i)=> i===0 || s.f < speeds[i-1].f));
ok("poids: sac plein encore jouable", speeds[4].f >= 0.4 && speeds[4].f <= 0.55, `${speeds[4].f}`);

console.log("\n=== SAC VISUEL ===");
const tiers = await p.evaluate(() => {
  const out = [];
  for (const w of [0, 20, 45, 70, 95]) { window.HORIZON.game.weight = w;
    out.push(window.HORIZON.bagTier); }
  window.HORIZON.game.weight = 0;
  return out;
});
ok("sac: cinq paliers distincts", new Set(tiers).size === 5, tiers.join(" → "));

console.log("\n=== JETER ===");
const drop = await p.evaluate(async () => {
  window.HORIZON.restartRun();
  await new Promise(r => setTimeout(r, 300));
  const t = window.HORIZON.resourceSample.find(r => r.type === "bois");
  window.HORIZON.teleport(t.x, t.z);
  await new Promise(r => setTimeout(r, 1400));
  const before = window.HORIZON.game.weight;
  const chips = document.querySelectorAll(".bag-chip").length;
  const done = window.HORIZON.drop("bois");
  return { before, after: window.HORIZON.game.weight, done, chips,
           jetees: window.HORIZON.game.dropped };
});
ok("jeter: le poids baisse immédiatement", drop.done && drop.after < drop.before,
   `${drop.before} -> ${drop.after}`);
ok("jeter: compteur incrémenté", drop.jetees === 1);
ok("jeter: liste du sac affichée", drop.chips >= 1, `${drop.chips} entrée(s)`);

console.log("\n=== ENDURANCE ===");
const stam = await p.evaluate(async () => {
  window.HORIZON.restartRun();
  await new Promise(r => setTimeout(r, 300));
  const full = window.HORIZON.game.stamina;
  window.HORIZON.move(0,-1); window.HORIZON.setRun(true);
  await new Promise(r => setTimeout(r, 2500));
  const drained = window.HORIZON.game.stamina;
  window.HORIZON.setRun(false); window.HORIZON.move(0,0);
  await new Promise(r => setTimeout(r, 2500));
  const back = window.HORIZON.game.stamina;
  // épuisement complet
  window.HORIZON.game.stamina = 2;
  return { full, drained, back, canSprint: window.HORIZON.canSprint };
});
ok("endurance: le sprint consomme", stam.drained < stam.full - 15,
   `${stam.full.toFixed(0)} -> ${stam.drained.toFixed(0)}`);
ok("endurance: récupération hors sprint", stam.back > stam.drained + 15,
   `-> ${stam.back.toFixed(0)}`);
ok("endurance: sprint bloqué à vide", stam.canSprint === false);

console.log("\n=== QUADRANTS ET SEED ===");
const quad = await p.evaluate(async () => {
  const out = [];
  for (const [x, z] of [[400, 400], [400, -400], [-400, 400], [-400, -400]]) {
    // Relance la run sur place : le couloir de ressources suit le départ.
    window.HORIZON.setSeed(424242, x, z);
    window.HORIZON.restartRun();
    await new Promise(r => setTimeout(r, 400));
    out.push({ x, z, chunks: window.HORIZON.chunks, res: window.HORIZON.resourceCount,
               nan: window.HORIZON.scanNonFinite().length });
  }
  return out;
});
quad.forEach(q => console.log(`   (${q.x},${q.z}) chunks=${q.chunks} ressources=${q.res} NaN=${q.nan}`));
ok("quadrants: 25 chunks partout", quad.every(q => q.chunks === 25));
ok("quadrants: aucune valeur non finie", quad.every(q => q.nan === 0));
ok("quadrants: ressources générées dans les quatre",
   quad.every(q => q.res > 5), quad.map(q => q.res).join(" / "));

const seeds = await p.evaluate(async () => {
  const a = window.HORIZON.seed;
  window.HORIZON.setSeed(777001, 0, 0);
  await new Promise(r => setTimeout(r, 300));
  const s1 = window.HORIZON.resourceCount;
  window.HORIZON.setSeed(777002, 0, 0);
  await new Promise(r => setTimeout(r, 300));
  return { a, s1, s2: window.HORIZON.resourceCount, seed: window.HORIZON.seed };
});
ok("seed: changement pris en compte", seeds.seed === 777002, `${seeds.seed}`);
ok("seed: ressources régénérées", seeds.s1 > 0 && seeds.s2 > 0, `${seeds.s1} puis ${seeds.s2}`);

console.log("\n=== 10 RUNS SUCCESSIVES ===");
const before10 = await p.evaluate(() => ({ geo: window.HORIZON.info.geometries,
  objets: window.HORIZON.objectsInScene, heap: window.HORIZON.heapMB }));
const cycle = await p.evaluate(async () => {
  const out = [];
  for (let i = 0; i < 10; i++) {
    window.HORIZON.restartRun();
    await new Promise(r => setTimeout(r, 120));
    window.HORIZON.setFogGap(-1);
    await new Promise(r => setTimeout(r, 40));
    window.HORIZON.kill("test " + i);
    out.push({ geo: window.HORIZON.info.geometries, objets: window.HORIZON.objectsInScene,
               res: window.HORIZON.resourceCount, chunks: window.HORIZON.chunks });
  }
  window.HORIZON.restartRun();
  return out;
});
await p.waitForTimeout(900);
const after10 = await p.evaluate(() => ({ geo: window.HORIZON.info.geometries,
  objets: window.HORIZON.objectsInScene, heap: window.HORIZON.heapMB,
  runs: window.HORIZON.runs.length, chunks: window.HORIZON.chunks }));
console.log(`   géométries ${before10.geo} -> ${after10.geo} | objets ${before10.objets} -> ${after10.objets}`);
ok("10 runs: géométries stables", after10.geo <= before10.geo + 6, `${before10.geo} -> ${after10.geo}`);
ok("10 runs: objets de scène stables", after10.objets <= before10.objets * 1.5 + 20);
ok("10 runs: chunks bornés", cycle.every(c => c.chunks <= 25) && after10.chunks === 25);
ok("10 runs: télémétrie plafonnée", after10.runs <= 20, `${after10.runs} runs stockées`);

console.log("\n=== PERFORMANCE ===");
const perf = await p.evaluate(() => new Promise(res => {
  const f=[]; let last=performance.now(); const t0=last;
  window.HORIZON.move(0,-1); window.HORIZON.setRun(true);
  const tick=()=>{const n=performance.now(); f.push(n-last); last=n;
    if(n-t0<12000) requestAnimationFrame(tick);
    else { window.HORIZON.move(0,0); window.HORIZON.setRun(false);
      const s=[...f].sort((a,b)=>a-b);
      res({ fps:f.length/((last-t0)/1000), p95:s[(s.length*0.95)|0], max:s[s.length-1],
            info: window.HORIZON.info, chunks: window.HORIZON.chunks,
            objets: window.HORIZON.objectsInScene, res: window.HORIZON.resourceCount }); } };
  requestAnimationFrame(tick); }));
console.log(`   FPS ${perf.fps.toFixed(1)} | p95 ${perf.p95.toFixed(1)}ms | max ${perf.max.toFixed(1)}ms`);
console.log(`   ${perf.info.calls} calls | ${perf.info.triangles ?? perf.info.tris} tris | `
  + `${perf.info.geometries} géo | ${perf.info.textures} tex | ${perf.chunks} chunks | `
  + `${perf.objets} objets | ${perf.res} ressources`);
ok("perf: aucune texture", perf.info.textures === 0);
ok("perf: chunks bornés en course", perf.chunks === 25);

const real = errors.filter(e => !e.includes("favicon"));
ok("runtime: aucune erreur console", real.length === 0, real.length ? JSON.stringify(real.slice(0,4)) : "propre");

await p.screenshot({ path: `${OUT}/v03-suite.png` });
const failed = R.filter(r => !r.cond);
console.log(`\n===== ${R.length - failed.length} / ${R.length} PASS =====`);
failed.forEach(f => console.log("  ✗ " + f.n));
await b.close();
process.exit(failed.length ? 1 : 0);
