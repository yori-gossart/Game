/**
 * FOG NOMAD 0.5 — équilibre, pression et endurance du monde.
 *
 * Trois choses y sont vérifiées, dans cet ordre :
 *   1. la distribution des ressources, MESURÉE et non déclarée (phase 2) ;
 *   2. les propriétés de la courbe de pression de la brume (phases 3 à 5) ;
 *   3. la tenue du monde sur une longue run (phase 23).
 *
 * Rendu logiciel : aucun FPS n'est jugé ici, uniquement des comptages et des
 * états, qui eux sont exacts.
 */
import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";
import { ENGINE } from "./simulate05.mjs";

const URL = process.env.FOG_URL || "http://127.0.0.1:8123/index.html";

let pass = 0, fail = 0;
const failures = [];
function ok(label, condition, detail = "") {
  if (condition) { pass++; console.log(`PASS  ${label}${detail ? "  — " + detail : ""}`); }
  else { fail++; failures.push(label); console.log(`FAIL  ${label}${detail ? "  — " + detail : ""}`); }
}

const browser = await chromium.launch({ executablePath: CHROME, args: GL_ARGS });
const context = await browser.newContext({ ...devices["Pixel 7"], hasTouch: true, isMobile: true });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(URL, { waitUntil: "load" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2800);

const H = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);

// ---------------------------------------------------------------------------
console.log("\n=== CONSTANTES DU MOTEUR ===");
// Les simulations d'équilibrage recopient ces valeurs : si elles divergent,
// leurs conclusions ne portent plus sur ce jeu.
const moteur = await H(() => window.HORIZON.engine);
ok("moteur: la simulation utilise la vraie vitesse du joueur",
   moteur.playerSpeed === ENGINE.playerSpeed, `${moteur.playerSpeed} / ${ENGINE.playerSpeed}`);
ok("moteur: la simulation utilise le vrai multiplicateur de sprint",
   moteur.runMultiplier === ENGINE.runMultiplier, `${moteur.runMultiplier} / ${ENGINE.runMultiplier}`);
ok("moteur: la simulation utilise la vraie taille de chunk",
   moteur.chunkSize === ENGINE.chunkSize, `${moteur.chunkSize} / ${ENGINE.chunkSize}`);

// ---------------------------------------------------------------------------
console.log("\n=== DISTRIBUTION DES RESSOURCES (phase 2) ===");
// On compte ce que le GÉNÉRATEUR produit (spawnStats), pas ce qui reste en
// scène : le ramassage et le déchargement fausseraient la mesure.
const SEEDS = [424242, 991177, 130500];
const AXES = { droit: { x: 0, z: -1 }, diagonale: { x: 1, z: -1 }, lateral: { x: -1, z: 0 } };

const releves = [];
for (const seed of SEEDS) {
  for (const [nom, pas] of Object.entries(AXES)) {
    await H((s) => window.HORIZON.setSeed(s, 0, 0), seed);
    await wait(800);
    await H(() => { window.HORIZON.restartRun(); window.HORIZON.resetSpawnStats(); });
    await wait(350);

    for (let ch = 4; ch <= 100; ch += 4) {
      await H(([x, z]) => window.HORIZON.teleport(x, z), [pas.x * ch * 32, pas.z * ch * 32]);
      await wait(140);
    }
    await wait(500);

    const st = await H(() => window.HORIZON.spawnStats);
    const t = st.parType || {};
    const n = (t.bois || 0) + (t.pierre || 0) + (t.cristal || 0);
    releves.push({ seed, axe: nom, n, cristal: n ? (t.cristal || 0) / n : 0,
                   types: Object.keys(t).length });
  }
}

const totalPoses = releves.reduce((s, r) => s + r.n, 0);
const totalCristal = releves.reduce((s, r) => s + r.n * r.cristal, 0);
const partGlobale = totalCristal / totalPoses;
const parts = releves.map((r) => r.cristal);

console.log(`   ${totalPoses} poses sur ${releves.length} relevés · ` +
  `cristal ${(100 * partGlobale).toFixed(1)} % ` +
  `(min ${(100 * Math.min(...parts)).toFixed(1)} %, max ${(100 * Math.max(...parts)).toFixed(1)} %)`);

ok("ressources: le cristal est rare globalement",
   partGlobale >= 0.04 && partGlobale <= 0.09,
   `${(100 * partGlobale).toFixed(1)} % (cible 5 à 8 %)`);
ok("ressources: aucun relevé ne dépasse 12 % de cristal",
   Math.max(...parts) < 0.12, `max ${(100 * Math.max(...parts)).toFixed(1)} %`);
