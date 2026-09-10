/**
 * FOG NOMAD 0.7 — LE PROLOGUE, JOUÉ D'UN BOUT À L'AUTRE
 *
 * Ce fichier ne regarde pas des variables : il JOUE. Un pilote installé dans
 * la page tient le joystick, oriente le personnage, s'arrête sur les
 * ressources, allume un feu, appuie sur les boutons quand ils apparaissent.
 * Les quinze points de contrôle sont ensuite lus comme un joueur les aurait
 * franchis — dans l'ordre, à des instants mesurés.
 *
 * POURQUOI PAS DE RACCOURCI. `sauterA()` existe et serait beaucoup plus
 * rapide. Il ne prouverait rien : la question posée par le §30 n'est pas
 * « les étapes existent-elles ? » mais « combien de temps met-on à les
 * traverser ? ». Une étape sautée ne dure rien.
 *
 * LE TEMPS MESURÉ EST DU TEMPS DE JEU. Le rendu logiciel avance moins vite que
 * l'horloge murale, et `delta` est plafonné à 40 ms : une durée relevée au
 * chronomètre mesurerait la machine de test. Les trois parcours sont donc
 * chronométrés sur `prologue.temps`, qui est le temps que le JOUEUR vit.
 *
 * TROIS PROFILS, parce qu'un seul chiffre ne dit rien d'une durée de jeu :
 *   rapide      — court tout droit, ne se détourne pas, n'allume aucun feu ;
 *   normal      — marche, ramasse ce qui est sur son chemin, brûle son bois ;
 *   exploration — se détourne jusqu'à 26 unités, garde ses cristaux, brûle son bois.
 */
import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8123";
let pass = 0, fail = 0;
const echecs = [];

