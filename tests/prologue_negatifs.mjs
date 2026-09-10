/**
 * FOG NOMAD 0.7.1 — TESTS NÉGATIFS DU PROLOGUE
 *
 * Ce fichier ne vérifie pas que le jeu marche. Il vérifie qu'il REFUSE.
 *
 * Il existe à cause d'une leçon précise et coûteuse. En 0.7, la vérification
 * « le condamné a bien disparu » était VERTE. Elle l'était parce que l'acteur
 * finissait par sortir du champ et qu'une règle « trop loin devant = mort »
 * mettait son drapeau à faux. La Brume ne l'avait jamais touché — elle ne le
 * pouvait pas, il courait plus vite qu'elle et s'en éloignait. Trois parcours
 * complets ont été nécessaires pour s'en apercevoir.
 *
 * Un test qui ne peut pas échouer ne prouve rien. Chacune des vérifications
 * ci-dessous met le jeu dans un état où une étape NE DOIT PAS se franchir, et
 * échoue si elle se franchit quand même.
 *
 * Toutes utilisent `?prologuetest`, parce que atteindre l'étape douze en jouant
 * coûte onze étapes — et qu'on ne peut pas tester un refus qu'on n'atteint
 * jamais.
 */
import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8123";
let pass = 0, fail = 0;
const echecs = [];

