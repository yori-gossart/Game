/**
 * FOG NOMAD 0.7.2 — ASSERTIONS STRUCTURELLES DE LA PASSE D'ART (§61-§62)
 *
 * Ce fichier ne juge pas si c'est beau. Il vérifie que ce qui a été écrit
 * EXISTE À L'ÉCRAN — ce qui, dans ce projet, n'a rien d'acquis.
 *
 * Chacune des vérifications ci-dessous correspond à un défaut RÉEL de la
 * 0.7.2, trouvé en regardant une capture, jamais en relisant le code :
 *
 *   — la nappe de terre battue du camp était construite à l'envers. Normale
 *     vers le bas, éliminée par le culling, invisible partout. Le code était
 *     juste ; la géométrie n'existait pas à l'écran. D'où le contrôle sur
 *     l'ORIENTATION MOYENNE des normales, et pas seulement sur le nombre de
 *     triangles ;
 *   — le couvert bas existait depuis la 0.5 à raison de huit touffes par
 *     chunk de trente-deux mètres. D'où le contrôle de DENSITÉ ;
 *   — le banc de captures photographiait un monde en qualité basse, où
 *     `facteurDecor()` vaut zéro et où l'herbe n'est même pas construite.
 *     D'où le contrôle du niveau imposé, et surtout celui qui vérifie qu'il
 *     ne touche à AUCUNE mécanique ;
 *   — la stèle ancienne était un poteau gris de la même couleur que la tour.
 *     D'où le contrôle qui compare les deux palettes et les deux rythmes.
 *
 * Un test qui se contenterait de « l'objet est dans la scène » aurait été vert
 * pour chacun de ces défauts.
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
const erreurs = [];

async function ouvrir(params) {
  const page = await browser.newPage({ ...devices["Pixel 7"] });
  page.on("pageerror", (e) => erreurs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  await page.goto(`${BASE}/index.html${params}`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.HORIZON?.pos, null, { timeout: 120000 });
  return page;
}

/* ═══ 1. LA QUALITÉ IMPOSÉE (§59) ═════════════════════════════════════════
   Et surtout : elle ne doit toucher à AUCUNE mécanique. Deux joueurs sur deux
   téléphones différents jouent au même jeu ; ils ne le voient pas aussi bien. */
console.log("\n=== §59 LES NIVEAUX DE QUALITÉ ===");
{
  const mesures = {};
  for (const niveau of ["haute", "moyenne", "basse"]) {
    const page = await ouvrir(`?sansprologue&qualite=${niveau}`);
    await page.waitForTimeout(1500);
    mesures[niveau] = await page.evaluate(() => ({
      qualite: window.HORIZON.info.qualite,
      imposee: window.HORIZON.info.qualiteImposee,
      decor: window.HORIZON.info.decor,
      // Les mécaniques, qui doivent être IDENTIQUES d'un niveau à l'autre.
      vitesse: window.HORIZON.engine.playerSpeed,
      course: window.HORIZON.engine.runMultiplier,
      portee: window.HORIZON.engine.chunkRadius * window.HORIZON.engine.chunkSize,
      ressources: window.HORIZON.resourceCount,
      brume: Math.round(window.HORIZON.fogGap),
    }));
    await page.close();
  }

  for (const niveau of ["haute", "moyenne", "basse"]) {
    ok(`qualité: ?qualite=${niveau} est bien imposée`,
       mesures[niveau].qualite === niveau && mesures[niveau].imposee === true,
       `${mesures[niveau].qualite}, imposée ${mesures[niveau].imposee}`);
  }
  ok("qualité: le décor décroît strictement avec le niveau",
     mesures.haute.decor > mesures.moyenne.decor
       && mesures.moyenne.decor > mesures.basse.decor,
     `${mesures.haute.decor} > ${mesures.moyenne.decor} > ${mesures.basse.decor}`);
  ok("qualité: en basse, le décor est bien nul — c'est ce qui rendait l'herbe absente",
     mesures.basse.decor === 0);

  const meca = (m) => `${m.vitesse}/${m.course}/${m.portee}`;
  ok("qualité: AUCUNE mécanique ne dépend du niveau",
     meca(mesures.haute) === meca(mesures.moyenne)
       && meca(mesures.moyenne) === meca(mesures.basse),
     `${meca(mesures.haute)} · ${meca(mesures.moyenne)} · ${meca(mesures.basse)}`);
}

