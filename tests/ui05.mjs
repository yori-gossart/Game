/**
 * FOG NOMAD 0.5 — INTERFACE : SAC, MODES, RATION
 *
 * Ce que ce fichier vérifie, et pourquoi.
 *
 * Le menu de sac est la seule pause du jeu. Le brief demande un ralentissement
 * fort, pas un arrêt : si la brume s'immobilisait, le sac deviendrait un abri
 * gratuit et le joueur pourrait s'y réfugier indéfiniment. On mesure donc que
 * le temps ralentit ET qu'il continue de couler.
 *
 * La ration est le seul soin du jeu. On vérifie qu'elle ne peut pas être
 * gâchée à pleine santé, qu'elle rend bien des points, et qu'elle pèse.
 *
 * Les modes ne sont pas jouables aujourd'hui — sauf NORMAL. On vérifie que
 * l'aiguillage existe et qu'il refuse ceux qui ne le sont pas.
 */
import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8080";
let pass = 0, fail = 0;
const echecs = [];

function ok(nom, condition, detail = "") {
  if (condition) { pass++; console.log(`PASS  ${nom}${detail ? "  — " + detail : ""}`); }
  else { fail++; echecs.push(nom); console.log(`FAIL  ${nom}${detail ? "  — " + detail : ""}`); }
}

const browser = await chromium.launch({ executablePath: CHROME, args: GL_ARGS });
const page = await browser.newPage({ ...devices["Pixel 7"] });

const erreurs = [];
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
page.on("pageerror", (e) => erreurs.push(String(e)));

await page.goto(`${BASE}/index.html?fogtest`, { waitUntil: "load" });
await page.waitForFunction(() => window.HORIZON?.engine, null, { timeout: 60000 });
const H = (fn, arg) => page.evaluate(fn, arg);

console.log("\n=== MODES ===");

const modes = await H(async () => {
  const m = await import("/modes.mjs");
  return {
    courant: m.modeCourant().id,
    jouables: m.modesJouables().map((x) => x.id),
    tous: Object.keys(m.GAME_MODES),
    refusEndless: m.choisirMode("ENDLESS"),
    refusInconnu: m.choisirMode("PAS_UN_MODE"),
    apresRefus: m.modeCourant().id,
    bagTimeScale: m.modeCourant().bagTimeScale
  };
});

ok("modes: NORMAL est le mode courant", modes.courant === "NORMAL", modes.courant);
ok("modes: les trois modes sont déclarés",
   modes.tous.length === 3 && modes.tous.includes("ENDLESS") && modes.tous.includes("HARDCORE"),
   modes.tous.join(", "));
ok("modes: NORMAL est le seul jouable",
   modes.jouables.length === 1 && modes.jouables[0] === "NORMAL",
   modes.jouables.join(", "));
ok("modes: un mode non disponible est refusé", modes.refusEndless === false);
ok("modes: un mode inconnu est refusé", modes.refusInconnu === false);
ok("modes: un refus ne change pas le mode courant", modes.apresRefus === "NORMAL");
ok("modes: NORMAL ralentit le sac sans le figer",
   modes.bagTimeScale > 0 && modes.bagTimeScale < 0.5,
   `timeScale ${modes.bagTimeScale}`);

console.log("\n=== DISPOSITION DE L'INTERFACE ===");

const disposition = await H(async () => {
  const { dispositionCourante } = await import("/ui.mjs");
  const racine = getComputedStyle(document.documentElement);
  const lire = (v) => racine.getPropertyValue(v).trim();
  return {
    joystick: lire("--ui-joystick-taille"),
    sac: lire("--ui-sac-taille"),
    jauges: lire("--ui-jauges-haut"),
    gaucher: document.body.classList.contains("gaucher"),
    config: dispositionCourante().joystick.taille
  };
});

ok("ui: les variables de disposition sont appliquées",
   disposition.joystick.endsWith("px") && disposition.sac.endsWith("px"),
   `joystick ${disposition.joystick}, sac ${disposition.sac}`);
ok("ui: la variable reflète la configuration JS",
   parseFloat(disposition.joystick) === disposition.config,
   `${disposition.joystick} = ${disposition.config}`);
ok("ui: droitier par défaut", disposition.gaucher === false);