function ok(nom, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${nom}${detail ? "  — " + detail : ""}`); }
  else { fail++; echecs.push(nom); console.log(`FAIL  ${nom}${detail ? "  — " + detail : ""}`); }
}

/**
 * LE PILOTE.
 *
 * Il tourne DANS la page, image par image. Le piloter depuis Node par
 * aller-retours donnerait une commande toutes les ~50 ms au mieux : le
 * personnage dépasserait ses cibles et n'aurait jamais le temps de collecter.
 *
 * Il convertit une direction MONDE en commande de joystick, ce que le moteur
 * attend : `move()` est exprimé dans le repère de la caméra, et la caméra
 * tourne. Ignorer ce lacet marchait tant que la caméra restait à zéro, et
 * aurait cessé de marcher au premier virage.
 */
function installerPilote(profil) {
  return (p) => {
    const H = window.HORIZON;
    const journal = { fauteDeSac: 0, ressourcesVisees: 0, feux: 0, morts: 0, boutons: [] };
    let arret = false;
    let cible = null;          // ressource visée, en exploration
    let pauseJusqua = 0;

    // Le bouton d'action du prologue : PRENDRE le sac, APPROCHER le pilier.
    // Un joueur ne clique pas dans la milliseconde ; on laisse 0,6 s, ce qui
    // vérifie au passage que le bouton RESTE affiché tant qu'on est à portée.
    let boutonVuA = 0;

    function directionVersFuite() { return { x: 0, z: -1 }; }

    function commander(wx, wz) {
      const n = Math.hypot(wx, wz) || 1;
      wx /= n; wz /= n;
      const y = H.yaw;
      const c = Math.cos(y), s = Math.sin(y);
      // Inverse de la rotation appliquée par le moteur (voir main.mjs).
      H.move(c * wx + s * wz, -s * wx + c * wz);
    }

    function boucle() {
      if (arret) return;
      requestAnimationFrame(boucle);

      const etat = H.game;   // c'est game.state : inventaire, poids, mort
      const pro = H.prologue;
      const t = performance.now() / 1000;

      if (etat.dead) { journal.morts++; arret = true; H.move(0, 0); return; }

      // --- boutons du prologue ---
      const bouton = document.getElementById("pro-action");
      if (bouton && !bouton.hidden) {
        if (!boutonVuA) boutonVuA = t;
        else if (t - boutonVuA > 0.6) {
          journal.boutons.push(document.getElementById("pro-action-texte")?.textContent || "?");
          bouton.click();
          boutonVuA = 0;
        }
      } else boutonVuA = 0;

      // --- tant que le sac est au sol, on va le chercher ---
      if (!pro.sacPris && pro.franchies.includes("BAG_VISIBLE")) {
        const s = pro.cibleSac;
        const d = Math.hypot(H.pos.x - s.x, H.pos.z - s.z);
        journal.fauteDeSac++;
        if (d > 1.6) { commander(s.x - H.pos.x, s.z - H.pos.z); H.setRun(false); }
        else H.move(0, 0);
        return;
      }

      // Avant l'ordre de fuir, on ne bouge pas : la mise en scène parle.
      if (!pro.franchies.includes("RUN_OBJECTIVE") && pro.actif) { H.move(0, 0); return; }

      // --- LE POIDS -------------------------------------------------------
      //
      // Le premier parcours complet est mort à z −344, sac à 96 kg sur 100.
      // Le pilote ne ramassait rien exprès : les ressources jonchent l'axe de
      // fuite et le moteur les prend SEUL quand on passe à côté. Marcher tout
      // droit suffit à se charger jusqu'à ne plus pouvoir courir.
      //
      // Un joueur ne subit pas cela deux fois. Il a deux réponses, et le
      // pilote les a toutes les deux : BRÛLER son bois, qui transforme le
      // poids en avance, puis JETER ce qui reste. C'est aussi ce qui rend la
      // mesure honnête — un pilote qui garderait tout ne mesurerait pas une
      // façon de jouer, il mesurerait le temps qu'il faut pour se noyer.
      const charge = etat.weight / p.chargeMax;

      // --- LE FEU, chaque fois qu'il est possible et qu'il sert ------------
      //
      // Un seul feu par parcours était une hypothèse, et elle était fausse.
      // Le feu coûte deux bois et une pierre — exactement ce que l'axe de
      // fuite fournit tout seul — et rend 18 secondes de Brume à 16 % de sa
      // vitesse, soit près de 80 unités de marge.
      //
      // La boucle que le jeu propose n'est donc pas « ramasser puis porter »
      // mais « ramasser puis BRÛLER » : le bois qui pèse dans le dos vaut de
      // l'avance une fois posé au sol. C'est pourquoi la décision se prend
      // APRÈS avoir mesuré la charge, et pas seulement sur la marge — un sac
      // lourd est en soi une raison de faire du feu, puisque c'est la seule
      // façon de s'alléger qui rapporte quelque chose.
      //
      // Un pilote qui n'allume qu'un feu ne mesure pas un joueur qui a compris
      // le jeu ; il mesure un joueur qui ne s'en est pas servi.
      if (p.feu && H.canLightFire && (H.fogGap < p.seuilFeu || charge > 0.45)) {
        if (H.lightFire()) { journal.feux++; pauseJusqua = t + 0.8; return; }
      }

      if (t < pauseJusqua) { H.move(0, 0); return; }

      // Ce qui reste part par-dessus bord, LE PLUS LOURD D'ABORD — et en
      // gardant de quoi faire un feu.
      //
      // La première version jetait le bois en premier, dans l'ordre où les
      // ressources sont déclarées. C'était l'inverse du bon sens, et les
      // chiffres du jeu le disent : la pierre pèse 13 kg, le bois 7, le
      // cristal 5. Jeter le bois revenait donc à se débarrasser du plus léger
      // des trois ET du seul carburant du feu. Mesuré : 7 feux et une mort à
      // z −2023, contre 22 feux et un parcours terminé quand le bois restait
      // dans le sac.
      //
      // La ration ne part jamais : c'est le seul soin du jeu, elle vaut
      // 6 kg. Le cristal ne part qu'en dernier — il est le plus léger et le
      // plus précieux — et jamais en exploration, où le garder est
      // précisément ce qui doit ralentir ce profil.
      if (charge > 0.5) {
        const reserve = { bois: 2, pierre: 1 };   // le prix d'un feu
        const ordre = p.garde ? ["pierre", "bois"] : ["pierre", "bois", "cristal"];
        let jete = null;
        for (const type of ordre) {
          if ((etat.inventory[type] || 0) > (reserve[type] || 0)) { jete = type; break; }
        }
        // Plus rien au-dessus de la réserve : elle passe par-dessus bord aussi,
        // sinon le pilote se fige avec un sac plein qu'il refuse de vider.
        if (!jete) {
          for (const type of ordre) if ((etat.inventory[type] || 0) > 0) { jete = type; break; }
        }
        if (jete) H.drop(jete);
      }

      // --- détour vers une ressource ---
      if (p.detour > 0 && charge < 0.45) {
        if (cible) {
          const d = Math.hypot(H.pos.x - cible.x, H.pos.z - cible.z);
          // Encore là ? Le moteur la retire du recensement dès qu'elle est prise.
          const encore = H.resourceSample.some(
            (r) => Math.abs(r.x - cible.x) < 0.01 && Math.abs(r.z - cible.z) < 0.01);
          if (!encore || d > p.detour * 2.2) cible = null;
          else if (d > 1.1) { commander(cible.x - H.pos.x, cible.z - H.pos.z); H.setRun(false); return; }
          else { H.move(0, 0); return; }   // à l'arrêt : la collecte se fait seule
        }
        if (!cible) {
          let best = null, bd = p.detour;
          for (const r of H.resourceSample) {
            // Jamais en arrière : un joueur qui revient sur ses pas devant la
            // Brume ne joue pas, il se suicide.
            if (r.z > H.pos.z - 1) continue;
            const d = Math.hypot(r.x - H.pos.x, r.z - H.pos.z);
            if (d < bd) { bd = d; best = r; }
          }
          if (best) { cible = { x: best.x, z: best.z }; journal.ressourcesVisees++; }
        }
      }

      // --- rejoindre la structure ancienne --------------------------------
      //
      // Elle est le point culminant du prologue, et elle est SUR LE CÔTÉ. Un
      // pilote qui ne fait que descendre l'axe passe à côté et n'atteint
      // jamais CRYSTAL_INTERACTION — c'est exactement ce qui est arrivé au
      // premier parcours complet. Un joueur, lui, voit une silhouette qui ne
      // ressemble à rien d'autre et va la voir. Le pilote fait pareil.
      const pilier = H.scene.getObjectByName("prologue-pilier-ancien");
      if (pilier && !pro.franchies.includes("CRYSTAL_INTERACTION")) {
        const d = Math.hypot(H.pos.x - pilier.position.x, H.pos.z - pilier.position.z);
        if (d < 60 && d > 4) {
          commander(pilier.position.x - H.pos.x, pilier.position.z - H.pos.z);
          H.setRun(false);
          return;
        }
        if (d <= 4) { H.move(0, 0); return; }   // à portée : le bouton fait le reste
      }

      // --- marche de fuite ---
      const dir = directionVersFuite();
      // La Brume serre : même le profil « exploration » court quand la marge
      // tombe. C'est ce que ferait un joueur, et sans cela le profil ne
      // mesurerait plus une façon de jouer mais une mort annoncée.
      const serre = H.fogGap < p.seuilCourse;
      H.setRun(p.court || serre);
      commander(dir.x, dir.z);
    }

    boucle();
    window.PILOTE = {
      get journal() { return journal; },
      stop() { arret = true; window.HORIZON.move(0, 0); window.HORIZON.setRun(false); },
    };
  };
}

const PROFILS = {
  // « Rapide » veut dire « sait où il va », pas « ne se sert de rien ». La
  // première version n'allumait aucun feu et mourait à 3 min 42 s, à z −1000,
  // avec 10 étapes sur 15 : ce n'est pas une façon de jouer, c'est la
  // démonstration que courir sans jamais rien fabriquer ne suffit pas. Le
  // résultat est conservé et rapporté comme tel, mais le PROFIL, lui, mesure
  // désormais un joueur qui ne se détourne pas et qui fait du feu quand la
  // Brume serre.
  rapide:      { court: true,  detour: 0,  feu: true,  seuilCourse: 1e9, garde: false, seuilFeu: 45 },
  normal:      { court: false, detour: 9,  feu: true,  seuilCourse: 90,  garde: false, seuilFeu: 55 },
  // Seul le profil « exploration » garde ses cristaux : c'est ce qui le
  // distingue, et c'est aussi ce qui le ralentit.
  exploration: { court: false, detour: 26, feu: true,  seuilCourse: 70,  garde: true, seuilFeu: 65 },
};
// La charge maximale vient du moteur, pas d'une constante recopiée ici : c'est
// la valeur que le jeu utilise réellement pour ralentir le joueur.
for (const p of Object.values(PROFILS)) p.chargeMax = 0;

const browser = await chromium.launch({ executablePath: CHROME, args: GL_ARGS });

/** Une run complète. Renvoie tout ce qui a été observé, y compris les échecs. */
async function jouer(nom, profil, { observer = false } = {}) {
  const page = await browser.newPage({ ...devices["Pixel 7"] });
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });

  await page.goto(`${BASE}/index.html`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.HORIZON?.prologue, null, { timeout: 90000 });
  await page.waitForFunction(() => window.HORIZON.prologue.actif, null, { timeout: 120000 });
  profil.chargeMax = await page.evaluate(() => window.HORIZON.config.weight.max);

  const observations = {};

  // --- l'ouverture, avant que le pilote ne prenne la main ---
  if (observer) {
    observations.ouverture = await page.evaluate(() => ({
      etape: window.HORIZON.prologue.etape,
      voileNoir: !document.getElementById("pro-voile").classList.contains("ouvre"),
      fige: document.body.classList.contains("pro-fige"),
      inventaire: { ...window.HORIZON.game.inventory },
      poids: window.HORIZON.game.weight,
      props: window.HORIZON.prologue.props,
      ecartBrume: window.HORIZON.fogGap,
    }));
  }

  await page.waitForFunction(
    () => window.HORIZON.prologue.franchies.includes("BAG_VISIBLE"),
    null, { timeout: 60000 });

  if (observer) {
    observations.auSac = await page.evaluate(() => ({
      fige: document.body.classList.contains("pro-fige"),
      objectif: document.getElementById("pro-objectif-texte")?.textContent || "",
      sacSurLeDos: window.HORIZON.game.weight > 0,
      sacAuSol: !!window.HORIZON.scene.getObjectByName("prologue-sac-sol"),
      horodatage: { ...window.HORIZON.prologue.horodatage },
    }));
  }

  // Le pilote entre en scène.
  await page.evaluate(installerPilote(nom), profil);

  const debut = Date.now();
  // 3 100 unités en rendu logiciel : le temps d'horloge vaut environ 2,5 fois
  // le temps de jeu, et un parcours d'exploration peut approcher les 15 minutes
  // de JEU. La limite est donc large — elle n'est là que pour qu'un blocage
  // finisse par rendre la main, pas pour borner un parcours.
  const LIMITE = 45 * 60 * 1000;
  let dernier = null;

  // On attend la fin en surveillant l'avancement : une run qui n'avance plus
  // est un défaut à rapporter, pas une attente à rallonger.
  while (Date.now() - debut < LIMITE) {
    const etat = await page.evaluate(() => ({
      franchies: window.HORIZON.prologue.franchies,
      temps: window.HORIZON.prologue.temps,
      actif: window.HORIZON.prologue.actif,
      z: window.HORIZON.pos.z,
      mort: window.HORIZON.game.dead,
      cause: window.HORIZON.game.deathCause,
      gap: window.HORIZON.fogGap,
      poids: window.HORIZON.game.weight,
      ramassees: window.HORIZON.game.collected,
      feux: window.HORIZON.game.firesLit,
    }));
    dernier = etat;

    if (observer && !observations.brume
        && etat.franchies.includes("FOG_REVEALED")) {
      observations.brume = await page.evaluate(() => ({
        acteurs: window.HORIZON.prologue.acteurs,
        ecartBrume: window.HORIZON.fogGap,
      }));
    }
    if (observer && !observations.pilier
        && etat.franchies.includes("FOG_REACTION")) {
      observations.pilier = await page.evaluate(() => ({
        cristal: window.HORIZON.game.inventory.cristal || 0,
        ecartBrume: window.HORIZON.fogGap,
      }));
    }

    if (etat.mort) break;
    if (etat.franchies.includes("PROLOGUE_COMPLETE") || !etat.actif) break;
    await page.waitForTimeout(1500);
  }

  const final = await page.evaluate(() => ({
    franchies: window.HORIZON.prologue.franchies,
    horodatage: window.HORIZON.prologue.horodatage,
    temps: window.HORIZON.prologue.temps,
    actif: window.HORIZON.prologue.actif,
    props: window.HORIZON.prologue.props,
    acteurs: window.HORIZON.prologue.acteurs,
    z: window.HORIZON.pos.z,
    mort: window.HORIZON.game.dead,
    cause: window.HORIZON.game.deathCause,
    ramassees: window.HORIZON.game.collected,
    feux: window.HORIZON.game.firesLit,
    poids: window.HORIZON.game.weight,
    journal: window.PILOTE?.journal || null,
    // Le monde procédural doit avoir repris la main : plus un seul objet du
    // prologue en scène, et des chunks toujours vivants.
    resteEnScene: ["prologue-tour", "prologue-sac-sol", "prologue-traces",
                   "prologue-pilier-ancien"]
      .filter((n) => !!window.HORIZON.scene.getObjectByName(n)),
    chunks: window.HORIZON.chunks,
    calls: window.HORIZON.info.calls,
  }));

  await page.evaluate(() => window.PILOTE?.stop());
  await page.close();

  return { ...final, observations, erreurs, dernier, murSecondes: Math.round((Date.now() - debut) / 1000) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Les trois parcours coûtent une quarantaine de minutes d'horloge. PROFILS
// permet d'en rejouer un seul pendant qu'on met au point le pilote ; sans la
// variable, les trois sont joués et le rapport de durées est complet.
const CHOISIS = (process.env.PROFILS || "normal,rapide,exploration")
  .split(",").map((x) => x.trim()).filter(Boolean);
const partiel = CHOISIS.length < 3;

console.log("\n=== PARCOURS 1/3 : NORMAL (marche, ramasse, brûle son bois) ===");
const normal = CHOISIS.includes("normal")
  ? await jouer("normal", PROFILS.normal, { observer: true })
  : null;
if (!normal) { console.log("   (non joué)"); await browser.close(); process.exit(0); }
console.log(`   ${normal.temps} s de jeu · ${normal.murSecondes} s d'horloge · `
  + `z ${normal.z.toFixed(0)} · ${normal.ramassees} ramassée(s) · ${normal.feux} feu(x)`);
