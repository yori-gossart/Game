/**
 * FOG NOMAD 0.5 — simulation d'équilibrage.
 *
 * CE QUE CECI EST : un modèle numérique de quatre façons de jouer, branché sur
 * la VRAIE configuration (`CONFIG`, `speedFromWeight`, `fogSpeedAt` sont
 * importés, pas recopiés). Il sert à repérer un équilibre absurde — une run de
 * 40 secondes, une run infinie, un cristal jamais trouvé.
 *
 * CE QUE CECI N'EST PAS : une preuve que le jeu est intéressant. Un modèle ne
 * prend pas de décision, n'hésite pas, ne se lasse pas. Aucune conclusion sur
 * le plaisir de jeu ne peut en sortir.
 */
import { CONFIG, speedFromWeight, fogSpeedAt, bandFor } from "../fognomad.mjs";

// Doivent refléter main.mjs. Le test browser tests/balance05.mjs vérifie que
// ces valeurs correspondent encore à celles du moteur.
export const ENGINE = { playerSpeed: 6.2, runMultiplier: 1.8, chunkSize: 32 };

// Densité de ressources mesurée en scène : ~1,5 pose par chunk de 32×32.
const DENSITE = 1.5 / (ENGINE.chunkSize * ENGINE.chunkSize);

// Part de chaque type dans les poses, mesurée sur 4 seeds × 3 axes × 100 chunks.
const PART = { bois: 0.351, pierre: 0.584, cristal: 0.065 };

/**
 * Un profil décrit une politique, pas un scénario scripté.
 *
 *  vision       : écart latéral jusqu'auquel le joueur accepte de dévier
 *  detour       : part du temps réellement passée en trajectoire déviée
 *  chargeCible  : au-delà, le joueur jette ce qu'il a de moins précieux
 *  sprint       : fraction du temps où il sprinte quand il a du souffle
 *  seuilCristal : marge en dessous de laquelle il consomme un cristal
 *
 * Le coût d'un détour n'est PAS un aller-retour perpendiculaire : la ressource
 * est devant et sur le côté, donc le joueur avance en diagonale et continue de
 * progresser en Z. Le coût réel est la perte de progression frontale,
 * cos(atan(vision / PORTEE_VUE)), plus l'arrêt de collecte. Modéliser un
 * aller-retour perpendiculaire donnait un profil GOURMAND mort en 1 min 40,
 * ce qui décrivait le modèle et non le jeu.
 */
const PORTEE_VUE = 35;   // à quelle distance devant soi on repère une ressource

export const PROFILS = {
  PRUDENT:  { vision: 4,  detour: 0.15, chargeCible: 25, sprint: 0.00, seuilCristal: 20 },
  NORMAL:   { vision: 12, detour: 0.40, chargeCible: 55, sprint: 0.12, seuilCristal: 30 },
  GOURMAND: { vision: 24, detour: 0.55, chargeCible: 92, sprint: 0.20, seuilCristal: 45 },
  SPRINTER: { vision: 8,  detour: 0.20, chargeCible: 30, sprint: 0.80, seuilCristal: 25 }
};