ok("ressources: les trois types sont générés sur chaque relevé",
   releves.every((r) => r.types === 3),
   releves.filter((r) => r.types !== 3).map((r) => `${r.seed}/${r.axe}`).join(", ") || "tous");
ok("ressources: aucun relevé vide",
   releves.every((r) => r.n > 50), `minimum ${Math.min(...releves.map((r) => r.n))} poses`);

// ---------------------------------------------------------------------------
console.log("\n=== PUISSANCE DU CRISTAL (phase 3) ===");
await H(() => { window.HORIZON.restartRun(); window.HORIZON.teleport(0, 0); });
await wait(900);

const push = await H(() => window.HORIZON.config.crystal.pushDistance);
ok("cristal: la poussée reste dans la fourchette visée",
   push >= 20 && push <= 32, `${push} unités (cible 24 à 30)`);

await H(() => { window.HORIZON.game.inventory.cristal = 1; window.HORIZON.game.weight = 5; });
await wait(200);
const avant = await H(() => window.HORIZON.fogGap);
await H(() => window.HORIZON.usePulse());
await wait(150);
const apres = await H(() => window.HORIZON.fogGap);
ok("cristal: la poussée mesurée correspond à la configuration",
   Math.abs((apres - avant) - push) < 3, `+${(apres - avant).toFixed(1)} u pour ${push}`);

// ---------------------------------------------------------------------------
console.log("\n=== PRESSION TEMPORELLE (phase 4) ===");
const courbe = await H(async () => {
  const { fogSpeedAt } = await import("/fognomad.mjs");
  const pts = {};
  for (const t of [0, 40, 60, 120, 240, 360, 480, 600, 900, 1800, 3600]) {
    pts[t] = +fogSpeedAt(t).toFixed(3);
  }
  return pts;
});
console.log("   " + Object.entries(courbe)
  .map(([t, v]) => `${(t / 60).toFixed(0)}min:${v}`).join("  "));

const cfg = await H(() => window.HORIZON.config.fog);
const valeurs = Object.values(courbe);

ok("brume: la vitesse ne décroît jamais",
   valeurs.every((v, i) => i === 0 || v >= valeurs[i - 1]));
ok("brume: permissive au démarrage", courbe[0] === cfg.speed, `${courbe[0]} u/s`);
ok("brume: aucune montée pendant le délai de grâce",
   courbe[40] === courbe[0], `${courbe[0]} -> ${courbe[40]} à 40 s (délai ${cfg.pressureDelay} s)`);

// 0.5 : la pression ne plafonne plus.
//
// En 0.4 la courbe atteignait speed + speedGain et n'y touchait plus. Les runs
// réelles montraient ce que cela produit : une fois l'avance prise, elle ne se
// perdait plus (595 unités mesurées sur une run de 12 min). Un palier plat est
// un régime stable, et un régime stable est une partie qui ne se termine que
// par lassitude. La dérive lente de la seconde phase l'interdit — sans
// rubber-banding : elle ne dépend QUE du temps écoulé, jamais de l'avance du
// joueur (vérifié plus bas).
ok("brume: la pression continue de monter au-delà de la rampe",
   courbe[1800] > courbe[600] && courbe[3600] > courbe[1800],
   `10min ${courbe[600]} -> 30min ${courbe[1800]} -> 60min ${courbe[3600]}`);
// La dérive doit être lente au point d'être insensible dans l'instant : c'est
// ce qui la distingue d'une accélération punitive.
ok("brume: la dérive reste imperceptible à l'échelle de la minute",
   (courbe[1800] - courbe[900]) / 15 < 0.1,
   `${((courbe[1800] - courbe[900]) / 15).toFixed(4)} u/s par minute entre 15 et 30 min`);

const sprint = moteur.playerSpeed * moteur.runMultiplier;
ok("brume: la brume dépasse la marche à vide dès la rampe",
   courbe[600] > moteur.playerSpeed,
   `${courbe[600]} > ${moteur.playerSpeed} — sinon un joueur qui ne ramasse rien n'est jamais rattrapé`);
// La course reste une échappatoire sur toute run plausible. La plus longue run
// réelle mesurée fait 12 min 47 ; à 30 min la brume est encore sous le sprint.
ok("brume: le sprint reste une échappatoire sur une run plausible",
   courbe[1800] < sprint,
   `à 30 min : ${courbe[1800]} < ${sprint.toFixed(2)}`);