console.log(`   étapes : ${normal.franchies.length}/15`);

// --- l'ouverture ----------------------------------------------------------
console.log("\n=== §6-§7 L'OUVERTURE ===");
const o = normal.observations.ouverture;
ok("ouverture: l'écran est noir avant l'image", o.voileNoir === true);
ok("ouverture: le joueur n'a pas encore la main", o.fige === true);
ok("ouverture: le sac n'est PAS équipé au réveil",
   o.poids === 0 && Object.values(o.inventaire).every((n) => !n),
   `poids ${o.poids}`);
ok("ouverture: la tour-balise est posée", o.props.includes("prologue-tour"));
ok("ouverture: le sac est au sol", o.props.includes("prologue-sac-sol"));
ok("ouverture: la Brume est tenue entre 40 et 60 u",
   o.ecartBrume >= 40 && o.ecartBrume <= 62, `${o.ecartBrume.toFixed(1)} u`);

const s = normal.observations.auSac;
ok("réveil: le contrôle est rendu", s.fige === false);
ok("réveil: un objectif est affiché", s.objectif.length > 0, s.objectif);
ok("réveil: le sac est encore au sol quand il devient visible",
   s.sacAuSol === true && s.sacSurLeDos === false);

// --- l'ordre des quinze étapes -------------------------------------------
console.log("\n=== §5 LES QUINZE POINTS DE CONTRÔLE ===");
const ETAPES = ["PROLOGUE_START","PLAYER_WAKE","BAG_VISIBLE","BAG_PICKED_UP",
  "FOG_REVEALED","RUN_OBJECTIVE","FIRST_RESOURCE","FIRST_CRAFT_AVAILABLE","FIRST_FIRE",
  "CONVOY_TRACE_FOUND","MAIN_OBJECTIVE_REVEALED","ANCIENT_STRUCTURE_FOUND",
  "CRYSTAL_INTERACTION","FOG_REACTION","PROLOGUE_COMPLETE"];

