/**
 * FOG NOMAD 0.7.2 — TENUE EN MÉMOIRE (§60)
 *
 * Le §60 demande de vérifier trois choses : le prologue complet, quinze
 * minutes de jeu, et dix redémarrages. Ce fichier ne les JOUE pas — jouer
 * quinze minutes sous SwiftShader coûte quarante minutes d'horloge, et ce
 * n'est pas le temps qui fuit, c'est la construction et la destruction des
 * chunks. Il provoque donc les mêmes événements, beaucoup plus vite :
 *
 *   — une longue traversée : on téléporte le joueur de proche en proche sur
 *     plusieurs kilomètres, ce qui construit et détruit des centaines de
 *     chunks avec tout ce qu'ils portent (terrain, décor fusionné, couvert
 *     bas, ressources, vie) ;
 *   — le prologue en entier, monté puis démonté ;
 *   — dix redémarrages de run.
 *
 * Ce qu'on surveille : les GÉOMÉTRIES et les TEXTURES du renderer, et le
 * nombre d'objets dans la scène. Le tas JavaScript est rapporté quand le
 * navigateur le donne, mais il n'est pas une assertion : il monte et descend
 * au gré du ramasse-miettes, et en faire un critère produirait un test
 * intermittent — ce projet en a déjà eu cinq.
 *
 * Le vrai signal de fuite est une géométrie qui ne redescend jamais.
 */
import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8123";
const GRAINE = Number(process.env.GRAINE || 20260912);
let pass = 0, fail = 0;
const echecs = [];

function ok(nom, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${nom}${detail ? "  — " + detail : ""}`); }
  else { fail++; echecs.push(nom); console.log(`FAIL  ${nom}${detail ? "  — " + detail : ""}`); }
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [...GL_ARGS, "--js-flags=--expose-gc"],
});
const page = await browser.newPage({ ...devices["Pixel 7"] });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });

await page.goto(`${BASE}/index.html?seed=${GRAINE}&qualite=haute`,
                { waitUntil: "load", timeout: 90000 });
await page.waitForFunction(() => window.HORIZON?.pos, null, { timeout: 120000 });
await page.waitForTimeout(3000);

const releve = async () => page.evaluate(() => {
  const i = window.HORIZON.info;
  let objets = 0;
  window.HORIZON.scene.traverse(() => objets++);
  return {
    geo: i.geometries,
    tex: i.textures,
    objets,
    tas: performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
});

const ligne = (nom, r) =>
  console.log(`   ${nom.padEnd(26)} ${String(r.geo).padStart(4)} géo  `
    + `${String(r.tex).padStart(3)} tex  ${String(r.objets).padStart(4)} objets  `
    + `${r.tas === null ? "  —" : String(r.tas).padStart(4) + " Mo"}`);

console.log("\n=== §60 RELEVÉS ===");
const depart = await releve();
ligne("départ", depart);

/* ── 1. LE PROLOGUE COMPLET, MONTÉ PUIS DÉMONTÉ ────────────────────────── */
{
  await page.evaluate(() => window.HORIZON.sauterPrologue?.("FOG_REACTION"));
  await page.waitForTimeout(1200);
  const pendant = await releve();
  ligne("prologue monté", pendant);

  await page.evaluate(() => {
    const p = window.HORIZON.prologue;
    window.HORIZON.teleport(p.ancrage.x, p.ancrage.z + p.scene.fin.z - 60);
  });
  await page.waitForTimeout(2500);
  const apres = await releve();
  ligne("prologue démonté", apres);

  ok("prologue: la mise en scène est bien retirée de la scène",
     apres.objets <= pendant.objets,
     `${pendant.objets} → ${apres.objets} objets`);
}

/* ── 2. UNE LONGUE TRAVERSÉE ───────────────────────────────────────────── */
//
// Trois kilomètres par sauts de quatre-vingts unités : à portée 96 u, chaque
// saut renouvelle presque tout le voisinage. C'est le pire cas du streaming,
// et c'est là qu'une géométrie oubliée se voit.
{
  const suivi = [];
  for (let i = 1; i <= 38; i++) {
    await page.evaluate((n) => window.HORIZON.teleport(1.5 + (n % 5) * 12, -n * 80), i);
    await page.waitForTimeout(260);
    if (i % 8 === 0) { const r = await releve(); suivi.push(r); ligne(`traversée ${i * 80} u`, r); }
  }
  const fin = await releve();
  ligne("fin de traversée", fin);

  // Le critère : la géométrie ne DÉRIVE pas. Le voisinage a une taille
  // bornée ; si le compte monte à chaque relevé sans jamais redescendre,
  // quelque chose n'est pas libéré avec son chunk.
  const monteToujours = suivi.every((r, k) => k === 0 || r.geo > suivi[k - 1].geo);
  ok("traversée: le compte de géométries ne dérive pas",
     !monteToujours || fin.geo < suivi[0].geo * 1.6,
     `${suivi.map((r) => r.geo).join(" → ")} → ${fin.geo}`);
  ok("traversée: les textures restent celles des atlas",
     fin.tex <= depart.tex + 2, `${depart.tex} → ${fin.tex}`);
  ok("traversée: le nombre d'objets reste borné",
     fin.objets < depart.objets * 2.5 + 60,
     `${depart.objets} → ${fin.objets}`);
}

/* ── 3. DIX REDÉMARRAGES ───────────────────────────────────────────────── */
{
  const avant = await releve();
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.HORIZON.restartRun());
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
  const apres = await releve();
  ligne("après 10 redémarrages", apres);

  ok("redémarrages: la géométrie revient à son ordre de grandeur",
     apres.geo < avant.geo * 1.5 + 40, `${avant.geo} → ${apres.geo}`);
  ok("redémarrages: aucune texture n'est recréée à chaque fois",
     apres.tex <= avant.tex + 2, `${avant.tex} → ${apres.tex}`);
  ok("redémarrages: la scène ne grossit pas d'une run à l'autre",
     apres.objets < avant.objets * 1.6 + 40, `${avant.objets} → ${apres.objets}`);
}

console.log("\n=== ERREURS ===");
ok("runtime: aucune erreur console sur tout le parcours", erreurs.length === 0,
   erreurs.slice(0, 3).join(" | ") || "aucune");

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
if (fail) for (const e of echecs) console.log(`  ✗ ${e}`);
await browser.close();
process.exit(fail ? 1 : 0);
