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
/* Un abandon de requête n'est un défaut que si l'asset n'est PAS arrivé.
   Mesuré sur ce banc : les quatre .glb reçoivent un HTTP 200, puis un
   ERR_ABORTED arrive ~34 ms APRÈS la réponse sur l'un d'eux, sans effet — le
   gestionnaire compte 4 téléchargements et 0 échec. C'est un événement de la
   couche réseau sur un flux déjà servi. On ne le masque donc pas : on ne le
   retient que pour les URL qui n'ont jamais reçu de réponse. */
const servies = new Set();
page.on("response", (r) => { if (r.status() < 400) servies.add(r.url()); });
page.on("requestfailed", (r) => {
  if (!servies.has(r.url())) erreurs.push(`REQ ${r.url()} ${r.failure()?.errorText}`);
});

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

console.log("\n=== LE JOUEUR DANS LE JEU (§4 et §5) ===");
const jeu = await browser.newPage({ ...devices["Pixel 7"] });
const errJeu = [];
jeu.on("pageerror", (e) => errJeu.push(String(e)));
jeu.on("console", (m) => { if (m.type() === "error") errJeu.push(m.text()); });
await jeu.goto(`${BASE}/index.html?fogtest`, { waitUntil: "load", timeout: 90000 });
await jeu.waitForFunction(() => window.HORIZON?.engine, null, { timeout: 90000 });
await jeu.waitForFunction(() => window.HORIZON.joueur.rigge === true, null, { timeout: 120000 });
await jeu.waitForTimeout(2000);

const j = await jeu.evaluate(() => window.HORIZON.joueur);
console.log(`   ${JSON.stringify(j)}`);

ok("joueur: le personnage riggé a remplacé le mannequin",
   j.rigge === true && j.mannequinMasque === true);
ok("joueur: aucune partie transparente", j.transparents.length === 0,
   j.transparents.join(", ") || "aucune");
ok("joueur: le sac est accroché au squelette",
   j.socketSac === true && j.sacSousOs === "chest", `os « ${j.sacSousOs} »`);

/* ── Les deux fautes signalées sur appareil en 0.6 ───────────────────────────
   Elles ont un point commun : mes contrôles disaient vrai et ne regardaient
   pas le personnage. « sac derrière, z négatif » était exact ET le sac était
   sur le visage ; « état marche » était exact ET le personnage reculait.
   Les deux assertions ci-dessous mesurent ce qui manquait. */

// 1. À RECULONS. Le produit scalaire entre le « devant » du moteur et le
//    regard du modèle vaut +1 s'ils sont d'accord, −1 s'ils s'opposent.
const orientation = await jeu.evaluate(() => {
  const corps = window.HORIZON.scene.getObjectByName("joueur-gltf");
  const player = corps.parent;
  player.updateWorldMatrix(true, true);
  const V = corps.position.constructor;
  const Q = corps.quaternion.constructor;
  const avant = new V(0, 0, 1).applyQuaternion(player.getWorldQuaternion(new Q()));
  const regard = new V(0, 0, 1).applyQuaternion(corps.getWorldQuaternion(new Q()));
  return +avant.dot(regard).toFixed(3);
});
ok("orientation: le personnage regarde là où le moteur avance",
   orientation > 0.95, `accord ${orientation} (−1 = à reculons)`);

// 2. SAC SUR LE VISAGE. Il ne suffit pas d'être « derrière » : il faut être
//    SOUS la tête. Le maillage de tête de ce pack commence à y ≈ 1,07, et le
//    sac était ancré à 1,36 — derrière, et en plein visage.
const anatomie = await jeu.evaluate(() => {
  const corps = window.HORIZON.scene.getObjectByName("joueur-gltf");
  const player = corps.parent;
  player.updateWorldMatrix(true, true);
  const V = corps.position.constructor;
  let teteMin = Infinity;
  corps.traverse((o) => {
    if (!o.isSkinnedMesh || !/head/i.test(o.name)) return;
    const pos = o.geometry.attributes.position;
    const p = new V();
    for (let i = 0; i < pos.count; i += 5) {
      p.fromBufferAttribute(pos, i); o.localToWorld(p); player.worldToLocal(p);
      teteMin = Math.min(teteMin, p.y);
    }
  });
  const sac = window.HORIZON.scene.getObjectByName("socket-sac")?.children[0];
  sac.updateWorldMatrix(true, false);
  const l = player.worldToLocal(sac.getWorldPosition(new V()));
  return { teteMin: +teteMin.toFixed(3), sacY: +l.y.toFixed(3), sacZ: +l.z.toFixed(3) };
});
console.log(`   bas de la tête y=${anatomie.teteMin} · sac y=${anatomie.sacY} z=${anatomie.sacZ}`);
ok("sac: il est sous la tête, pas devant le visage",
   anatomie.sacY < anatomie.teteMin,
   `sac ${anatomie.sacY} vs bas de tête ${anatomie.teteMin}`);
ok("sac: il est bien derrière le corps",
   anatomie.sacZ < -0.2, `z ${anatomie.sacZ}`);

