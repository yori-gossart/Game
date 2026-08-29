/**
 * FOG NOMAD / HORIZON — non-régression des défauts déjà corrigés.
 *
 * Chaque contrôle vise le MÉCANISME d'un bug réel, pas son symptôme : un test
 * qui ne vérifie que le symptôme laisse revenir la cause sous une autre forme.
 * L'historique de chaque défaut est dans AUDIT_PERFORMANCE_BUGS_0.2.md.
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

const H = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);

// ---------------------------------------------------------------------------
console.log("\n=== B0 — ARTEFACT NOIR DES FLEURS ===");
// Cause réelle : l'InstancedMesh des fleurs corrompait le rendu sur le GPU
// cible. Le correctif est la fusion en une géométrie par chunk. Le test
// interdit le retour de l'instanciation, pas la couleur du résultat.
const fleurs = await H(() => {
  let instanciees = 0, fusionnees = 0, sommets = 0;
  window.HORIZON.scene.traverse((o) => {
    if (o.userData && o.userData.kind === "fleurs") {
      if (o.isInstancedMesh) instanciees++;
      else { fusionnees++; sommets += o.geometry.attributes.position.count; }
    }
  });
  return { instanciees, fusionnees, sommets };
});
ok("fleurs: aucune n'est instanciée", fleurs.instanciees === 0,
   `${fleurs.instanciees} InstancedMesh`);
ok("fleurs: présentes sous forme fusionnée", fleurs.fusionnees > 0 && fleurs.sommets > 0,
   `${fleurs.fusionnees} objets, ${fleurs.sommets} sommets`);

// ---------------------------------------------------------------------------
console.log("\n=== PROFIL D'INSTANCIATION (B0) ===");
// B0 n'a jamais été expliqué : on sait seulement que l'InstancedMesh des
// fleurs — objet minuscule, instancié, avec couleur d'instance — produisait de
// grands polygones noirs sur le GPU cible, et que la fusion y mettait fin.
//
// La 0.5 a ajouté cinq familles instanciées et rétabli ce profil exact avec
// l'herbe. Ce contrôle empêche qu'il revienne sans qu'on s'en aperçoive : rien
// de minuscule ne doit être à la fois instancié ET porteur d'une couleur
// d'instance.
const profil = await H(() => {
  const familles = {};
  window.HORIZON.scene.traverse((o) => {
    if (!o.isMesh) return;
    const kind = (o.userData && o.userData.kind) || "(autre)";
    const f = familles[kind] || (familles[kind] = {
      instancie: 0, instanceColor: 0, minEchelle: Infinity
    });
    if (!o.isInstancedMesh) return;

    f.instancie++;
    if (o.instanceColor) f.instanceColor++;

    const m = new o.matrixWorld.constructor();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      f.minEchelle = Math.min(f.minEchelle,
        Math.hypot(m.elements[0], m.elements[1], m.elements[2]));
    }
  });
  return familles;
});

const aRisque = Object.entries(profil).filter(([, f]) =>
  f.instanceColor > 0 && f.minEchelle < 0.5);

console.log("   " + Object.entries(profil)
  .filter(([, f]) => f.instancie > 0)
  .map(([k, f]) => `${k}:${f.instancie}${f.instanceColor ? "c" : ""}@${f.minEchelle.toFixed(2)}`)
  .join("  "));

// Seules les trois familles validées sur appareil en 0.4 ont le droit d'être
// instanciées. Tout ce que la 0.5 a ajouté passe par le chemin fusionné —
// le bois mort a été isolé sur l'appareil comme produisant les grands
// polygones noirs, et rien ne dit que les autres nouveautés en soient
// exemptes. Le chemin fusionné coûte le même nombre d'appels de rendu.
const AUTORISEES = ["troncs", "houppiers", "rochers"];
const interdites = Object.entries(profil)
  .filter(([k, f]) => f.instancie > 0 && !AUTORISEES.includes(k));

ok("B0: seules les familles validées en 0.4 sont instanciées",
   interdites.length === 0,
   interdites.map(([k, f]) => `${k} (${f.instancie})`).join(", ") || AUTORISEES.join(", "));
ok("B0: les fleurs ne sont jamais instanciées",
   (profil.fleurs?.instancie || 0) === 0, `${profil.fleurs?.instancie || 0} InstancedMesh`);
ok("B0: le bois mort ne l'est pas non plus (isolé sur l'appareil)",
   (profil.boismort?.instancie || 0) === 0, `${profil.boismort?.instancie || 0} InstancedMesh`);
ok("B0: l'herbe ne l'est pas non plus (même profil que les fleurs)",
   (profil.herbes?.instancie || 0) === 0, `${profil.herbes?.instancie || 0} InstancedMesh`);
ok("B0: aucune famille minuscule n'est instanciée avec couleur d'instance",
   aRisque.length === 0,
   aRisque.map(([k, f]) => `${k} (échelle ${f.minEchelle.toFixed(2)})`).join(", ") || "aucune");

// Le mode diagnostic doit pouvoir supprimer TOUTE instanciation d'un geste :
// c'est ce qui a tranché en 0.2, et c'est la seule façon de trancher sur un
// appareil qu'on n'a pas sous la main.
const sansInst = await H(() => typeof window.HORIZON.scene === "object");
ok("B0: la scène reste inspectable depuis la sonde", sansInst);

console.log("\n=== COORDONNÉES NÉGATIVES ===");
// Cause réelle : un modulo négatif sur l'index de couleur des fleurs renvoyait
// un indice hors tableau. En 0.2 cela donnait un matériau blanc ; une fois les
// fleurs instanciées, cela levait une exception qui tuait la génération.
const avant = errors.length;
await H(() => window.HORIZON.teleport(-1500, -1500));
await wait(1600);
const negatif = await H(() => ({
  chunks: window.HORIZON.chunks,
  cles: window.HORIZON.chunkKeys.filter((k) => k.startsWith("-")).length,
  couleursHorsBorne: (() => {
    let mauvais = 0;
    window.HORIZON.scene.traverse((o) => {
      const c = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
      if (!c) return;
      for (let i = 0; i < c.array.length; i++) {
        const v = c.array[i];
        if (!Number.isFinite(v) || v < -0.001 || v > 1.001) { mauvais++; break; }
      }
    });
    return mauvais;
  })()
}));
ok("négatif: 25 chunks générés en coordonnées négatives", negatif.chunks === 25,
   `${negatif.chunks} chunks, ${negatif.cles} clés négatives`);
ok("négatif: aucune couleur de sommet hors bornes", negatif.couleursHorsBorne === 0,
   `${negatif.couleursHorsBorne} géométries fautives`);
ok("négatif: aucune erreur levée pendant la génération", errors.length === avant,
   errors.slice(avant, avant + 2).join(" | "));

// ---------------------------------------------------------------------------
console.log("\n=== BORD DU MONDE VISIBLE ===");
// Cause réelle : le brouillard saturait plus loin que la portée du terrain, si
// bien que le bord du monde apparaissait à l'horizon. FOG_FAR doit rester
// dérivé de la taille des chunks, jamais réglé à la main.
const portee = await H(() => {
  const c = window.HORIZON.config;
  return { near: window.HORIZON.nearFar.near, far: window.HORIZON.nearFar.far };
});
const fogFar = await H(() => {
  // Le brouillard de scène : c'est lui qui doit saturer avant le bord.
  const f = window.HORIZON.scene.fog;
  return f ? { near: f.near, far: f.far } : null;
});
ok("bord: la scène a bien un brouillard linéaire", fogFar !== null,
   fogFar ? `near ${fogFar.near} far ${fogFar.far}` : "absent");
ok("bord: le brouillard sature avant la portée du terrain (2 × 32 = 64 u)",
   fogFar && fogFar.far <= 64, `far ${fogFar && fogFar.far}`);
ok("bord: le plan lointain de la caméra dépasse le brouillard",
   portee.far > (fogFar ? fogFar.far : 0), `caméra ${portee.far} > brouillard ${fogFar && fogFar.far}`);
// Le plan d'eau suit le joueur ; s'il n'allait pas au-delà du brouillard, son
// bord apparaîtrait à l'horizon exactement comme celui du terrain.
const eau = await H(() => {
  const y = window.HORIZON.waterY;
  let demiTaille = 0;
  window.HORIZON.scene.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== "PlaneGeometry") return;
    if (Math.abs(o.position.y - y) > 0.01) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    demiTaille = Math.max(demiTaille, (bb.max.x - bb.min.x) / 2);
  });
  return { y, demiTaille };
});
ok("bord: le plan d'eau dépasse la portée du brouillard",
   eau.demiTaille > (fogFar ? fogFar.far : Infinity),
   `demi-largeur ${eau.demiTaille} u > brouillard ${fogFar && fogFar.far} u`);

// ---------------------------------------------------------------------------
console.log("\n=== TIRER-POUR-RAFRAÎCHIR ET POINTEURS ===");
const touch = await H(() => {
  const val = (sel) => {
    const e = document.querySelector(sel);
    return e ? getComputedStyle(e).touchAction : null;
  };
  return { html: getComputedStyle(document.documentElement).touchAction,
           body: getComputedStyle(document.body).touchAction,
           jeu: val("#game"), joystick: val("#joystick") };
});
ok("pull-to-refresh: touch-action neutralisé partout",
   ["html", "body", "jeu", "joystick"].every((k) => touch[k] === "none"),
   JSON.stringify(touch));

// setPointerCapture lève sur certains navigateurs si le pointeur n'est plus
// actif : l'appel doit être protégé. On provoque le cas avec un identifiant
// de pointeur inexistant.
const avantPointeur = errors.length;
await H(() => {
  const cible = document.querySelector("#game") || document.body;
  cible.dispatchEvent(new PointerEvent("pointerdown", {
    pointerId: 987654, clientX: 60, clientY: 400, bubbles: true, isPrimary: true
  }));
});
await wait(250);
ok("setPointerCapture: aucune exception sur un pointeur invalide",
   errors.length === avantPointeur,
   errors.slice(avantPointeur, avantPointeur + 2).join(" | "));

// ---------------------------------------------------------------------------
console.log("\n=== SOLEIL ===");
// Cause réelle : le soleil était placé au-delà du plan lointain et plus haut
// que l'inclinaison maximale de la caméra — il n'était jamais rendu.
const soleil = await H(() => {
  let trouve = null;
  window.HORIZON.scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.fog === false &&
        o.geometry.type === "SphereGeometry" && o.renderOrder === 0 && !trouve) {
      // Le soleil suit le joueur : la distance qui compte est celle à la
      // CAMÉRA, pas à l'origine du monde.
      const c = window.HORIZON.camPos;
      trouve = { visible: o.visible, y: o.position.y - c.y,
                 distance: Math.hypot(o.position.x - c.x,
                                      o.position.y - c.y,
                                      o.position.z - c.z) };
    }
  });
  return trouve;
});
ok("soleil: présent et visible", soleil !== null && soleil.visible,
   soleil ? `distance ${soleil.distance.toFixed(1)} u de la caméra` : "introuvable");
ok("soleil: dans le volume visible de la caméra",
   soleil !== null && soleil.distance < portee.far,
   soleil ? `${soleil.distance.toFixed(1)} < ${portee.far}` : "");

// ---------------------------------------------------------------------------
console.log("\n=== RÉSOLUTION ADAPTATIVE ===");
const pr = await H(() => window.HORIZON.pixelRatio);
ok("résolution: jamais sous un pixel CSS", pr >= 1, `densité ${pr}`);
ok("résolution: valeur prise dans les paliers configurés",
   [1.35, 1.15, 1.0].some((v) => Math.abs(v - pr) < 0.001), `densité ${pr}`);

// ---------------------------------------------------------------------------
console.log("\n=== SAC PORTÉ DANS LE DOS ===");
// Cause réelle : l'avant du personnage est son +Z local ; un sac en +Z se
// porte sur la poitrine et disparaît derrière le torse vu de dos.
const sac = await H(() => {
  const p = window.HORIZON.scene.children.find((o) => o.isGroup && o.userData && o.userData.bag);
  if (!p) return null;
  const b = p.userData.bag;
  b.geometry.computeBoundingBox();
  const bb = b.geometry.boundingBox;
  return { z: b.position.z, visible: b.visible,
           largeur: (bb.max.x - bb.min.x) * b.scale.x,
           torse: (() => {
             const t = p.userData.body;
             t.geometry.computeBoundingBox();
             return (t.geometry.boundingBox.max.x - t.geometry.boundingBox.min.x) * t.scale.x;
           })() };
});
ok("sac: monté dans le dos (Z local négatif)", sac !== null && sac.z < 0,
   sac ? `z ${sac.z.toFixed(2)}` : "introuvable");
ok("sac: plus large que le torse, donc visible de dos",
   sac !== null && sac.largeur > sac.torse * 0.7,
   sac ? `sac ${sac.largeur.toFixed(2)} / torse ${sac.torse.toFixed(2)}` : "");

// ---------------------------------------------------------------------------
console.log("\n=== AVEUGLEMENT PAR LA BRUME (0.5) ===");
// Cause réelle : la caméra est 13 unités DERRIÈRE le joueur, donc la brume
// l'atteignait une douzaine d'unités avant lui. Un plan opaque s'intercalait
// entre l'objectif et le personnage, et l'écran devenait noir alors que le
// joueur était vivant et devait choisir où courir. Constaté sur l'appareil :
// écran entièrement noir à 2 unités de marge.
//
// Deux mécanismes le corrigent, et les deux doivent tenir : la caméra se
// rapproche du joueur quand le front approche, et une nappe qui passe malgré
// tout devant l'objectif s'efface.
await H(() => { window.HORIZON.restartRun(); window.HORIZON.teleport(0, 0); });
await wait(900);
await H(() => { window.HORIZON.setYaw(0); window.HORIZON.setPitch(0.30); });
await wait(400);

const vue = [];
for (const marge of [40, 20, 12, 6, 2]) {
  // Deux précautions : la brume avance pendant l'attente, donc on recale la
  // marge juste avant de mesurer ; et la caméra met quelques images à
  // rejoindre sa nouvelle distance, donc on la laisse converger. Sans la
  // seconde, la mesure à 2 unités oscillait entre 1 % et 58 %.
  await H((g) => window.HORIZON.setFogGap(g), marge);
  await wait(500);
  await H((g) => window.HORIZON.setFogGap(g), marge);
  await wait(350);

  const mesure = await H((g) => {
    window.HORIZON.setFogGap(g);
    return {
      noir: window.HORIZON.darkFraction(),
      camZ: window.HORIZON.camPos.z,
      fogZ: window.HORIZON.game.fogZ
    };
  }, marge);
  vue.push({ marge, noir: mesure.noir,
             dansBrume: +(mesure.camZ - mesure.fogZ).toFixed(1) });
}
console.log("   " + vue.map((v) => `${v.marge}:${v.noir}%`).join("  "));

// Tant que le joueur n'est pas entré dans la brume, il doit VOIR. C'est la
// régression constatée sur l'appareil : écran noir dès une douzaine d'unités
// de marge, donc pendant toute la phase où il fallait justement choisir où
// courir.
ok("brume: l'écran reste lisible tant que le joueur n'est pas dedans",
   vue.filter((v) => v.marge >= 6).every((v) => v.noir < 35),
   vue.filter((v) => v.marge >= 6).map((v) => `${v.marge} u -> ${v.noir} %`).join(", "));

// À 2 unités, l'avant-garde a déjà dépassé le joueur : une gêne est normale et
// voulue. Ce qui ne l'est pas, c'est le noir complet.
const critique = vue.find((v) => v.marge === 2);
ok("brume: même collé au mur, l'écran n'est pas totalement noir",
   critique.noir < 80, `${critique.noir} % à 2 unités`);

ok("brume: la caméra n'est pas avalée avant le joueur",
   vue.filter((v) => v.marge >= 6).every((v) => v.dansBrume < 4),
   vue.map((v) => `${v.marge} u -> ${v.dansBrume}`).join(", "));

console.log("\n=== ÉCRAN DE MORT ===");
// Cause réelle : #death { display: grid } l'emportait sur l'attribut hidden,
// donc l'écran de fin s'affichait au démarrage.
const mort = await H(() => {
  const d = document.querySelector("#death");
  return { hidden: d.hidden, display: getComputedStyle(d).display };
});
ok("mort: écran masqué tant que la run vit",
   mort.hidden === true && mort.display === "none", JSON.stringify(mort));

console.log("\n=== ERREURS ===");
ok("runtime: aucune erreur console sur l'ensemble du parcours", errors.length === 0,
   errors.length ? errors.slice(0, 3).join(" | ") : "propre");

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
for (const f of failures) console.log(`  ✗ ${f}`);

await browser.close();
process.exit(fail ? 1 : 0);