export function simuler(nomProfil, { seed = 1, dt = 0.25, limite = 3600 } = {}) {
  const p = PROFILS[nomProfil];

  // Générateur reproductible : deux exécutions du même profil et de la même
  // seed doivent donner exactement le même résultat.
  let rng = seed >>> 0;
  const rand = () => {
    rng = (Math.imul(rng ^ (rng >>> 15), 2246822519) + 374761393) >>> 0;
    return (rng >>> 8) / 16777216;
  };

  const etat = {
    t: 0, distance: 0, gap: CONFIG.fog.startDistance,
    poids: 0, souffle: CONFIG.stamina.max, vie: CONFIG.player.maxHealth,
    inv: { bois: 0, pierre: 0, cristal: 0 },
    ramassees: 0, jetees: 0, cristauxUtilises: 0, cristauxTrouves: 0, feux: 0,
    gapSomme: 0, gapN: 0, gapMax: CONFIG.fog.startDistance,
    poidsSomme: 0, poidsMax: 0,
    bandes: { critique: 0, tension: 0, confortable: 0, avance: 0, exceptionnel: 0 },
    cause: "—"
  };

  let feuRestant = 0;
  let depuisSprint = CONFIG.stamina.regenDelay;   // le délai de récupération compte

  while (etat.t < limite) {
    const charge = etat.poids / CONFIG.weight.max;
    const facteur = speedFromWeight(charge);

    // Progression frontale perdue à force de zigzaguer vers les ressources.
    const angle = Math.atan(p.vision / PORTEE_VUE);
    const avance = 1 - p.detour * (1 - Math.cos(angle));

    // --- sprint -----------------------------------------------------------
    const veutSprinter = p.sprint > 0 && rand() < p.sprint &&
                         etat.souffle > CONFIG.stamina.minToStart;
    let vitesse = ENGINE.playerSpeed * facteur * avance;

    if (veutSprinter) {
      vitesse *= ENGINE.runMultiplier;
      etat.souffle = Math.max(0, etat.souffle -
        (CONFIG.stamina.drainBase + CONFIG.stamina.drainPerWeight * charge) * dt);
      depuisSprint = 0;
    } else {
      // Le souffle ne repart qu'après `regenDelay`. L'ignorer surestimait
      // fortement le régime d'alternance sprint/marche soutenable.
      depuisSprint += dt;
      if (depuisSprint >= CONFIG.stamina.regenDelay) {
        etat.souffle = Math.min(CONFIG.stamina.max, etat.souffle + CONFIG.stamina.regen * dt);
      }
    }

    // --- collecte ---------------------------------------------------------
    // Occasions rencontrées : densité × largeur explorée × distance parcourue.
    const largeur = CONFIG.collect.radius * 2 + p.vision;
    const occasions = DENSITE * largeur * vitesse * dt;

    if (rand() < occasions) {
      const tirage = rand();
      const type = tirage < PART.cristal ? "cristal"
                 : tirage < PART.cristal + PART.pierre ? "pierre" : "bois";

      if (type === "cristal") etat.cristauxTrouves++;

      const poidsType = CONFIG.resources[type].weight;
      if (etat.poids + poidsType <= p.chargeCible) {
        etat.inv[type]++;
        etat.poids += poidsType;
        etat.ramassees++;
        // L'arrêt de collecte, lui, est un vrai arrêt : la brume avance
        // pendant que le joueur ne progresse pas.
        const perte = CONFIG.collect.duration;
        etat.gap -= fogSpeedAt(etat.t) * perte;
        etat.t += perte;
      }
    }

    // --- jeter ------------------------------------------------------------
    // Deux raisons de jeter : la charge dépasse ce que le profil accepte, ou
    // la brume est trop proche pour continuer à porter. La seconde est la
    // mécanique centrale du jeu — un modèle qui ne la simule pas ne dit rien
    // d'utile sur un profil gourmand.
    const enDanger = etat.gap < 30;
    const seuil = enDanger ? Math.min(p.chargeCible, 20) : p.chargeCible;

    while (etat.poids > seuil) {
      // On lâche d'abord le plus lourd par unité de valeur : la pierre, puis
      // le bois, et le cristal en tout dernier.
      const type = ["pierre", "bois", "cristal"].find((t) => etat.inv[t] > 0);
      if (!type) break;
      etat.inv[type]--;
      etat.poids -= CONFIG.resources[type].weight;
      etat.jetees++;
    }

    // --- feu de répit -----------------------------------------------------
    const peutFeu = Object.entries(CONFIG.fire.cost)
      .every(([k, n]) => etat.inv[k] >= n);
    if (feuRestant <= 0 && peutFeu && etat.gap < 45) {
      for (const [k, n] of Object.entries(CONFIG.fire.cost)) {
        etat.inv[k] -= n;
        etat.poids -= CONFIG.resources[k].weight * n;
      }
      feuRestant = CONFIG.fire.duration;
      etat.feux++;
      etat.souffle = CONFIG.stamina.max;
    }

    // --- cristal ----------------------------------------------------------
    if (etat.gap < p.seuilCristal && etat.inv.cristal > 0) {
      etat.inv.cristal--;
      etat.poids -= CONFIG.resources.cristal.weight;
      etat.gap += CONFIG.crystal.pushDistance;
      etat.cristauxUtilises++;
    }

    // --- brume ------------------------------------------------------------
    const vBrume = fogSpeedAt(etat.t) * (feuRestant > 0 ? CONFIG.fire.fogSlowFactor : 1);
    feuRestant = Math.max(0, feuRestant - dt);

    etat.gap += (vitesse - vBrume) * dt;
    etat.distance += vitesse * dt;
    etat.t += dt;

    etat.gapSomme += Math.max(0, etat.gap) * dt;
    etat.gapN += dt;
    etat.gapMax = Math.max(etat.gapMax, etat.gap);
    etat.poidsSomme += etat.poids * dt;
    etat.poidsMax = Math.max(etat.poidsMax, etat.poids);
    if (etat.gap > 0) etat.bandes[bandFor(etat.gap)] += dt;

    // --- dégâts -----------------------------------------------------------
    if (etat.gap <= 0) {
      etat.vie -= CONFIG.fog.damagePerSecond * dt;
      if (etat.vie <= 0) { etat.cause = "Rattrapé par la brume"; break; }
    } else if (etat.vie < CONFIG.player.maxHealth) {
      // Pas de régénération dans le jeu : une fois entamée, la vie ne remonte
      // pas. Le modèle doit refléter cela, sinon il surestime la survie.
    }
  }

  if (etat.cause === "—") etat.cause = "limite de simulation atteinte";

  const valeur = Object.entries(etat.inv)
    .reduce((s, [k, n]) => s + n * CONFIG.resources[k].value, 0);

  return {
    profil: nomProfil,
    duree: +(etat.t / 60).toFixed(1),
    distance: Math.round(etat.distance),
    ramassees: etat.ramassees,
    jetees: etat.jetees,
    valeur,
    cristauxTrouves: etat.cristauxTrouves,
    cristauxUtilises: etat.cristauxUtilises,
    feux: etat.feux,
    gapMoyen: Math.round(etat.gapSomme / Math.max(1, etat.gapN)),
    gapMax: Math.round(etat.gapMax),
    poidsMoyen: Math.round(etat.poidsSomme / Math.max(1, etat.gapN)),
    poidsMax: Math.round(etat.poidsMax),
    bandes: Object.fromEntries(
      Object.entries(etat.bandes).map(([k, v]) => [k, Math.round(100 * v / Math.max(1, etat.gapN)) + "%"])
    ),
    cause: etat.cause
  };
}