const gaucher = await H(async () => {
  const { appliquerUI } = await import("/ui.mjs");
  appliquerUI({ gaucher: true });
  const avant = document.body.classList.contains("gaucher");
  const joystick = document.getElementById("joystick").getBoundingClientRect();
  appliquerUI({ gaucher: false, echelle: 1.25 });
  const grand = getComputedStyle(document.documentElement)
    .getPropertyValue("--ui-joystick-taille").trim();
  appliquerUI({ echelle: 1 });
  return { avant, joystickX: joystick.x, largeur: window.innerWidth, grand };
});

ok("ui: le mode gaucher pose la classe", gaucher.avant === true);
ok("ui: en gaucher le joystick passe à droite",
   gaucher.joystickX > gaucher.largeur / 2,
   `x ${Math.round(gaucher.joystickX)} sur ${gaucher.largeur}`);
ok("ui: l'échelle agrandit réellement les commandes",
   parseFloat(gaucher.grand) === 132 * 1.25,
   `${gaucher.grand} à l'échelle 1,25`);

console.log("\n=== MENU DE SAC ===");

const ferme = await H(() => ({
  panneau: document.getElementById("bag-panel").hidden,
  bouton: document.getElementById("open-bag").hidden
}));
ok("sac: fermé au démarrage", ferme.panneau === true && ferme.bouton === false);

// On remplit le sac pour que le menu ait quelque chose à montrer.
await H(async () => {
  const g = window.HORIZON.jeu;
  g.state.inventory.bois = 3;
  g.state.inventory.pierre = 1;
  g.state.weight = 34;
});

await page.click("#open-bag");
const ouvert = await H(() => ({
  panneau: document.getElementById("bag-panel").hidden,
  bouton: document.getElementById("open-bag").hidden,
  lignes: document.querySelectorAll("#bag-items .ligne").length,
  poids: document.getElementById("bag-weight").textContent
}));

ok("sac: le menu s'ouvre", ouvert.panneau === false);
ok("sac: le bouton d'ouverture s'efface", ouvert.bouton === true);
ok("sac: le contenu est listé", ouvert.lignes === 2, `${ouvert.lignes} lignes`);
ok("sac: le poids est affiché", /\d+ \/ \d+/.test(ouvert.poids), ouvert.poids);

// --- LE POINT CENTRAL : le temps ralentit, il ne s'arrête pas -------------
//
// On mesure l'avance réelle de la brume sur une seconde de mur, sac ouvert
// puis sac fermé. Le rapport doit valoir l'échelle du mode, pas zéro.
const mesure = await H(async () => {
  const g = window.HORIZON.jeu;

  async function avanceSurUneSeconde() {
    const z0 = g.state.fogZ;
    const t0 = g.state.elapsed;
    await new Promise((r) => setTimeout(r, 1000));
    return { brume: z0 - g.state.fogZ, temps: g.state.elapsed - t0 };
  }

  const auRalenti = await avanceSurUneSeconde();
  document.getElementById("close-bag").click();
  const normal = await avanceSurUneSeconde();
  return { auRalenti, normal };
});

const rapport = mesure.auRalenti.temps / mesure.normal.temps;
ok("sac ouvert: le temps de jeu continue d'avancer",
   mesure.auRalenti.temps > 0,
   `${mesure.auRalenti.temps.toFixed(3)} s de jeu pendant 1 s réelle`);
ok("sac ouvert: la brume continue d'avancer",
   mesure.auRalenti.brume > 0,
   `${mesure.auRalenti.brume.toFixed(2)} unités gagnées`);
ok("sac ouvert: le temps est fortement ralenti",
   rapport > 0.05 && rapport < 0.4,
   `${(rapport * 100).toFixed(0)} % du temps normal (visé ${modes.bagTimeScale * 100} %)`);
ok("sac: la fermeture rend le temps normal",
   mesure.normal.temps > mesure.auRalenti.temps * 2,
   `${mesure.normal.temps.toFixed(2)} s contre ${mesure.auRalenti.temps.toFixed(2)} s`);

const referme = await H(() => ({
  panneau: document.getElementById("bag-panel").hidden,
  bouton: document.getElementById("open-bag").hidden
}));
ok("sac: le menu se referme", referme.panneau === true && referme.bouton === false);

console.log("\n=== RATION ===");

const ration = await H(async () => {
  const g = window.HORIZON.jeu;
  const { CONFIG } = await import("/fognomad.mjs");
  const spec = CONFIG.resources.ration;

  g.state.inventory.ration = 2;
  g.state.weight = spec.weight * 2;

  const refusPleineSante = g.canEat();       // santé pleine : doit être false

  g.state.health = 30;
  const autorise = g.canEat();
  const mange = g.eatRation();

  return {
    spec,
    refusPleineSante, autorise, mange,
    sante: g.state.health,
    reste: g.state.inventory.ration,
    poids: g.state.weight,
    mangees: g.state.rationsMangees,
    maxHealth: CONFIG.player.maxHealth
  };
});

