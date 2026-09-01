/**
 * FOG NOMAD 0.5 — distribution du WorldDirector.
 *
 * Simule des milliers de chunks sans navigateur : le directeur est une
 * fonction pure de la position et de la seed, il se teste donc directement.
 *
 * Le but n'est pas d'atteindre des nombres précis, mais de vérifier que le
 * générateur ne part pas dans un extrême : pas de longue traversée vide, pas
 * de grappe absurde, des repères vraiment rares.
 */
import { createWorldDirector, worldContext, WORLD } from "../worlddirector.mjs";

let pass = 0, fail = 0;
const failures = [];
function ok(label, condition, detail = "") {
  if (condition) { pass++; console.log(`PASS  ${label}${detail ? "  — " + detail : ""}`); }
  else { fail++; failures.push(label); console.log(`FAIL  ${label}${detail ? "  — " + detail : ""}`); }
}

// --- doublures du moteur, suffisantes pour le directeur --------------------
// Le directeur ne lit du terrain que l'altitude et les champs de zone : on
// reproduit les mêmes formules que main.mjs plutôt que de charger le moteur.
function faireDeps(seed) {
  const terrainHeight = (x, z) => {
    const sx = seed * 0.00013, sz = seed * 0.00009;
    const broad = Math.sin(x * 0.035 + sx) * 2.35 + Math.cos(z * 0.038 - sz) * 1.8;
    const ridge = Math.sin((x + z) * 0.017 + sx * 2.7) * 1.45;
    const hills = Math.sin(x * 0.075 + sx * 4.3) * Math.cos(z * 0.068 - sz * 3.1) * 1.3;
    const detail = Math.cos((x - z) * 0.055 - sz * 2.1) * 0.42;
    const bosse = Math.sin(x * 0.0195 + sx * 7.3) * Math.cos(z * 0.0172 - sz * 6.1);
    const creux = -Math.pow(Math.max(0, bosse), 3) * 3.6;
    const plis = Math.sin(x * 0.112 - sz * 3.3) * Math.cos(z * 0.098 + sx * 2.9) * 0.34;
    return broad + ridge + hills + detail + creux + plis + 0.9;
  };

  const zoneAt = (x, z) => {
    const sx = seed * 0.00011, sz = seed * 0.00007;
    return {
      rocaille: Math.sin(x * 0.0125 + sx * 5.1) * 0.5 + Math.cos(z * 0.0163 - sz * 3.7) * 0.5,
      clairiere: Math.sin((x - z) * 0.0208 + sx * 2.3) * 0.5 + Math.cos((x + z) * 0.0141 - sz * 4.9) * 0.5,
      sec: Math.sin(z * 0.0094 - sx * 6.2) * 0.5 + Math.cos(x * 0.0117 + sz * 5.4) * 0.5
    };
  };

  return { chunkSize: 32, terrainHeight, zoneAt, biomeIndexAt: () => 0, seed };
}

/** Parcourt un couloir de chunks comme le ferait une vraie run. */
function parcourir(seed, nbChunks, pas) {
  const deps = faireDeps(seed);
  const dir = createWorldDirector(deps);
  const evenements = [];

  for (let k = 0; k < nbChunks; k++) {
    // Couloir de 5 chunks de large, comme la fenêtre réellement chargée.
    let visible = false;

    for (let lat = -2; lat <= 2; lat++) {
      const cx = Math.round(pas.x * k) + lat;
      const cz = Math.round(pas.z * k);
      const ctx = worldContext(cx, cz, { ...deps, fogGap: 200 });
      const d = dir.decide(ctx);

      // Ce qui compte est ce que le JOUEUR voit, pas ce que porte la colonne
      // exacte où il marche : la portée de vue couvre environ deux chunks de
      // part et d'autre. Compter la seule colonne centrale mesurait une
      // solitude que le joueur ne vit jamais.
      if (Math.abs(lat) <= 1 &&
          (d.structure || d.landmark || d.nomade || d.animaux || d.oiseaux)) {
        visible = true;
      }
    }

    evenements.push(visible);
  }

  // Plus longue série de chunks consécutifs sans le moindre événement, sur
  // l'axe de progression.
  let serie = 0, pire = 0;
  for (const e of evenements) {
    if (e) serie = 0; else { serie++; pire = Math.max(pire, serie); }
  }

  return { stats: dir.stats, pireSerieVide: pire, surAxe: evenements.length };
}