/* ═══ 2. LE COUVERT BAS (§35) ═════════════════════════════════════════════ */
console.log("\n=== §35 LE COUVERT BAS ===");
{
  const page = await ouvrir("?sansprologue&qualite=haute");
  await page.waitForTimeout(2500);
  // On lit la scène telle qu'elle est rendue, sans API dédiée : un maillage
  // d'herbe appartient au groupe de son chunk, et c'est la position de ce
  // groupe qui dit s'il est voisin du joueur.
  const h = await page.evaluate(() => {
    const H = window.HORIZON;
    const cote = H.engine.chunkSize;
    let proches = 0, lointaines = 0, trisProches = 0, hauteurMax = 0, visiblesLoin = 0;
    for (const groupe of H.scene.children) {
      if (!groupe.isGroup || !groupe.children.length) continue;
      const dx = Math.abs(groupe.position.x - H.pos.x);
      const dz = Math.abs(groupe.position.z - H.pos.z);
      // Le groupe est centré sur son chunk : au-delà d'un chunk et demi de
      // l'un ou l'autre côté, il n'est plus voisin.
      const proche = dx <= cote * 1.5 && dz <= cote * 1.5;
      // Le maillage d'herbe est FUSIONNÉ : sa boîte englobante couvre tout le
      // relief du chunk, pas la hauteur d'une touffe. On retranche donc le
      // relief, que le maillage de terrain du même chunk donne exactement.
      let relief = 0;
      for (const enfant of groupe.children) {
        if (enfant.userData?.kind !== "terrain") continue;
        enfant.geometry.computeBoundingBox();
        const b = enfant.geometry.boundingBox;
        relief = b.max.y - b.min.y;
      }
      for (const enfant of groupe.children) {
        if (enfant.userData?.kind !== "herbes") continue;
        const tris = enfant.geometry.attributes.position.count / 3;
        enfant.geometry.computeBoundingBox();
        const bb = enfant.geometry.boundingBox;
        if (proche) { proches++; trisProches += tris;
                      hauteurMax = Math.max(hauteurMax,
                                            (bb.max.y - bb.min.y) - relief); }
        else { lointaines++; if (enfant.visible) visiblesLoin++; }
      }
    }
    return { proches, lointaines, trisProches, visiblesLoin,
             hauteurMax: +hauteurMax.toFixed(2), cote };
  });

  ok("herbe: les chunks voisins portent bien du couvert bas",
     h.proches >= 4, `${h.proches} chunk(s) sur 9`);
  // Le seuil : la version 0.5 produisait huit touffes de douze triangles par
  // chunk, soit une centaine. En dessous de mille, on est resté au même point.
  ok("herbe: la densité est celle d'un pré, pas d'un semis",
     h.trisProches / Math.max(1, h.proches) > 1000,
     `${Math.round(h.trisProches / Math.max(1, h.proches))} triangles par chunk voisin`);
  // Le personnage fait 1,7 u. Une touffe qui le dépasse à la taille n'est plus
  // de l'herbe : la première version montait au genou et faisait un champ
  // d'agaves. La marge est large parce que la mesure passe par une soustraction
  // de boîtes englobantes, pas par la géométrie de la touffe elle-même.
  ok("herbe: une touffe arrive à la cheville, pas au genou",
     h.hauteurMax > 0.15 && h.hauteurMax < 1.2, `${h.hauteurMax} u au-dessus du relief`);
  ok("herbe: rien n'est affiché sur les chunks lointains",
     h.visiblesLoin === 0,
     `${h.visiblesLoin} affiché(s) sur ${h.lointaines} lointain(s)`);
  await page.close();
}

/* ═══ 3. LES NAPPES AU SOL (§32) ══════════════════════════════════════════
   L'assertion sur l'orientation est la plus importante du fichier : c'est
   exactement le défaut qui a rendu la terre battue invisible partout. */