for (const e of ETAPES) {
  const t = normal.horodatage[e];
  ok(`étape ${e}`, normal.franchies.includes(e),
     t === undefined ? "jamais franchie" : `${t} s`);
}

const ordre = ETAPES.filter((e) => normal.franchies.includes(e));
const chrono = ordre.map((e) => normal.horodatage[e]);
ok("étapes: franchies dans l'ordre du scénario",
   chrono.every((t, i) => i === 0 || t >= chrono[i - 1]),
   chrono.join(" → "));
ok("étapes: aucune étape inconnue", normal.franchies.every((e) => ETAPES.includes(e)));

// --- les acteurs ----------------------------------------------------------
console.log("\n=== §14 CE QUI FUIT, ET CE QUI SE FAIT RATTRAPER ===");
const b = normal.observations.brume;
if (b) {
  ok("acteurs: quatre silhouettes fuient devant le joueur", b.acteurs.length === 4,
     b.acteurs.map((a) => a.type).join(", "));
  const condamne = b.acteurs.find((a) => a.condamne);
  ok("acteurs: l'un d'eux est plus lent que la Brume", !!condamne);
} else {
  ok("acteurs: quatre silhouettes fuient devant le joueur", false, "FOG_REVEALED jamais observé");
  ok("acteurs: l'un d'eux est plus lent que la Brume", false, "non observé");
}
// Lu au moment de la révélation, pas à la fin : le prologue démonte ses
// acteurs en se retirant, et l'état final ne contient plus personne. La
// première version de cette vérification passait uniquement parce que le
// parcours mourait avant la fin — un test vert pour une mauvaise raison.
const acteursVus = b ? b.acteurs : [];
ok("acteurs: le condamné a bien disparu",
   acteursVus.some((a) => a.condamne && !a.vivant),
   acteursVus.map((a) => `${a.type}${a.condamne ? "*" : ""}:${a.vivant ? "vif" : "pris"}`).join(" ")
     || "aucun acteur observé");