// ---------------------------------------------------------------------------
console.log("=== 200 CHUNKS, TROIS SEEDS, TROIS AXES ===");
const SEEDS = [424242, 991177, 130500];
const AXES = { "tout droit": {x:0,z:-1}, "diagonale": {x:1,z:-1}, "latéral": {x:-1,z:0} };

const releves = [];
for (const seed of SEEDS) {
  for (const [nom, pas] of Object.entries(AXES)) {
    const r = parcourir(seed, 200, pas);
    releves.push({ seed, axe: nom, ...r });
  }
}

console.log("seed      axe          cabane camp ruine balise monum arbre nomad anim oiso  vides%  pireVide");
for (const r of releves) {
  const s = r.stats;
  const videPct = (100 * s.vides / s.chunks).toFixed(0);
  console.log(
    `${String(r.seed).padEnd(9)} ${r.axe.padEnd(12)} ` +
    `${String(s.cabane).padStart(6)} ${String(s.camp).padStart(4)} ${String(s.ruine).padStart(5)} ` +
    `${String(s.balise).padStart(6)} ${String(s.monument).padStart(5)} ${String(s.grandarbre).padStart(5)} ` +
    `${String(s.nomades).padStart(5)} ${String(s.animaux).padStart(4)} ${String(s.oiseaux).padStart(4)} ` +
    `${videPct.padStart(6)}  ${String(r.pireSerieVide).padStart(7)}`);
}

const somme = (f) => releves.reduce((a, r) => a + f(r.stats), 0);
const totalChunks = somme((s) => s.chunks);

// --- aucune traversée interminablement vide --------------------------------
const pireVide = Math.max(...releves.map((r) => r.pireSerieVide));
ok("aucune longue traversée sans le moindre événement",
   pireVide <= 12, `pire série : ${pireVide} chunks sans rien de visible depuis l'axe`);

// --- les quatre familles de structures existent toutes ---------------------
for (const type of ["cabane", "camp", "ruine", "balise"]) {
  ok(`structures : des ${type}s sont générées`, somme((s) => s[type]) > 0,
     `${somme((s) => s[type])} sur ${totalChunks} chunks`);
}

// --- hiérarchie de rareté --------------------------------------------------
ok("structures : les cabanes sont plus fréquentes que les ruines",
   somme((s) => s.cabane) > somme((s) => s.ruine),
   `${somme((s) => s.cabane)} cabanes contre ${somme((s) => s.ruine)} ruines`);
ok("structures : les balises sont les plus rares des quatre",
   somme((s) => s.balise) < somme((s) => s.ruine),
   `${somme((s) => s.balise)} balises contre ${somme((s) => s.ruine)} ruines`);

const reperes = somme((s) => s.monument) + somme((s) => s.grandarbre);
const structures = somme((s) => s.cabane + s.camp + s.ruine + s.balise);
ok("repères : plus rares que les structures ordinaires",
   reperes < structures, `${reperes} repères contre ${structures} structures`);
ok("repères : vraiment rares (moins de 3 % des chunks)",
   reperes / totalChunks < 0.03, `${(100 * reperes / totalChunks).toFixed(2)} %`);

// --- densité globale : ni désert, ni parc d'attractions --------------------
const partVide = somme((s) => s.vides) / totalChunks;
ok("densité : la majorité des chunks reste vide (le monde n'est pas un parc)",
   partVide > 0.45, `${(100 * partVide).toFixed(0)} % de chunks sans événement`);
ok("densité : mais pas au point d'être désert",
   partVide < 0.9, `${(100 * partVide).toFixed(0)} % de chunks sans événement`);

