/**
 * FOG NOMAD — VERTICAL SLICE 0.4
 *
 * Ce fichier ne rejoue pas la 0.3 (voir tests/fog03.mjs). Il vérifie les trois
 * faiblesses corrigées en 0.4 et les deux actions ajoutées :
 *
 *   1. des ressources sur toute la durée d'une run, pas seulement au départ ;
 *   2. un objet jeté existe au sol, se ramasse, et meurt avec son chunk ;
 *   3. cristal et feu de répit, avec leur coût et leur effet ;
 *   4. rien ne s'accumule sur dix cycles mort / recommencer.
 *
 * Rendu logiciel (SwiftShader) : aucune conclusion de FPS ici, seulement des
 * comptages et des états, qui eux sont exacts.
 */
import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";

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

const wait = (ms) => page.waitForTimeout(ms);
const H = (fn, arg) => page.evaluate(fn, arg);

// ---------------------------------------------------------------------------
console.log("\n=== RESSOURCES SUR TOUTE LA RUN ===");
// Le bug signalé : après une longue exploration, plus rien n'apparaît. On
// téléporte le joueur de plus en plus loin et on compte ce qui est réellement
// en scène — pas ce que la configuration promet.

async function balayage(nom, pas) {
  const releves = [];
  await H(() => window.HORIZON.restartRun());
  await wait(600);

  for (let chunk = 0; chunk <= 100; chunk += 20) {
    const x = pas.x * chunk * 32;
    const z = pas.z * chunk * 32;
    await H(([x, z]) => window.HORIZON.teleport(x, z), [x, z]);
    await wait(1100);

    const r = await H(() => {
      const types = {};
      for (const s of window.HORIZON.resourceSample) types[s.type] = (types[s.type] || 0) + 1;
      return { total: window.HORIZON.resourceCount, types };
    });
    releves.push({ chunk, ...r });
  }

  console.log(`   ${nom}: ` + releves.map((r) => `c${r.chunk}=${r.total}`).join("  "));
  const mini = Math.min(...releves.map((r) => r.total));
  const typesVus = new Set(releves.flatMap((r) => Object.keys(r.types)));

  ok(`ressources: ${nom} — jamais de zone vide`, mini > 0, `minimum ${mini} ressources actives`);
  ok(`ressources: ${nom} — les trois types présents`, typesVus.size === 3,
     [...typesVus].join(", "));
  return releves;
}

await balayage("tout droit", { x: 0, z: -1 });
await balayage("diagonale", { x: 1, z: -1 });
await balayage("latéral pur", { x: -1, z: 0 });

// Le rejet de couloir était la cause du monde vide : il doit rester marginal.
await H(() => { window.HORIZON.resetSpawnStats(); window.HORIZON.teleport(2000, -2000); });
await wait(1400);
await H(() => window.HORIZON.teleport(2400, -2400));
await wait(1400);
const stats = await H(() => window.HORIZON.spawnStats);
const chunksVus = stats.chunksPeuples + stats.chunksVides;
console.log(`   chunks peuplés ${stats.chunksPeuples} · vides ${stats.chunksVides} · générées ${stats.generees}`);

// Le mode de défaillance de la 0.3 était total : loin de l'origine, la
// génération ne produisait PLUS RIEN — 510 chunks d'affilée vides, tous les
// tirages rejetés par le couloir. C'est cela que ce contrôle interdit. Le
// taux de chunks vides, lui, n'est pas un défaut : un monde dont chaque chunk
// contient une ressource serait un tapis, pas une exploration.
ok("ressources: la génération fonctionne encore loin de l'origine",
   stats.generees > 0 && stats.chunksPeuples > 0,
   `${stats.generees} générées sur ${chunksVus} chunks`);
ok("ressources: densité loin de l'origine comparable au départ",
   stats.generees / Math.max(1, chunksVus) > 0.6,
   `${(stats.generees / Math.max(1, chunksVus)).toFixed(2)} ressource par chunk`);

