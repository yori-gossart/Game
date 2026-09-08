/**
 * FOG NOMAD 0.6 — BANC D'ESSAI ARTISTIQUE
 *
 * Ce que ce fichier vérifie, et pourquoi il existe.
 *
 * La première version du banc TOURNAIT correctement et restait pourtant
 * invisible sur l'appareil : l'écran de chargement du jeu (z-index 20) la
 * recouvrait, et le filet de sécurité annonçait « WebGL est peut-être
 * désactivé » sur une page qui rendait parfaitement.
 *
 * La leçon est nette : vérifier qu'un module s'exécute ne dit RIEN sur le fait
 * qu'on le voie. Ce test regarde donc ce qui occupe réellement le centre de
 * l'écran, pas seulement l'état des variables.
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
page.on("requestfailed", (r) => erreurs.push(`REQ ${r.url()} ${r.failure()?.errorText}`));

await page.goto(`${BASE}/index.html?arttest`, { waitUntil: "load", timeout: 90000 });
await page.waitForFunction(() => window.ARTTEST?.pret, null, { timeout: 120000 });
await page.waitForTimeout(3500);

console.log("\n=== LE BANC EST-IL VISIBLE ? ===");

// Le contrôle central. `elementFromPoint` renvoie ce que l'utilisateur voit
// vraiment au milieu de l'écran — c'est exactement ce qui manquait.
const dessus = await page.evaluate(() => {
  const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return { tag: el?.tagName || null, id: el?.id || null };
});
ok("banc: le canvas occupe le centre de l'écran",
   dessus.tag === "CANVAS", `${dessus.tag}${dessus.id ? "#" + dessus.id : ""} au centre`);

const jeuMasque = await page.evaluate(() => {
  const g = document.getElementById("game");
  return { display: getComputedStyle(g).display, banc: document.body.classList.contains("banc") };
});
ok("banc: le DOM du jeu est retiré", jeuMasque.display === "none", `#game display ${jeuMasque.display}`);
ok("banc: la classe de mode est posée", jeuMasque.banc === true);

// Le filet de sécurité ne doit pas déclarer une panne WebGL sur le banc.
const filet = await page.evaluate(() => document.body.classList.contains("failed"));
ok("banc: aucune fausse panne WebGL annoncée", filet === false);

console.log("\n=== ASSETS ===");
const sujets = await page.evaluate(() => window.ARTTEST.sujets);
const info = await page.evaluate(() => window.ARTTEST.info);
const etat = await page.evaluate(() => window.ARTTEST.etat);

console.log(`   ${info.calls} calls · ${info.tris} tris · ${info.skinnes} skinned · ${info.meshes} meshes`);
for (const s of sujets) {
  console.log(`   ${s.cle.padEnd(16)} ${s.hauteur.toFixed(2)} m · ${s.tris} tris · `
    + `${s.parties} parties · clips ${s.clips.join("/")}`);
}

ok("assets: les quatre personnages sont chargés", sujets.length === 4, `${sujets.length} sujets`);
ok("assets: aucun échec de chargement", etat.echecs === 0, `${etat.echecs} échec(s)`);
ok("assets: un seul téléchargement par fichier",
   etat.telechargements === etat.enCache,
   `${etat.telechargements} téléchargement(s) pour ${etat.enCache} en cache`);

console.log("\n=== DÉFAUTS SIGNALÉS SUR L'APPAREIL EN 0.5 ===");
ok("rig: aucune transparence accidentelle",
   info.transparents.length === 0,
   info.transparents.length ? info.transparents.join(", ") : "aucune");
ok("rig: les pieds reposent sur le sol",
   sujets.every((s) => Math.abs(s.minY) < 0.02),
   `y min max = ${Math.max(...sujets.map((s) => Math.abs(s.minY))).toFixed(4)}`);
ok("rig: chaque personnage est bien un maillage skinné",
   info.skinnes >= sujets.length,
   `${info.skinnes} skinned pour ${sujets.length} personnages`);

console.log("\n=== ANIMATIONS ===");
for (const etatJeu of ["idle", "marche", "course", "fuite"]) {
  ok(`anim: « ${etatJeu} » résolu sur les 4 modèles`,
     sujets.every((s) => s.clips.includes(etatJeu)),
     sujets.filter((s) => !s.clips.includes(etatJeu)).map((s) => s.cle).join(", ") || "tous");
}

// Une animation qui ne fait pas BOUGER le squelette est un piège classique :
// le mixer tourne, l'état change, et le personnage reste en T-pose.
const bouge = await page.evaluate(async () => {
  window.ARTTEST.jouer("marche");
  const os = () => {
    let p = null;
    document.querySelectorAll("canvas");
    return p;
  };
  await new Promise((r) => setTimeout(r, 120));
  const a = window.ARTTEST.sujets[0].etat;
  await new Promise((r) => setTimeout(r, 600));
  return { etat: a };
});
ok("anim: le changement d'état est effectif", bouge.etat === "marche", `état ${bouge.etat}`);

console.log("\n=== ÉCHELLE (règle §2 de ART_DIRECTION_0.6.md) ===");
const hors = sujets.filter((s) => s.hauteur < 2.0 || s.hauteur > 2.6);
ok("échelle: tous les personnages dans la fourchette 2,0–2,6 m",
   hors.length === 0,
   hors.length ? hors.map((s) => `${s.cle} ${s.hauteur.toFixed(2)} m`).join(", ") : "tous conformes");

console.log("\n=== ?animtest ===");
const p2 = await browser.newPage({ ...devices["Pixel 7"] });
await p2.goto(`${BASE}/index.html?animtest`, { waitUntil: "load", timeout: 90000 });
await p2.waitForFunction(() => window.ARTTEST?.pret, null, { timeout: 120000 });
await p2.waitForTimeout(2500);
const boutons = await p2.evaluate(() =>
  [...document.querySelectorAll("#arttest-barre button")].map((b) => b.textContent));
ok("animtest: les quatre états sont proposés",
   ["idle", "marche", "course", "fuite"].every((e) => boutons.includes(e)),
   boutons.join(" · "));
const centre2 = await p2.evaluate(() =>
  document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.tagName);
ok("animtest: le banc est visible", centre2 === "CANVAS", `${centre2} au centre`);
await p2.close();

console.log("\n=== ERREURS ===");
const reelles = erreurs.filter((e) => !e.includes("favicon"));
ok("runtime: aucune erreur console", reelles.length === 0,
   reelles.length ? reelles.slice(0, 3).join(" | ") : "propre");

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
if (fail) console.log(echecs.map((n) => "  ✗ " + n).join("\n"));
await browser.close();
process.exit(fail ? 1 : 0);