// --- vie -------------------------------------------------------------------
ok("vie : des animaux sont répartis", somme((s) => s.animaux) > 0,
   `${somme((s) => s.animaux)} animaux`);
ok("vie : des oiseaux sont répartis", somme((s) => s.oiseaux) > 0,
   `${somme((s) => s.oiseaux)} oiseaux`);
ok("vie : des nomades apparaissent, mais rarement",
   somme((s) => s.nomades) > 0 && somme((s) => s.nomades) / totalChunks < 0.06,
   `${somme((s) => s.nomades)} nomades (${(100 * somme((s) => s.nomades) / totalChunks).toFixed(1)} %)`);

// --- la brume tue la vie ---------------------------------------------------
{
  const deps = faireDeps(424242);
  const dir = createWorldDirector(deps);
  let vivant = 0;
  for (let k = 0; k < 300; k++) {
    const ctx = worldContext(k, -k, { ...deps, fogGap: 4 });
    const d = dir.decide(ctx);
    if (d.nomade || d.animaux || d.oiseaux) vivant++;
  }
  ok("vie : rien ne vit à portée de la brume", vivant === 0,
     `${vivant} chunks vivants sur 300 avec la brume à 4 unités`);
}

// --- déterminisme : le même chunk donne toujours le même contenu -----------
{
  const deps = faireDeps(424242);
  const a = createWorldDirector(deps);
  const b = createWorldDirector(deps);

  // b visite les mêmes chunks mais dans l'ordre inverse : si le directeur
  // gardait une mémoire liée au parcours, les résultats divergeraient.
  const cles = [];
  for (let k = 0; k < 400; k++) cles.push({ cx: (k % 20) - 10, cz: -Math.floor(k / 20) });

  const ra = cles.map((c) => JSON.stringify(
    a.decide(worldContext(c.cx, c.cz, { ...deps, fogGap: 200 }))));
  const rb = [...cles].reverse().map((c) => JSON.stringify(
    b.decide(worldContext(c.cx, c.cz, { ...deps, fogGap: 200 }))));
  rb.reverse();

  const divergences = ra.filter((v, i) => v !== rb[i]).length;
  ok("déterminisme : l'ordre de parcours ne change rien",
     divergences === 0, `${divergences} divergences sur ${cles.length} chunks`);
}

// --- 500 chunks : stabilité et absence de dérive ---------------------------
console.log("\n=== 500 CHUNKS ===");
{
  const r = parcourir(770077, 500, { x: 0, z: -1 });
  const s = r.stats;
  console.log(`   ${s.chunks} chunks · ${s.cabane} cabanes · ${s.camp} camps · ` +
    `${s.ruine} ruines · ${s.balise} balises · ${s.monument + s.grandarbre} repères · ` +
    `${s.nomades} nomades · ${s.animaux} animaux · ${s.oiseaux} oiseaux · ` +
    `${(100 * s.vides / s.chunks).toFixed(0)} % vides · pire série vide ${r.pireSerieVide}`);

  ok("500 chunks : aucune longue traversée vide", r.pireSerieVide <= 12,
     `${r.pireSerieVide} chunks`);
  ok("500 chunks : les six familles apparaissent toutes",
     s.cabane > 0 && s.camp > 0 && s.ruine > 0 && s.balise > 0 &&
     s.monument + s.grandarbre > 0 && s.nomades > 0,
     `cabane ${s.cabane}, camp ${s.camp}, ruine ${s.ruine}, balise ${s.balise}, ` +
     `repères ${s.monument + s.grandarbre}, nomades ${s.nomades}`);

  // La densité ne doit pas dériver entre le début et la fin du parcours.
  const debut = parcourir(770077, 100, { x: 0, z: -1 });
  const partDebut = debut.stats.vides / debut.stats.chunks;
  const partFin = s.vides / s.chunks;
  ok("500 chunks : la densité ne dérive pas avec la distance",
     Math.abs(partDebut - partFin) < 0.12,
     `${(100 * partDebut).toFixed(0)} % au début contre ${(100 * partFin).toFixed(0)} % sur 500`);
}

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(fail ? 1 : 0);