// ---------------------------------------------------------------------------
console.log("\n=== OBJETS JETÉS ===");
await H(() => { window.HORIZON.restartRun(); window.HORIZON.teleport(0, 0); });
await wait(1200);

// On se donne de quoi jeter, sans passer par une collecte : le sujet du test
// est la matérialisation au sol, pas le ramassage.
await H(() => {
  const g = window.HORIZON.game;
  g.inventory.bois = 3;
  g.weight = 21;
});
await wait(200);

const avantJet = await H(() => window.HORIZON.bookkeeping);
await H(() => window.HORIZON.drop("bois"));
await wait(300);
const apresJet = await H(() => window.HORIZON.bookkeeping);

ok("jeter: l'objet existe au sol", apresJet.jetesAuSol === avantJet.jetesAuSol + 1,
   `${avantJet.jetesAuSol} -> ${apresJet.jetesAuSol}`);
ok("jeter: il compte comme ressource active",
   apresJet.ressourcesActives === avantJet.ressourcesActives + 1,
   `${avantJet.ressourcesActives} -> ${apresJet.ressourcesActives}`);
ok("jeter: le sac s'allège", (await H(() => window.HORIZON.game.weight)) === 14);

// Le ramassage est réarmé après un délai : sinon l'objet reviendrait aussitôt
// dans le sac, ce qui rendrait le geste impossible.
const juste = await H(() => window.HORIZON.game.weight);
ok("jeter: pas de reprise immédiate", juste === 14, `poids ${juste}`);

// On s'éloigne au-delà du rayon de collecte, puis on revient le chercher.
const cible = await H(() => {
  const m = window.HORIZON.resourceSample.find((r) => r.jete);
  return m ? { x: m.x, z: m.z } : null;
});
ok("jeter: position au sol connue", cible !== null, cible ? `(${cible.x.toFixed(1)}, ${cible.z.toFixed(1)})` : "");

await H(() => window.HORIZON.teleport(0, -40));
await wait(900);
const loin = await H(() => window.HORIZON.bookkeeping);
ok("jeter: l'objet survit à l'éloignement (chunk encore actif)",
   loin.jetesAuSol === 1, `${loin.jetesAuSol} au sol`);

// La collecte dure 0,6 s de temps de jeu et démarre à portée : on attend
// qu'elle aboutisse, plutôt que de parier sur une durée réelle fixe.
await H((c) => window.HORIZON.teleport(c.x, c.z + 1.2), cible);
const repris = await H(async () => {
  const limite = performance.now() + 8000;
  while (window.HORIZON.bookkeeping.jetesAuSol > 0 && performance.now() < limite) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return { ...window.HORIZON.bookkeeping,
           poids: window.HORIZON.game.weight,
           sac: window.HORIZON.game.inventory.bois };
});
ok("jeter: l'objet se récupère", repris.jetesAuSol === 0 && repris.poids === 21,
   `au sol ${repris.jetesAuSol}, poids ${repris.poids}, bois ${repris.sac}`);

// Un objet jeté n'existe que tant que son chunk vit : c'est la règle qui évite
// une mémoire de monde infinie. On s'éloigne assez pour décharger le chunk.
await H(() => { window.HORIZON.game.inventory.bois = 1; window.HORIZON.game.weight = 7; });
await H(() => window.HORIZON.drop("bois"));
await wait(400);
const posé = await H(() => window.HORIZON.bookkeeping);
await H(() => window.HORIZON.teleport(0, -600));
await wait(1600);
const oublié = await H(() => window.HORIZON.bookkeeping);
ok("jeter: l'objet meurt avec son chunk",
   posé.jetesAuSol === 1 && oublié.jetesAuSol === 0,
   `${posé.jetesAuSol} -> ${oublié.jetesAuSol}`);
ok("jeter: aucun registre orphelin après déchargement",
   oublié.ressourcesListees === oublié.ressourcesActives,
   `listées ${oublié.ressourcesListees} / actives ${oublié.ressourcesActives}`);

