/**
 * FOG NOMAD — BANC DE CAPTURES REPRODUCTIBLES
 *
 * L'instrument de la 0.7.2, et il a été construit AVANT tout changement
 * artistique, délibérément.
 *
 * Trois fois dans ce projet, un travail visuel a été livré sans être regardé,
 * et trois fois il s'est révélé invisible : la crête de la brume en 0.7, les
 * bandes de ciel en 0.7.1, et l'art pass entier de la 0.6 dont l'utilisateur a
 * dit « il n'y a que le personnage qui a changé ». À chaque fois le code était
 * juste. À chaque fois il ne produisait rien à l'écran.
 *
 * Ce banc pose cinq positions FIXES et reproductibles. On les capture avant de
 * toucher à quoi que ce soit, on les recapture après, et on compare. Un
 * changement qui ne se voit sur aucune des cinq n'a pas eu lieu.
 *
 * La graine est imposée : sans elle, deux captures du même code montrent deux
 * mondes différents et la comparaison ne veut rien dire.
 *
 *   SHOT_DIR=.shots/avant node tests/captures.mjs
 *   …travail…
 *   SHOT_DIR=.shots/apres node tests/captures.mjs
 */
import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8123";
const OUT = process.env.SHOT_DIR || "./.shots/captures";
const GRAINE = Number(process.env.GRAINE || 20260912);

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: GL_ARGS });
const erreurs = [];

/** Une page neuve par plan : un plan qui hérite de l'état du précédent n'est
    pas reproductible, et c'est toute la valeur de ce banc. */