// Exécution directe : moyenne sur plusieurs seeds, pour ne pas conclure d'un tirage.
if (import.meta.url === `file://${process.argv[1]}`) {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  console.log("profil     durée   dist   ram  jet  val  cris(tr/ut)  gapMoy  gapMax  poidsMoy/max");
  for (const nom of Object.keys(PROFILS)) {
    const runs = SEEDS.map((s) => simuler(nom, { seed: s }));
    const moy = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
    console.log(
      nom.padEnd(10) +
      (moy((r) => r.duree).toFixed(1) + " min").padStart(8) +
      String(Math.round(moy((r) => r.distance))).padStart(7) +
      String(Math.round(moy((r) => r.ramassees))).padStart(6) +
      String(Math.round(moy((r) => r.jetees))).padStart(5) +
      String(Math.round(moy((r) => r.valeur))).padStart(5) +
      `   ${moy((r) => r.cristauxTrouves).toFixed(1)}/${moy((r) => r.cristauxUtilises).toFixed(1)}`.padEnd(13) +
      String(Math.round(moy((r) => r.gapMoyen))).padStart(7) +
      String(Math.round(moy((r) => r.gapMax))).padStart(8) +
      `   ${Math.round(moy((r) => r.poidsMoyen))}/${Math.round(moy((r) => r.poidsMax))}`
    );
  }
  console.log("\nbandes de marge, profil NORMAL :", JSON.stringify(simuler("NORMAL", { seed: 3 }).bandes));
  console.log("\nCes chiffres détectent des équilibres absurdes. Ils ne disent rien du plaisir de jeu.");
}