// ---------------------------------------------------------------------------
console.log("\n=== CRISTAL ===");
await H(() => { window.HORIZON.restartRun(); window.HORIZON.teleport(0, 0); });
await wait(1000);

const sansCristal = await H(() => window.HORIZON.canPulse);
ok("cristal: indisponible sans cristal", sansCristal === false);

await H(() => { window.HORIZON.game.inventory.cristal = 2; window.HORIZON.game.weight = 10; });
await wait(150);
ok("cristal: disponible avec un cristal", (await H(() => window.HORIZON.canPulse)) === true);

const avantPulse = await H(() => ({ gap: window.HORIZON.fogGap,
  cristaux: window.HORIZON.game.inventory.cristal, pulses: window.HORIZON.game.pulses }));
await H(() => window.HORIZON.usePulse());
await wait(120);
const apresPulse = await H(() => ({ gap: window.HORIZON.fogGap,
  cristaux: window.HORIZON.game.inventory.cristal, pulses: window.HORIZON.game.pulses }));

const push = await H(() => window.HORIZON.config.crystal.pushDistance);
const gagne = apresPulse.gap - avantPulse.gap;
ok("cristal: la brume recule de la distance configurée",
   Math.abs(gagne - push) < 3, `+${gagne.toFixed(1)} u pour ${push} attendus`);
ok("cristal: un cristal est consommé",
   apresPulse.cristaux === avantPulse.cristaux - 1, `${avantPulse.cristaux} -> ${apresPulse.cristaux}`);
ok("cristal: l'usage est compté", apresPulse.pulses === avantPulse.pulses + 1);

// ---------------------------------------------------------------------------
console.log("\n=== FEU DE RÉPIT ===");
await H(() => { window.HORIZON.restartRun(); window.HORIZON.teleport(0, 0); });
await wait(1000);

ok("feu: impossible sans matière", (await H(() => window.HORIZON.canLightFire)) === false);

const cout = await H(() => window.HORIZON.config.fire.cost);
await H((c) => {
  const g = window.HORIZON.game;
  for (const [k, n] of Object.entries(c)) g.inventory[k] = n;
  g.weight = 27;
  g.stamina = 20;
}, cout);
await wait(150);
ok("feu: possible avec la matière exacte", (await H(() => window.HORIZON.canLightFire)) === true);

const avantFeu = await H(() => ({ gap: window.HORIZON.fogGap, feux: window.HORIZON.fireCount,
  inv: { ...window.HORIZON.game.inventory }, souffle: window.HORIZON.game.stamina }));
await H(() => window.HORIZON.lightFire());
await wait(400);
const pendant = await H(() => ({ feux: window.HORIZON.fireCount,
  inv: { ...window.HORIZON.game.inventory }, souffle: window.HORIZON.game.stamina }));

ok("feu: un feu est allumé", pendant.feux === 1);
ok("feu: la matière est consommée",
   Object.entries(cout).every(([k]) => (pendant.inv[k] || 0) === 0),
   JSON.stringify(pendant.inv));

// La brume doit ralentir fortement sans jamais s'arrêter : c'est un répit, pas
// une pause. On mesure son avance réelle sur 2,5 s, feu allumé.
const gapA = await H(() => window.HORIZON.fogGap);
await wait(2500);
const gapB = await H(() => window.HORIZON.fogGap);
const avanceAbritee = gapA - gapB;

const nominal = await H(() => window.HORIZON.config.fog.speed * 2.5);
ok("feu: la brume ralentit fortement", avanceAbritee < nominal * 0.35,
   `${avanceAbritee.toFixed(1)} u au lieu de ${nominal.toFixed(1)} u`);
ok("feu: la brume ne s'arrête jamais", avanceAbritee > 0.05,
   `${avanceAbritee.toFixed(2)} u en 2,5 s`);