async function ouvrir(params) {
  const page = await browser.newPage({ ...devices["Pixel 7"] });
  page.on("pageerror", (e) => erreurs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  await page.goto(`${BASE}/index.html${params}`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.HORIZON?.pos, null, { timeout: 120000 });
  return page;
}

/** Le décor met plusieurs secondes à arriver et rebâtit le monde en arrivant.
    Capturer avant lui donnerait la végétation procédurale de repli. */
async function attendreDecor(page) {
  await page.waitForFunction(
    () => window.HORIZON.assets?.telechargements > 0, null, { timeout: 60000 }
  ).catch(() => {});
  await page.waitForTimeout(2500);
}

const plans = [];

async function capturer(page, nom) {
  await page.waitForTimeout(600);
  const chemin = `${OUT}/${nom}.png`;
  await page.screenshot({ path: chemin });
  const info = await page.evaluate(() => ({
    calls: window.HORIZON.info.calls,
    tris: window.HORIZON.info.tris,
    geo: window.HORIZON.info.geometries,
    tex: window.HORIZON.info.textures,
    etape: window.HORIZON.prologue?.etape || "—",
    yaw: +window.HORIZON.yaw.toFixed(2),
    gap: Math.round(window.HORIZON.fogGap),
  }));
  plans.push({ nom, ...info });
  console.log(`   ${nom.padEnd(22)} ${String(info.calls).padStart(3)} calls  `
    + `${String(info.tris).padStart(6)} tris  ${String(info.geo).padStart(3)} géo  `
    + `${info.tex} tex  lacet ${String(info.yaw).padStart(5)}  brume ${String(info.gap).padStart(4)}  `
    + `${info.etape}`);
  return chemin;
}

// ── 1. LE RÉVEIL ───────────────────────────────────────────────────────────
// La toute première image du jeu. Elle doit contenir la tour, les débris et le
// sac — c'est le §7 du brief du prologue, et c'est la capture qui décide si le
// jeu ressemble à un jeu.
{
  const page = await ouvrir("");
  await page.waitForFunction(
    () => window.HORIZON.prologue.franchies.includes("PLAYER_WAKE"),
    null, { timeout: 120000 });
  await page.waitForTimeout(1800);
  await capturer(page, "1-reveil");
  await page.close();
}

// ── 2. LA BRUME RÉVÉLÉE ────────────────────────────────────────────────────
// Le plan où la caméra se retourne. C'est LA capture de référence pour tout
// travail sur la brume : c'est le seul moment du jeu où elle est cadrée.
{
  const page = await ouvrir("");
  await page.waitForFunction(
    () => window.HORIZON.prologue.franchies.includes("BAG_VISIBLE"),
    null, { timeout: 120000 });
  // Prendre le sac pour déclencher la suite, sans jouer douze minutes.
  await page.evaluate(() => {
    const H = window.HORIZON;
    (function boucle() {
      if (H.prologue.franchies.includes("RUN_OBJECTIVE")) return;
      requestAnimationFrame(boucle);
      const b = document.getElementById("pro-action");
      if (b && !b.hidden) { b.click(); return; }
      if (!H.prologue.sacPris) {
        const s = H.prologue.cibleSac;
        H.teleport(s.x, s.z);
      }
    })();
  });
  // On vise le milieu du plan : caméra retournée, condamné encore en vue.
  await page.waitForFunction(() => {
    const p = window.HORIZON.prologue;
    return p.acteurs.length > 0 && Math.abs(Math.abs(window.HORIZON.yaw) - Math.PI) < 0.7;
  }, null, { timeout: 90000 }).catch(() => {});
  await capturer(page, "2-brume-revelee");
  await page.close();
}

// ── 3. LA FORÊT ────────────────────────────────────────────────────────────
// Le monde ordinaire, celui qu'on traverse pendant dix minutes. Graine fixe et
// position fixe : c'est la capture qui juge le terrain et la végétation.
{
  const page = await ouvrir("?sansprologue");
  await attendreDecor(page);
  await page.evaluate((g) => {
    window.HORIZON.setSeed(g, 1.5, 1.5);
    window.HORIZON.teleport(1.5, -240);
    window.HORIZON.setFogGap(150);
  }, GRAINE);
  await page.waitForTimeout(2500);
  await capturer(page, "3-foret");
  // Et la même position, Brume proche : c'est là que se juge la transition.
  await page.evaluate(() => window.HORIZON.setFogGap(34));
  await page.waitForTimeout(1200);
  await capturer(page, "3b-foret-brume-proche");
  await page.close();
}

// ── 4. LE CAMP DU CONVOI ───────────────────────────────────────────────────
{
  const page = await ouvrir("?prologuetest");
  await page.waitForFunction(
    () => window.HORIZON.prologue.franchies.includes("BAG_VISIBLE"),
    null, { timeout: 120000 });
  await page.evaluate(() => window.HORIZON.sauterPrologue("FIRST_FIRE"));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const p = window.HORIZON.prologue;
    window.HORIZON.teleport(p.ancrage.x, p.ancrage.z + p.scene.traces.z + 210);
  });
  await page.waitForFunction(
    () => !!window.HORIZON.scene.getObjectByName("prologue-traces"),
    null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const t = window.HORIZON.scene.getObjectByName("prologue-traces");
    if (t) window.HORIZON.teleport(t.position.x, t.position.z + 16);
    window.HORIZON.setFogGap(220);
  });
  await page.waitForTimeout(2000);
  // Le panneau de conduite couvre le bas de l'écran : on le replie pour la photo.
  await page.evaluate(() => document.getElementById("prologuetest")?.remove());
  await capturer(page, "4-camp");
  await page.close();
}

// ── 5. LE PILIER ANCIEN ────────────────────────────────────────────────────
{
  const page = await ouvrir("?prologuetest");
  await page.waitForFunction(
    () => window.HORIZON.prologue.franchies.includes("BAG_VISIBLE"),
    null, { timeout: 120000 });
  await page.evaluate(() => window.HORIZON.sauterPrologue("MAIN_OBJECTIVE_REVEALED"));
  await page.waitForFunction(
    () => !!window.HORIZON.scene.getObjectByName("prologue-pilier-ancien"),
    null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const p = window.HORIZON.scene.getObjectByName("prologue-pilier-ancien");
    if (p) window.HORIZON.teleport(p.position.x, p.position.z + 15);
    window.HORIZON.setFogGap(220);
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.getElementById("prologuetest")?.remove());
  await capturer(page, "5-pilier");
  await page.close();
}

await browser.close();

console.log(`\n   graine ${GRAINE} · ${plans.length} plans dans ${OUT}`);
if (erreurs.length) {
  console.log(`   ERREURS CONSOLE : ${erreurs.length}`);
  for (const e of erreurs.slice(0, 5)) console.log(`     ${e}`);
} else {
  console.log("   aucune erreur console");
}