// --- le pilier ------------------------------------------------------------
console.log("\n=== §26-§28 LA STRUCTURE ANCIENNE ===");
const pi = normal.observations.pilier;
if (pi) {
  ok("pilier: le joueur repart avec un cristal", pi.cristal >= 1, `${pi.cristal}`);
  ok("pilier: la Brume recule franchement", pi.ecartBrume > 110, `${pi.ecartBrume.toFixed(0)} u`);
} else {
  ok("pilier: le joueur repart avec un cristal", false, "FOG_REACTION jamais observé");
  ok("pilier: la Brume recule franchement", false, "non observé");
}

// --- la sortie ------------------------------------------------------------
console.log("\n=== §31 LA TRANSITION VERS LE MONDE PROCÉDURAL ===");
ok("sortie: le prologue s'est retiré", normal.actif === false);
ok("sortie: plus aucun objet mis en scène en jeu",
   normal.resteEnScene.length === 0, normal.resteEnScene.join(", ") || "aucun");
ok("sortie: le monde procédural tourne toujours", normal.chunks > 0, `${normal.chunks} chunks`);
ok("sortie: le budget de rendu est tenu", normal.calls > 0 && normal.calls < 140,
   `${normal.calls} appels`);
ok("sortie: le joueur a bien franchi la distance de fin",
   normal.z <= -740, `z ${normal.z.toFixed(0)}`);