console.log("\n=== §32 LE SOL DU CAMP ===");
{
  const page = await ouvrir("?prologuetest&qualite=haute");
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
    null, { timeout: 60000 }).catch(() => {});

  const camp = await page.evaluate(() => {
    const g = window.HORIZON.scene.getObjectByName("prologue-traces");
    if (!g) return null;
    const sol = g.children.find((o) => o.name === "camp-sol");
    if (!sol) return { sansSol: true, enfants: g.children.length };
    const n = sol.geometry.attributes.normal;
    let versLeHaut = 0;
    for (let i = 0; i < n.count; i++) if (n.getY(i) > 0.5) versLeHaut++;
    sol.geometry.computeBoundingBox();
    const bb = sol.geometry.boundingBox;
    return {
      tris: n.count / 3,
      partHaut: versLeHaut / n.count,
      largeur: +(bb.max.x - bb.min.x).toFixed(1),
      longueur: +(bb.max.z - bb.min.z).toFixed(1),
      // Les objets du camp, fusionnés par matériau : un maillage par matière.
      maillages: g.children.length,
      lambert: sol.material.type,
    };
  });

  ok("camp: le sol piétiné est posé", camp && !camp.sansSol,
     camp ? `${camp.tris} triangles` : "absent");
  if (camp && !camp.sansSol) {
    // LA vérification. Une nappe dont les normales pointent vers le bas est
    // éliminée par le culling et ne se voit nulle part — c'est arrivé, et
    // aucun test « l'objet est dans la scène » ne l'aurait vu.
    ok("camp: les normales de la nappe pointent VERS LE HAUT",
       camp.partHaut > 0.9, `${Math.round(camp.partHaut * 100)} % des sommets`);
    ok("camp: la zone piétinée remplit le cadre proche",
       camp.largeur > 12 && camp.longueur > 14,
       `${camp.largeur} × ${camp.longueur} u`);
    ok("camp: elle est rendue comme le terrain, pas comme un objet posé dessus",
       camp.lambert === "MeshLambertMaterial", camp.lambert);
    ok("camp: le campement tient en peu d'appels de dessin",
       camp.maillages <= 12, `${camp.maillages} maillages`);
  }

  /* ═══ 4. LES DEUX STRUCTURES NE SE RESSEMBLENT PAS (§31) ════════════════ */
  console.log("\n=== §31 LA STÈLE CONTRE LA BALISE ===");
  await page.evaluate(() => window.HORIZON.prologue.forcerPilier?.());
  await page.waitForTimeout(1200);

  const duo = await page.evaluate(() => {
    const H = window.HORIZON;
    const lire = (nom) => {
      const g = H.scene.getObjectByName(nom);
      if (!g) return null;
      const couleurs = [];
      let halo = null, cristal = null, tris = 0;
      g.traverse((o) => {
        if (o.isPointLight) halo = { couleur: o.color.getHex(), intensite: o.intensity };
        if (o.isMesh) {
          tris += o.geometry.attributes.position.count / 3;
          if (o.material?.color) couleurs.push(o.material.color.getHex());
          if (o.material?.emissive && o.material.emissiveIntensity > 0.5) {
            cristal = o.material.emissive.getHex();
          }
        }
      });
      g.updateWorldMatrix(true, true);
      return { couleurs, halo, cristal, tris };
    };
    return { tour: lire("prologue-tour"), stele: lire("prologue-pilier-ancien") };
  });

  ok("structures: les deux sont posées", !!duo.tour && !!duo.stele);
  if (duo.tour && duo.stele) {
    const communes = duo.stele.couleurs.filter((c) => duo.tour.couleurs.includes(c));
    ok("structures: la stèle ne partage AUCUNE couleur avec la tour",
       communes.length === 0,
       communes.length ? communes.map((c) => "#" + c.toString(16)).join(" ") : "aucune");
    ok("structures: les deux cristaux ne sont pas de la même couleur",
       duo.tour.cristal !== duo.stele.cristal,
       `#${(duo.tour.cristal || 0).toString(16)} contre #${(duo.stele.cristal || 0).toString(16)}`);
    ok("structures: les deux halos ne sont pas de la même couleur",
       duo.tour.halo && duo.stele.halo
         && duo.tour.halo.couleur !== duo.stele.halo.couleur,
       `#${duo.tour.halo?.couleur.toString(16)} contre #${duo.stele.halo?.couleur.toString(16)}`);
    ok("structures: la stèle a sa dalle au sol",
       !!(await page.evaluate(() =>
            !!window.HORIZON.scene.getObjectByName("prologue-pilier-ancien")
              ?.children.some((o) => o.name === "pilier-dalle"))));
  }

  /* Les deux lumières ne battent pas au même rythme : deux lumières au même
     rythme sont le même objet, et toute la scène repose sur leur différence. */
  const rythmes = await page.evaluate(async () => {
    const H = window.HORIZON;
    const lire = () => {
      const out = {};
      for (const nom of ["prologue-tour", "prologue-pilier-ancien"]) {
        const g = H.scene.getObjectByName(nom);
        let v = null;
        g?.traverse((o) => { if (o.isPointLight) v = o.intensity; });
        out[nom] = v;
      }
      return out;
    };
    const suite = [];
    for (let i = 0; i < 26; i++) {
      suite.push(lire());
      await new Promise((r) => setTimeout(r, 120));
    }
    const amplitude = (nom) => {
      const v = suite.map((s) => s[nom]).filter((x) => x !== null);
      return v.length ? Math.max(...v) - Math.min(...v) : 0;
    };
    return { tour: amplitude("prologue-tour"), stele: amplitude("prologue-pilier-ancien") };
  });
  // Sur trois secondes, la balise (2 Hz) parcourt tout son battement ; la
  // stèle (0,42 Hz) n'en parcourt qu'une fraction. Les deux doivent bouger,
  // et pas de la même quantité.
  ok("structures: la balise BAT — son halo varie nettement en trois secondes",
     rythmes.tour > 1.0, `amplitude ${rythmes.tour.toFixed(2)}`);
  ok("structures: la stèle RESPIRE — beaucoup plus lentement que la balise",
     rythmes.stele > 0.01 && rythmes.stele < rythmes.tour * 0.6,
     `${rythmes.stele.toFixed(2)} contre ${rythmes.tour.toFixed(2)}`);

  await page.close();
}