// speedMax est un garde-fou numérique, pas un plafond de conception : il faut
// deux heures de run pour l'atteindre.
ok("brume: le garde-fou numérique est hors de portée d'une run",
   cfg.speedMax > courbe[3600],
   `${cfg.speedMax} jamais atteint en une heure (${courbe[3600]})`);

// La pression ne doit dépendre QUE du temps. On le vérifie en déplaçant le
// joueur de façon extrême entre deux lectures au même instant de run.
const independance = await H(async () => {
  const { fogSpeedAt } = await import("/fognomad.mjs");
  const t = window.HORIZON.game.elapsed;
  const a = fogSpeedAt(t);
  window.HORIZON.teleport(5000, -5000);
  window.HORIZON.setFogGap(4);
  const b = fogSpeedAt(t);
  window.HORIZON.setFogGap(900);
  const c = fogSpeedAt(t);
  return { a, b, c };
});
ok("brume: la vitesse ne dépend pas de la position ni de la marge du joueur",
   independance.a === independance.b && independance.b === independance.c,
   `${independance.a} / ${independance.b} / ${independance.c} — pas de rubber-banding`);

// ---------------------------------------------------------------------------
console.log("\n=== BANDES DE MARGE (phase 5) ===");
await H(() => { window.HORIZON.restartRun(); window.HORIZON.teleport(0, 0); });
await wait(900);

// Le classement se teste sur la fonction elle-même : mesurer les compteurs en
// jeu mélangeait la marge visée avec les quelques centaines de millisecondes
// passées à la distance de départ juste après un redémarrage.
const classement = await H(async () => {
  const { bandFor } = await import("/fognomad.mjs");
  const cas = {};
  for (const gap of [5, 29, 30, 55, 79, 80, 130, 179, 180, 210, 249, 250, 400]) {
    cas[gap] = bandFor(gap);
  }
  return cas;
});
console.log("   " + Object.entries(classement).map(([g, b]) => `${g}:${b}`).join("  "));

const attendu = {
  5: "critique", 29: "critique", 30: "tension", 55: "tension", 79: "tension",
  80: "confortable", 130: "confortable", 179: "confortable",
  180: "avance", 210: "avance", 249: "avance",
  250: "exceptionnel", 400: "exceptionnel"
};
const ecarts = Object.entries(attendu).filter(([g, b]) => classement[g] !== b);

ok("bandes: les seuils correspondent aux sensations visées",
   ecarts.length === 0,
   ecarts.map(([g, b]) => `${g} -> ${classement[g]} au lieu de ${b}`).join(", ") || "13 cas");
ok("bandes: les cinq bandes sont instrumentées en jeu",
   (await H(() => Object.keys(window.HORIZON.bands).length)) === 5);

// ---------------------------------------------------------------------------
console.log("\n=== NARRATION ET REPÈRES (phases 14-15) ===");
const monde = await H(async () => {
  const petites = [];
  const reperes = [];

  for (let k = 0; k < 220; k++) {
    const x = (k % 20) * 64 - 640;
    const z = -Math.floor(k / 20) * 64;
    window.HORIZON.teleport(x, z);
    await new Promise((r) => setTimeout(r, 60));

    window.HORIZON.scene.traverse((o) => {
      if (!o.userData || o.userData.kind !== "structures") return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      const h = (bb.max.y - bb.min.y) * o.scale.y;
      const wp = new o.position.constructor();
      o.getWorldPosition(wp);
      const cle = `${Math.round(wp.x)},${Math.round(wp.z)}`;
      const liste = h > 8 ? reperes : petites;
      if (!liste.includes(cle)) liste.push(cle);
    });
  }
  return { petites: petites.length, reperes: reperes.length };
});
console.log(`   sur ~220 positions : ${monde.petites} petites structures, ${monde.reperes} repères lointains`);
ok("narration: des structures existent", monde.petites > 0, `${monde.petites}`);
ok("narration: elles restent rares", monde.petites < 260,
   `${monde.petites} sur ~1000 chunks traversés`);
ok("repères: des repères lointains existent", monde.reperes > 0, `${monde.reperes}`);
ok("repères: ils sont plus rares que les petites structures",
   monde.reperes < monde.petites, `${monde.reperes} < ${monde.petites}`);

// ---------------------------------------------------------------------------
console.log("\n=== RUN LONGUE (phase 23) ===");
await H(() => { window.HORIZON.setSeed(424242, 0, 0); });
await wait(900);
await H(() => window.HORIZON.restartRun());
await wait(700);