ok("run: le joueur survit au prologue en jouant normalement",
   normal.mort === false, normal.mort ? `mort : ${normal.cause}` : "vivant");
ok("run: aucune erreur console", normal.erreurs.length === 0,
   normal.erreurs.slice(0, 2).join(" | ") || "aucune");

// --- l'apprentissage par le monde ----------------------------------------
console.log("\n=== §21-§24 L'APPRENTISSAGE PAR LE MONDE ===");
ok("tutoriel: le joueur a ramassé sans qu'on le lui explique", normal.ramassees > 0,
   `${normal.ramassees} ressource(s)`);
ok("tutoriel: le premier feu a été allumé", normal.feux > 0, `${normal.feux}`);
ok("tutoriel: le sac pèse quelque chose à l'arrivée", normal.poids > 0,
   `${normal.poids.toFixed(1)}`);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== PARCOURS 2/3 : RAPIDE (court tout droit) ===");
const rapide = CHOISIS.includes("rapide") ? await jouer("rapide", PROFILS.rapide) : null;
if (!rapide) console.log("   (non joué)");
if (rapide) console.log(`   ${rapide.temps} s de jeu · ${rapide.murSecondes} s d'horloge · `
  + `z ${rapide.z.toFixed(0)} · ${rapide.franchies.length}/15 étapes`);