// Le bonus est un DÉBIT (48 par seconde à proximité), pas un cadeau ponctuel :
// on compare donc la récupération près du feu à la récupération normale, sur
// la même durée. Un seuil absolu ne mesurerait que la cadence de la machine.
const gainAuFeu = await H(async () => {
  window.HORIZON.game.stamina = 10;
  const t0 = window.HORIZON.game.elapsed;
  await new Promise((r) => setTimeout(r, 900));
  return { gain: window.HORIZON.game.stamina - 10,
           secondes: window.HORIZON.game.elapsed - t0 };
});
// Juste au-delà du rayon d'abri (7 u), sans quitter le chunk : le feu doit
// rester allumé, seul son effet doit cesser.
await H(() => { window.HORIZON.teleport(0, -22); });
await wait(1400);
const gainSeul = await H(async () => {
  window.HORIZON.game.stamina = 10;
  const t0 = window.HORIZON.game.elapsed;
  await new Promise((r) => setTimeout(r, 900));
  return { gain: window.HORIZON.game.stamina - 10,
           secondes: window.HORIZON.game.elapsed - t0 };
});
const debitFeu = gainAuFeu.gain / gainAuFeu.secondes;
const debitSeul = gainSeul.gain / gainSeul.secondes;
ok("feu: le souffle remonte nettement plus vite qu'au repos",
   debitFeu > debitSeul * 1.8,
   `${debitFeu.toFixed(0)} / s près du feu contre ${debitSeul.toFixed(0)} / s au repos`);

const duree = await H(() => window.HORIZON.config.fire.duration);
ok("feu: durée bornée dans la configuration", duree >= 10 && duree <= 30, `${duree} s`);

// Le feu meurt avec son chunk, comme les ressources. On revient d'abord près
// de lui, pour que son déchargement soit bien dû à l'éloignement suivant.
await wait(600);
const avantDechargement = await H(() => window.HORIZON.bookkeeping);
ok("feu: toujours présent tant que son chunk vit",
   avantDechargement.feuxActifs === 1, `${avantDechargement.feuxActifs} feu`);
await H(() => window.HORIZON.teleport(0, -600));
await wait(1500);
const apresLoin = await H(() => window.HORIZON.bookkeeping);
ok("feu: éteint avec son chunk",
   apresLoin.feuxActifs === 0 && apresLoin.chunksAvecFeu === 0,
   `feux ${apresLoin.feuxActifs}, chunks ${apresLoin.chunksAvecFeu}`);

// ---------------------------------------------------------------------------
console.log("\n=== POIDS ET SAC ===");
await H(() => { window.HORIZON.restartRun(); window.HORIZON.teleport(0, 0); });
await wait(900);

const courbe = [];
for (const w of [0, 25, 50, 75, 100]) {
  await H((w) => { window.HORIZON.game.weight = w; }, w);
  await wait(220);
  courbe.push(await H(() => ({ f: window.HORIZON.speedFactor, t: window.HORIZON.bagTier })));
}
console.log("   " + courbe.map((c, i) => `${[0,25,50,75,100][i]}→${c.f.toFixed(3)}/T${c.t}`).join("  "));

let monotone = true;
for (let i = 1; i < courbe.length; i++) if (courbe[i].f >= courbe[i - 1].f) monotone = false;
ok("poids: la vitesse décroît strictement", monotone);
ok("poids: encore jouable à sac plein", courbe[4].f > 0.4, `facteur ${courbe[4].f.toFixed(3)}`);

const paliers = [];
for (const w of [0, 25, 50, 78, 98]) {
  await H((w) => { window.HORIZON.game.weight = w; }, w);
  await wait(220);
  paliers.push(await H(() => window.HORIZON.bagTier));
}
ok("sac: cinq paliers distincts et croissants",
   paliers.join(",") === "0,1,2,3,4", paliers.join(","));