const depart = await H(() => ({
  geo: window.HORIZON.info.geometries,
  objets: window.HORIZON.objectsInScene,
  heap: window.HORIZON.heapMB.used,
  ...window.HORIZON.bookkeeping
}));

// 100 chunks, coordonnées négatives comprises, avec morts et redémarrages.
for (let cycle = 0; cycle < 4; cycle++) {
  for (let ch = 0; ch <= 100; ch += 10) {
    const signe = cycle % 2 === 0 ? -1 : 1;
    await H(([x, z]) => window.HORIZON.teleport(x, z),
            [signe * ch * 24, -ch * 32]);
    await wait(110);
  }
  await H(() => {
    const g = window.HORIZON.game;
    g.inventory.bois = 2; g.inventory.pierre = 1; g.inventory.cristal = 1;
    g.weight = 40;
  });
  await H(() => { window.HORIZON.lightFire(); window.HORIZON.usePulse(); window.HORIZON.drop("bois"); });
  await wait(250);
  await H(() => window.HORIZON.kill("run longue"));
  await wait(250);
  await H(() => window.HORIZON.restartRun());
  await wait(600);
}

const arrivee = await H(() => ({
  geo: window.HORIZON.info.geometries,
  objets: window.HORIZON.objectsInScene,
  heap: window.HORIZON.heapMB.used,
  chunks: window.HORIZON.chunks,
  ...window.HORIZON.bookkeeping
}));

console.log(`   départ  ${JSON.stringify(depart)}`);
console.log(`   arrivée ${JSON.stringify(arrivee)}`);

ok("run longue: chunks toujours bornés à 25", arrivee.chunks === 25, `${arrivee.chunks}`);
ok("run longue: géométries bornées", arrivee.geo <= depart.geo + 12,
   `${depart.geo} -> ${arrivee.geo}`);
ok("run longue: objets de scène bornés", arrivee.objets <= depart.objets * 1.6 + 20,
   `${depart.objets} -> ${arrivee.objets}`);
ok("run longue: aucun objet jeté résiduel", arrivee.jetesAuSol === 0, `${arrivee.jetesAuSol}`);
ok("run longue: aucun feu résiduel",
   arrivee.feuxActifs === 0 && arrivee.chunksAvecFeu === 0,
   `feux ${arrivee.feuxActifs}, registres ${arrivee.chunksAvecFeu}`);
ok("run longue: registre de ressources cohérent",
   arrivee.ressourcesListees === arrivee.ressourcesActives,
   `${arrivee.ressourcesListees} / ${arrivee.ressourcesActives}`);
ok("run longue: tas maîtrisé", arrivee.heap - depart.heap < 40,
   `${depart.heap} -> ${arrivee.heap} MB`);

const nonFinis = await H(() => window.HORIZON.scanNonFinite());
ok("run longue: aucune valeur non finie", nonFinis.length === 0,
   nonFinis.length ? JSON.stringify(nonFinis[0]) : "propre");

// ---------------------------------------------------------------------------
console.log("\n=== QUALITÉ (phase 22) ===");
const q = await H(async () => {
  // On repart explicitement de la qualité haute : une run longue a pu faire
  // baisser le niveau automatiquement, ce qui rendrait la comparaison vide.
  window.HORIZON.setQualite(0);
  await new Promise((r) => setTimeout(r, 250));
  const avant = { q: window.HORIZON.qualite, res: window.HORIZON.resourceCount };
  window.HORIZON.setQualite(2);
  await new Promise((r) => setTimeout(r, 300));
  const apres = { q: window.HORIZON.qualite, res: window.HORIZON.resourceCount,
                  push: window.HORIZON.config.crystal.pushDistance,
                  vitesse: window.HORIZON.config.fog.speed };
  window.HORIZON.setQualite(0);
  return { avant, apres };
});
ok("qualité: le niveau change", q.apres.q === "basse", `${q.avant.q} -> ${q.apres.q}`);
ok("qualité: les ressources ne dépendent pas de la qualité",
   q.apres.res === q.avant.res, `${q.avant.res} -> ${q.apres.res}`);
ok("qualité: les mécaniques ne dépendent pas de la qualité",
   q.apres.push === push && q.apres.vitesse === cfg.speed,
   `poussée ${q.apres.push}, vitesse ${q.apres.vitesse}`);

console.log("\n=== ERREURS ===");
ok("runtime: aucune erreur console", errors.length === 0,
   errors.length ? errors.slice(0, 3).join(" | ") : "propre");

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
for (const f of failures) console.log(`  ✗ ${f}`);

await browser.close();
process.exit(fail ? 1 : 0);