/* ═══ 5. LE FEU N'EST PAS UNE CONDITION DE SORTIE (§49) ═══════════════════ */
console.log("\n=== §49 LE PROLOGUE N'EXIGE PAS DE FEU ===");
{
  const page = await ouvrir("?prologuetest&qualite=haute");
  await page.waitForFunction(
    () => window.HORIZON.prologue.franchies.includes("BAG_VISIBLE"),
    null, { timeout: 120000 });
  const sortie = await page.evaluate(async () => {
    const H = window.HORIZON;
    H.sauterPrologue("FOG_REACTION");
    await new Promise((r) => setTimeout(r, 400));
    const avant = {
      feux: H.game.firesLit,
      franchies: [...H.prologue.franchies],
    };
    // On pousse le joueur au-delà de la frontière de fin, sans jamais allumer.
    const p = H.prologue;
    H.teleport(p.ancrage.x, p.ancrage.z + p.scene.fin.z - 40);
    await new Promise((r) => setTimeout(r, 1500));
    return {
      avant,
      feux: H.game.firesLit,
      actif: H.prologue.actif,
      complet: H.prologue.franchies.includes("PROLOGUE_COMPLETE"),
      props: H.prologue.props,
    };
  });

  ok("sortie: aucun feu n'a été allumé de tout le parcours",
     sortie.feux === 0, `${sortie.feux} feu(x)`);
  ok("sortie: le prologue se termine QUAND MÊME",
     sortie.complet === true && sortie.actif === false,
     `complet ${sortie.complet}, actif ${sortie.actif}`);
  ok("sortie: la mise en scène est bien démontée",
     sortie.props.length === 0, sortie.props.join(", ") || "aucun objet");
  await page.close();
}

console.log("\n=== ERREURS ===");
ok("runtime: aucune erreur console", erreurs.length === 0,
   erreurs.slice(0, 3).join(" | ") || "aucune");

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
if (fail) { for (const e of echecs) console.log(`  ✗ ${e}`); }
await browser.close();
process.exit(fail ? 1 : 0);