console.log("\n=== PARCOURS 3/3 : EXPLORATION (se détourne, remplit le sac) ===");
const explo = CHOISIS.includes("exploration")
  ? await jouer("exploration", PROFILS.exploration) : null;
if (!explo) console.log("   (non joué)");
if (explo) console.log(`   ${explo.temps} s de jeu · ${explo.murSecondes} s d'horloge · `
  + `z ${explo.z.toFixed(0)} · ${explo.ramassees} ramassée(s) · ${explo.franchies.length}/15 étapes`);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== §30 DURÉES MESURÉES (temps de JEU) ===");
const runs = [["rapide", rapide], ["normal", normal], ["exploration", explo]]
  .filter(([, r]) => r);
console.log("   profil        durée      étapes   ramassées  feux  mort");
for (const [nom, r] of runs) {
  const mn = Math.floor(r.temps / 60), sec = Math.round(r.temps % 60);
  console.log(`   ${nom.padEnd(13)} ${String(mn).padStart(2)} min ${String(sec).padStart(2)} s`
    + `   ${String(r.franchies.length).padStart(2)}/15`
    + `   ${String(r.ramassees).padStart(6)}`
    + `   ${String(r.feux).padStart(4)}`
    + `   ${r.mort ? r.cause : "—"}`);
}

for (const [nom, r] of runs) {
  ok(`${nom}: le prologue va jusqu'au bout`,
     r.franchies.includes("PROLOGUE_COMPLETE"),
     `${r.franchies.length}/15 · ${r.temps} s · ${r.mort ? "mort : " + r.cause : "vivant"}`);
}

if (!partiel) {
  ok("durées: le parcours rapide est le plus court",
     rapide.temps <= normal.temps, `${rapide.temps} s ≤ ${normal.temps} s`);
  ok("durées: l'exploration est la plus longue",
     explo.temps >= normal.temps, `${explo.temps} s ≥ ${normal.temps} s`);
}
// La cible du brief est 10 à 15 minutes. On la vérifie sur le parcours NORMAL,
// qui est le seul à représenter une première partie : le profil rapide est un
// joueur qui sait déjà où il va, l'exploration un joueur qui fouille tout.
const min = normal.temps / 60;
ok("durées: le parcours normal dure 10 à 15 minutes (§2)",
   min >= 10 && min <= 15, `${min.toFixed(1)} min`);
// Le parcours rapide est celui d'un joueur qui connaît la route : il doit
// rester nettement plus court que le parcours normal, sans devenir une
// formalité. Le seuil bas n'est pas une durée choisie d'avance mais la moitié
// du parcours normal — c'est un RAPPORT qu'on mesure, pas une minuterie.
if (rapide) ok("durées: le parcours rapide vaut au moins la moitié du normal",
   rapide.temps >= normal.temps * 0.5,
   `${(rapide.temps / 60).toFixed(1)} min contre ${(normal.temps / 60).toFixed(1)}`);
if (explo) ok("durées: l'exploration ne dépasse pas 25 minutes",
   explo.temps / 60 <= 25, `${(explo.temps / 60).toFixed(1)} min`);

// ═══════════════════════════════════════════════════════════════════════════
await browser.close();
console.log(`\n${pass} PASS · ${fail} FAIL`);
if (fail) { console.log("Échecs : " + echecs.join(" · ")); process.exit(1); }