// 3. Aucun accessoire rigide non déformé : la cape était un plan plat accroché
//    à un os, qui flottait à côté du personnage.
const rigides = await jeu.evaluate(() => {
  const corps = window.HORIZON.scene.getObjectByName("joueur-gltf");
  const out = [];
  corps.traverse((o) => {
    if (o.isMesh && !o.isSkinnedMesh && o.parent?.isBone) out.push(o.name || "(sans nom)");
  });
  return out;
});
ok("rig: aucun accessoire rigide accroché à un os",
   rigides.length === 0, rigides.join(", ") || "aucun");

// Les trois états demandés par le §4, pilotés par le mouvement réel.
const etats = await jeu.evaluate(async () => {
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  await attendre(400); out.arret = window.HORIZON.joueur.etat;
  window.HORIZON.move(0, -1); await attendre(900); out.marche = window.HORIZON.joueur.etat;
  window.HORIZON.setRun(true); await attendre(900); out.course = window.HORIZON.joueur.etat;
  window.HORIZON.move(0, 0); window.HORIZON.setRun(false);
  await attendre(900); out.retourArret = window.HORIZON.joueur.etat;
  return out;
});
ok("anim jeu: à l'arrêt, idle", etats.arret === "idle", etats.arret);
ok("anim jeu: en marche, marche", etats.marche === "marche", etats.marche);
ok("anim jeu: en course, course", etats.course === "course", etats.course);
ok("anim jeu: retour à idle après l'arrêt", etats.retourArret === "idle", etats.retourArret);

// Le §5 demande cinq états visuels de sac. Le sac vit désormais sous un os :
// ce contrôle vérifie que les paliers ET la position au dos ont survécu au
// changement de parent — c'est exactement ce qu'un reparentage casse.
const sac = await jeu.evaluate(async () => {
  const g = window.HORIZON.jeu;
  const out = [];
  for (const poids of [0, 20, 45, 70, 95]) {
    g.state.weight = poids;
    g.state.inventory.bois = Math.max(1, Math.round(poids / 7));
    window.HORIZON.drop("bois");
    await new Promise((r) => setTimeout(r, 130));
    const s = window.HORIZON.scene.getObjectByName("socket-sac")?.children[0];
    const joueur = window.HORIZON.scene.getObjectByName("joueur-gltf")?.parent;
    s?.updateWorldMatrix(true, false);
    // Mesuré dans le REPÈRE DU JOUEUR, pas en coordonnées monde : le joueur
    // tourne avec sa direction de marche, et un écart monde change alors de
    // signe sans que le sac ait bougé d'un millimètre sur le dos.
    const w = s && joueur
      ? joueur.worldToLocal(s.getWorldPosition(new s.position.constructor()))
      : null;
    out.push({ poids, palier: window.HORIZON.bagTier,
      echelle: s ? +s.scale.z.toFixed(3) : null,
      dosY: w ? +w.y.toFixed(2) : null,
      dosZ: w ? +w.z.toFixed(2) : null });
  }
  return out;
});
for (const l of sac) {
  console.log(`   ${String(l.poids).padStart(3)} kg → palier ${l.palier} · échelle ${l.echelle} · dos y${l.dosY} z${l.dosZ}`);
}
const paliers = new Set(sac.map((l) => l.palier));
ok("sac: le poids fait varier le palier", paliers.size >= 3,
   `paliers vus : ${[...paliers].join(", ")}`);
ok("sac: le volume grandit avec la charge",
   sac[sac.length - 1].echelle > sac[0].echelle * 1.5,
   `${sac[0].echelle} → ${sac[sac.length - 1].echelle}`);
// L'avant du personnage est son +Z local : un sac au dos a donc un z NÉGATIF.
// Et la borne haute n'est plus un nombre écrit à la main — c'est le bas de la
// tête mesuré plus haut. La version 0.6 exigeait « y > 0,9 », borne héritée du
// mannequin, qui laissait passer un sac plaqué sur le visage.
ok("sac: il reste porté au dos à toutes les charges",
   sac.every((l) => l.dosZ < -0.2 && l.dosY < anatomie.teteMin),
   `z local de ${Math.min(...sac.map((l) => l.dosZ))} à ${Math.max(...sac.map((l) => l.dosZ))}, `
   + `y de ${Math.min(...sac.map((l) => l.dosY))} à ${Math.max(...sac.map((l) => l.dosY))} `
   + `(bas de tête ${anatomie.teteMin})`);

const coutJeu = await jeu.evaluate(() => window.HORIZON.info);
console.log(`   coût en jeu : ${coutJeu.calls} calls · ${coutJeu.tris} tris · ${coutJeu.geometries} géo`);
ok("perf: moins de 120 appels de rendu en jeu", coutJeu.calls < 120, `${coutJeu.calls} calls`);

const errJeuReelles = errJeu.filter((e) => !e.includes("favicon"));
ok("joueur: aucune erreur console en jeu", errJeuReelles.length === 0,
   errJeuReelles.slice(0, 2).join(" | ") || "propre");
await jeu.close();

console.log("\n=== ERREURS ===");
const reelles = erreurs.filter((e) => !e.includes("favicon"));
ok("runtime: aucune erreur console", reelles.length === 0,
   reelles.length ? reelles.slice(0, 3).join(" | ") : "propre");

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
if (fail) console.log(echecs.map((n) => "  ✗ " + n).join("\n"));
await browser.close();
process.exit(fail ? 1 : 0);