// Une seule formule : le facteur de vitesse doit se recalculer depuis CONFIG.
const conforme = await H(() => {
  const c = window.HORIZON.config.weight;
  const r = window.HORIZON.game.weight / c.max;
  const attendu = 1 - (1 - c.speedAtFull) * Math.pow(r, c.curve);
  return Math.abs(attendu - window.HORIZON.speedFactor) < 0.001;
});
ok("poids: le facteur suit exactement la formule de CONFIG", conforme);

// ---------------------------------------------------------------------------
console.log("\n=== DIX CYCLES MORT / RECOMMENCER ===");
await H(() => { window.HORIZON.restartRun(); window.HORIZON.teleport(0, 0); });
await wait(1200);

const depart = await H(() => ({ ...window.HORIZON.bookkeeping,
  geo: window.HORIZON.info.geometries, objets: window.HORIZON.objectsInScene,
  heap: window.HORIZON.heapMB.used }));

for (let i = 0; i < 10; i++) {
  await H(() => {
    const g = window.HORIZON.game;
    g.inventory.bois = 2; g.inventory.pierre = 1; g.inventory.cristal = 1;
    g.weight = 40;
  });
  await H(() => { window.HORIZON.lightFire(); window.HORIZON.usePulse(); });
  await H(() => window.HORIZON.drop("bois"));
  await wait(250);
  await H(() => window.HORIZON.kill("cycle de test"));
  await wait(250);
  await H(() => window.HORIZON.restartRun());
  await wait(700);
}

const arrivee = await H(() => ({ ...window.HORIZON.bookkeeping,
  geo: window.HORIZON.info.geometries, objets: window.HORIZON.objectsInScene,
  heap: window.HORIZON.heapMB.used }));

console.log(`   départ  ${JSON.stringify(depart)}`);
console.log(`   arrivée ${JSON.stringify(arrivee)}`);

ok("cycles: aucun objet jeté résiduel", arrivee.jetesAuSol === 0, `${arrivee.jetesAuSol}`);
ok("cycles: aucun feu résiduel",
   arrivee.feuxActifs === 0 && arrivee.chunksAvecFeu === 0,
   `feux ${arrivee.feuxActifs}, registres ${arrivee.chunksAvecFeu}`);
ok("cycles: registre de ressources cohérent",
   arrivee.ressourcesListees === arrivee.ressourcesActives,
   `listées ${arrivee.ressourcesListees} / actives ${arrivee.ressourcesActives}`);
ok("cycles: registre par chunk borné", arrivee.chunksAvecRessources <= 25,
   `${arrivee.chunksAvecRessources} chunks`);
ok("cycles: géométries bornées", arrivee.geo <= depart.geo + 6,
   `${depart.geo} -> ${arrivee.geo}`);
ok("cycles: objets de scène bornés", arrivee.objets <= depart.objets + 30,
   `${depart.objets} -> ${arrivee.objets}`);
ok("cycles: tas maîtrisé", arrivee.heap - depart.heap < 12,
   `${depart.heap} -> ${arrivee.heap} MB`);

const runs = await H(() => window.HORIZON.runs.length);
const plafond = await H(() => window.HORIZON.config.maxStoredRuns);
ok("cycles: télémétrie locale plafonnée", runs <= plafond, `${runs} / ${plafond}`);

// ---------------------------------------------------------------------------
console.log("\n=== INTÉGRITÉ ===");
const nonFinis = await H(() => window.HORIZON.scanNonFinite());
ok("intégrité: aucune valeur non finie en scène", nonFinis.length === 0,
   nonFinis.length ? JSON.stringify(nonFinis[0]) : "propre");
ok("intégrité: aucune texture chargée", (await H(() => window.HORIZON.info.textures)) === 0);
ok("runtime: aucune erreur console", errors.length === 0,
   errors.length ? errors.slice(0, 2).join(" | ") : "propre");

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
for (const f of failures) console.log(`  ✗ ${f}`);

await browser.close();
process.exit(fail ? 1 : 0);