ok("ration: refusée à pleine santé", ration.refusPleineSante === false);
ok("ration: autorisée dès qu'on est blessé", ration.autorise === true);
ok("ration: la consommation réussit", ration.mange === true);
ok("ration: elle rend des points de vie",
   ration.sante === 30 + ration.spec.soin,
   `30 -> ${ration.sante} (+${ration.spec.soin})`);
ok("ration: elle est retirée du sac", ration.reste === 1, `${ration.reste} restante`);
ok("ration: elle allège le sac",
   ration.poids === ration.spec.weight,
   `${ration.poids} kg après consommation`);
ok("ration: la run la compte", ration.mangees === 1);
ok("ration: elle pèse assez pour être un choix",
   ration.spec.weight >= 5,
   `${ration.spec.weight} kg pour ${ration.spec.soin} points`);

// La ration ne doit PAS perturber la carte des ressources : abondance nulle.
const carte = await H(async () => {
  const { lateralWeights, CONFIG } = await import("/fognomad.mjs");
  const proche = lateralWeights(0);
  const loin = lateralWeights(64);
  return {
    abondance: CONFIG.resources.ration.abundance,
    poidsProche: proche.weights.ration,
    poidsLoin: loin.weights.ration,
    totalProche: proche.total
  };
});

ok("ration: ne pousse jamais en terrain découvert",
   carte.abondance === 0 && carte.poidsProche === 0 && carte.poidsLoin === 0,
   "poids latéral nul partout");
ok("ration: n'a rien changé aux trois cloches existantes",
   carte.totalProche > 0,
   `total à l'axe ${carte.totalProche.toFixed(3)}`);

// Elle existe bien dans le monde, posée par les abris.
// On interroge le directeur sur une large bande plutôt que sur quelques
// dizaines de chunks : les abris sont rares par conception (~1,7 % des chunks),
// et sur 180 chunks une graine sur vingt n'en contient aucun. Un test qui échoue
// une fois sur vingt sans qu'aucun code n'ait changé ne mesure plus rien.
const dansLeMonde = await H(() => {
  let abris = 0, chunks = 0;
  for (let cz = 0; cz > -200; cz--) {
    for (let cx = -3; cx <= 3; cx++) {
      chunks++;
      const plan = window.HORIZON.plan(cx, cz);
      if (plan.structure === "cabane" || plan.structure === "camp") abris++;
    }
  }
  return { abris, chunks, taux: abris / chunks };
});

ok("ration: le monde contient des abris où en trouver",
   dansLeMonde.abris > 5,
   `${dansLeMonde.abris} abris sur ${dansLeMonde.chunks} chunks (${(dansLeMonde.taux * 100).toFixed(1)} %)`);

console.log("\n=== ?WORLDTEST ===");

const page2 = await browser.newPage({ ...devices["Pixel 7"] });
await page2.goto(`${BASE}/index.html?worldtest`, { waitUntil: "load" });
await page2.waitForFunction(() => window.HORIZON?.engine, null, { timeout: 60000 });
await page2.waitForFunction(
  () => document.getElementById("worldtest")?.textContent.length > 40,
  null, { timeout: 15000 });

const overlay = await page2.evaluate(() => document.getElementById("worldtest").textContent);
console.log(overlay.split("\n").map((l) => "   " + l).join("\n"));

ok("worldtest: le panneau existe et se remplit", overlay.length > 40);
for (const attendu of ["fps", "calls", "tris", "géo", "chunks", "structures",
                       "nomades", "animaux", "oiseaux", "ressources"]) {
  ok(`worldtest: rapporte « ${attendu} »`, overlay.includes(attendu));
}

const sansOverlay = await H(() => !!document.getElementById("worldtest"));
ok("worldtest: absent sans le paramètre", sansOverlay === false);

await page2.close();

console.log("\n=== ERREURS ===");
ok("runtime: aucune erreur console", erreurs.length === 0,
   erreurs.length ? erreurs.slice(0, 3).join(" | ") : "propre");

console.log(`\n===== ${pass} / ${pass + fail} PASS =====`);
if (fail) console.log(echecs.map((n) => "  ✗ " + n).join("\n"));

await browser.close();
process.exit(fail ? 1 : 0);