function ok(nom, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${nom}${detail ? "  — " + detail : ""}`); }
  else { fail++; echecs.push(nom); console.log(`FAIL  ${nom}${detail ? "  — " + detail : ""}`); }
}

const browser = await chromium.launch({ executablePath: CHROME, args: GL_ARGS });
const page = await browser.newPage({ ...devices["Pixel 7"] });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });

await page.goto(`${BASE}/index.html?prologuetest`, { waitUntil: "load", timeout: 90000 });
await page.waitForFunction(() => window.HORIZON?.prologue?.actif, null, { timeout: 120000 });
await page.waitForFunction(
  () => window.HORIZON.prologue.franchies.includes("BAG_VISIBLE"), null, { timeout: 90000 });

const H = (fn, arg) => page.evaluate(fn, arg);

/**
 * Ce fichier téléporte le joueur d'un bout à l'autre du prologue pour atteindre
 * des étapes lointaines. Entre deux contrôles, la Brume continue d'avancer et
 * finit par le rattraper — et une mort transforme tous les contrôles suivants
 * en échecs qui n'ont rien à voir avec leur sujet (l'écran de fin intercepte
 * même les clics).
 *
 * On la repousse donc explicitement avant chaque situation. Ce n'est pas une
 * commodité : ce banc mesure des REFUS, et la pression de la Brume n'en est pas
 * un. Le parcours réel, lui, est mesuré par prologue07.mjs, qui ne triche pas.
 */
async function repousserBrume(u = 500) {
  await H((d) => window.HORIZON.setFogGap(d), u);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== LE SAC NE SE PREND PAS À DISTANCE ===");

// Le bouton PRENDRE n'apparaît qu'à portée. Un joueur qui reste au point de
// réveil ne doit pas pouvoir franchir l'étape en attendant.
const loin = await H(() => {
  const s = window.HORIZON.prologue.cibleSac;
  // On s'éloigne franchement du sac, dans la direction de fuite.
  window.HORIZON.teleport(s.x + 40, s.z - 40);
  return { d: Math.hypot(window.HORIZON.pos.x - s.x, window.HORIZON.pos.z - s.z) };
});
await page.waitForTimeout(1500);
const sacLoin = await H(() => ({
  bouton: !document.getElementById("pro-action").hidden,
  pris: window.HORIZON.prologue.sacPris,
  etape: window.HORIZON.prologue.franchies.includes("BAG_PICKED_UP"),
  poids: window.HORIZON.game.weight,
}));
ok("sac: le bouton PRENDRE est absent hors de portée",
   sacLoin.bouton === false, `à ${loin.d.toFixed(0)} u`);
ok("sac: BAG_PICKED_UP ne se franchit pas tout seul", sacLoin.etape === false);
ok("sac: l'inventaire reste vide sans ramassage", sacLoin.poids === 0, `${sacLoin.poids} kg`);

// Et il se prend bien quand on est à portée : un refus qui refuse TOUJOURS
// n'est pas un refus, c'est une panne.
await H(() => {
  const s = window.HORIZON.prologue.cibleSac;
  window.HORIZON.teleport(s.x, s.z);
});
await page.waitForTimeout(1200);
const sacPres = await H(() => !document.getElementById("pro-action").hidden);
ok("sac: le bouton revient à portée — le refus n'est pas une panne", sacPres === true);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== UNE RESSOURCE NE SE RAMASSE PAS TOUTE SEULE ===");

await H(() => window.HORIZON.sauterPrologue("RUN_OBJECTIVE"));
await page.waitForTimeout(800);

await repousserBrume();
const avant = await H(() => {
  const r = window.HORIZON.resourceSample.find((x) => x.type === "bois");
  if (!r) return null;
  window.HORIZON.teleport(r.x, r.z);
  return { collected: window.HORIZON.game.collected, poids: window.HORIZON.game.weight };
});
// Trois secondes de montre, immobile SUR la ressource. En 0.7 elle était dans
// le sac depuis longtemps.
await page.waitForTimeout(3000);
await repousserBrume();
const apres = await H(() => ({
  collected: window.HORIZON.game.collected,
  poids: window.HORIZON.game.weight,
  candidat: window.HORIZON.game.candidateType,
  bouton: !document.getElementById("pick-up").hidden,
}));
ok("collecte: rester sur une ressource ne la ramasse pas",
   avant && apres.collected === avant.collected,
   `${avant ? avant.collected : "?"} → ${apres.collected}`);
ok("collecte: le poids ne bouge pas non plus",
   avant && apres.poids === avant.poids, `${apres.poids} kg`);
ok("collecte: une cible est bien ARMÉE — le refus n'est pas une panne",
   apres.candidat !== null && apres.bouton === true, apres.candidat || "aucune");

// Et elle entre dans le sac quand on décide.
// Clic dans la page plutôt que clic à l'écran : le panneau ?prologuetest, dont
// ce fichier a besoin pour atteindre les étapes lointaines, couvre le bas de
// l'écran et intercepte le pointeur. Ce que ce test doit prouver, c'est que la
// ressource n'entre PAS dans le sac sans décision — pas que le bouton tombe
// sous le pouce, ce dont s'occupent le banc principal et le plan de test.
await H(() => document.getElementById("pick-up").click());
await page.waitForFunction(
  () => window.HORIZON.game.collected >= 1, null, { timeout: 15000 }).catch(() => {});
const choisi = await H(() => ({ collected: window.HORIZON.game.collected,
                                poids: window.HORIZON.game.weight }));
ok("collecte: elle entre dans le sac quand le joueur le décide",
   choisi.collected > (avant ? avant.collected : 0), `${choisi.poids} kg`);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== LE PILIER NE S'ACTIVE PAS À DISTANCE ===");

// On pose la scène, puis on s'en éloigne franchement.
await H(() => window.HORIZON.sauterPrologue("MAIN_OBJECTIVE_REVEALED"));
await page.waitForTimeout(1200);

await repousserBrume();
await page.waitForFunction(
  () => !!window.HORIZON.scene.getObjectByName("prologue-pilier-ancien"),
  null, { timeout: 20000 }).catch(() => {});
const pilierLoin = await H(() => {
  const p = window.HORIZON.scene.getObjectByName("prologue-pilier-ancien");
  if (!p) return { pose: false };
  window.HORIZON.teleport(p.position.x + 70, p.position.z + 70);
  return { pose: true, d: 99 };
});
await page.waitForTimeout(1500);
const etatLoin = await H(() => ({
  bouton: !document.getElementById("pro-action").hidden,
  trouve: window.HORIZON.prologue.franchies.includes("ANCIENT_STRUCTURE_FOUND"),
  interaction: window.HORIZON.prologue.franchies.includes("CRYSTAL_INTERACTION"),
  reaction: window.HORIZON.prologue.franchies.includes("FOG_REACTION"),
}));
ok("pilier: la scène est bien posée", pilierLoin.pose === true);
ok("pilier: ANCIENT_STRUCTURE_FOUND ne se franchit pas à 70 unités",
   etatLoin.trouve === false);
ok("pilier: aucune interaction possible hors de portée",
   etatLoin.interaction === false && etatLoin.reaction === false);
ok("pilier: aucun bouton APPROCHER à 70 unités", etatLoin.bouton === false);

// À portée, l'étape se franchit — sinon on aurait cassé la scène.
await repousserBrume();
await H(() => {
  const p = window.HORIZON.scene.getObjectByName("prologue-pilier-ancien");
  window.HORIZON.teleport(p.position.x, p.position.z + 5);
});
await page.waitForTimeout(2000);
const etatPres = await H(() => ({
  trouve: window.HORIZON.prologue.franchies.includes("ANCIENT_STRUCTURE_FOUND"),
  bouton: !document.getElementById("pro-action").hidden,
}));
ok("pilier: à portée, la découverte se fait — le refus n'est pas une panne",
   etatPres.trouve === true && etatPres.bouton === true);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== LES TRACES NE SE DÉCOUVRENT PAS DE LOIN ===");

await H(() => window.HORIZON.relancerPrologue());
await page.waitForTimeout(1500);
await H(() => window.HORIZON.sauterPrologue("FIRST_FIRE"));
await page.waitForTimeout(1200);

await repousserBrume();

/* Les deux scènes lointaines sont posées À L'APPROCHE, à 220 unités devant, et
   pas au démarrage — c'est ce qui garantit qu'elles tombent sur l'axe où le
   joueur arrive réellement. Un saut d'étape à FIRST_FIRE ne les fait donc pas
   exister, et chercher `prologue-traces` juste après ne trouve rien.
   On approche d'abord, pour que la scène se pose comme en jeu. */
await H(() => {
  const p = window.HORIZON.prologue;
  window.HORIZON.teleport(p.ancrage.x, p.ancrage.z + p.scene.traces.z + 210);
});
await page.waitForFunction(
  () => !!window.HORIZON.scene.getObjectByName("prologue-traces"),
  null, { timeout: 20000 }).catch(() => {});

await repousserBrume();
const tracesLoin = await H(() => {
  const t = window.HORIZON.scene.getObjectByName("prologue-traces");
  if (!t) return { pose: false };
  window.HORIZON.teleport(t.position.x + 80, t.position.z);
  return { pose: true };
});
await page.waitForTimeout(1500);
const etatTraces = await H(() =>
  window.HORIZON.prologue.franchies.includes("CONVOY_TRACE_FOUND"));
ok("traces: la scène est bien posée", tracesLoin.pose === true);
ok("traces: CONVOY_TRACE_FOUND ne se franchit pas à 80 unités",
   etatTraces === false);

await repousserBrume();
await H(() => {
  const t = window.HORIZON.scene.getObjectByName("prologue-traces");
  window.HORIZON.teleport(t.position.x, t.position.z);
});
await page.waitForTimeout(1500);
ok("traces: dessus, la découverte se fait — le refus n'est pas une panne",
   await H(() => window.HORIZON.prologue.franchies.includes("CONVOY_TRACE_FOUND")));

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== LE CONDAMNÉ N'EST PAS « MORT » PARCE QU'IL EST LOIN ===");

// LA vérification qui manquait en 0.7. On rejoue l'ouverture et on refuse
// explicitement que « hors champ » compte comme « englouti ».
await H(() => window.HORIZON.relancerPrologue());
await page.waitForFunction(
  () => window.HORIZON.prologue.franchies.includes("BAG_VISIBLE"), null, { timeout: 60000 });

const suivi = [];
const debut = Date.now();
while (Date.now() - debut < 60000) {
  const e = await H(() => {
    const a = window.HORIZON.prologue.acteurs.find((x) => x.condamne);
    return a ? { z: a.z, vivant: a.vivant, englouti: a.englouti === true,
                 fogZ: +window.HORIZON.game.fogZ.toFixed(1),
                 revele: window.HORIZON.prologue.franchies.includes("FOG_REVEALED") }
             : null;
  });
  if (e) suivi.push(e);
  if (e && !e.vivant) break;
  // On avance le prologue en prenant le sac dès que possible.
  await H(() => {
    const b = document.getElementById("pro-action");
    if (b && !b.hidden) b.click();
    else if (!window.HORIZON.prologue.sacPris) {
      const s = window.HORIZON.prologue.cibleSac;
      window.HORIZON.teleport(s.x, s.z);
    }
  });
  await page.waitForTimeout(700);
}

const dernier = suivi[suivi.length - 1];
ok("condamné: il a bien été lâché", suivi.length > 0, `${suivi.length} relevé(s)`);
if (dernier) {
  // L'écart au front doit avoir DIMINUÉ : c'est la définition d'être rattrapé.
  //
  // Le sens compte, et la première version l'avait à l'envers. Le condamné fuit
  // DEVANT le mur, donc à un z PLUS PETIT que lui : l'écart utile est
  // `fogZ − z`, positif tant que le mur est derrière lui, et c'est celui-là qui
  // doit tomber jusqu'au seuil d'engloutissement (2,5 unités). Mesurer
  // `z − fogZ` donnait un nombre négatif qui montait, et faisait échouer un
  // rattrapage parfaitement réussi.
  const ecarts = suivi.map((e) => e.fogZ - e.z);
  const premier = ecarts[0];
  const final = ecarts[ecarts.length - 1];
  console.log(`   écart au front : ${premier.toFixed(1)} → ${final.toFixed(1)} u`);
  /* On vérifie que l'écart SE REFERME, et on laisse le seuil au moteur.
   *
   * Exiger que le dernier échantillon soit sous 2,5 revenait à mesurer la
   * cadence de sondage : à 700 ms d'intervalle et 1,2 u/s de fermeture, un
   * relevé couvre 0,8 unité, et le franchissement tombe forcément entre deux.
   * Mesuré : 3,6 → 2,7, puis englouti. Le drapeau `englouti` ci-dessous n'a
   * qu'un seul chemin — celui où le moteur a lui-même vu passer le seuil —
   * donc il porte déjà la preuve du franchissement. */
  ok("condamné: l'écart au front SE REFERME", final < premier,
     `${premier.toFixed(1)} → ${final.toFixed(1)} u, puis englouti (seuil moteur 2,5)`);
  ok("condamné: il est englouti, pas simplement disparu",
     dernier.englouti === true,
     dernier.englouti ? "englouti" : `vivant=${dernier.vivant}, englouti=${dernier.englouti}`);
  ok("condamné: c'est bien lui qui révèle la Brume", dernier.revele === true);
} else {
  ok("condamné: l'écart au front DIMINUE", false, "aucun acteur relevé");
  ok("condamné: il est englouti, pas simplement disparu", false, "aucun acteur relevé");
  ok("condamné: c'est bien lui qui révèle la Brume", false, "aucun acteur relevé");
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== LA RÉVÉLATION NE SE DÉCLENCHE PAS AVEC UNE BRUME LOINTAINE ===");

await H(() => window.HORIZON.relancerPrologue());
await page.waitForTimeout(1200);
const brumeLoin = await H(() => {
  window.HORIZON.setFogGap(600);
  return { gap: Math.round(window.HORIZON.fogGap) };
});
await page.waitForTimeout(1500);
ok("révélation: le prologue tient la Brume à sa distance de mise en scène",
   await H(() => window.HORIZON.fogGap < 120),
   `imposée à ${brumeLoin.gap} u, ramenée à ${Math.round(await H(() => window.HORIZON.fogGap))} u`);

console.log("\n=== ERREURS ===");
ok("runtime: le joueur n'est pas mort pendant les contrôles",
   (await H(() => window.HORIZON.game.dead)) === false,
   await H(() => window.HORIZON.game.deathCause || "vivant"));
ok("runtime: aucune erreur console", erreurs.length === 0,
   erreurs.slice(0, 3).join(" | ") || "aucune");

await browser.close();
console.log(`\n${pass} PASS · ${fail} FAIL`);
if (fail) { console.log("Échecs : " + echecs.join(" · ")); process.exit(1); }
