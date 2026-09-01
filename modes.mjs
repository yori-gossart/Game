/**
 * FOG NOMAD — MODES DE JEU
 *
 * Un seul mode est jouable : NORMAL. Les deux autres existent pour que le code
 * de gameplay n'ait pas à être réécrit le jour où ils le deviendront.
 *
 * L'intérêt n'est pas d'avoir trois modes aujourd'hui, c'est que les règles
 * cessent d'être des constantes éparpillées. Tout ce qui distinguera un mode
 * d'un autre passe par ici, et par nulle part ailleurs — sans quoi le gameplay
 * se remplirait de `if (mode === ...)` disséminés, ce que le brief interdit
 * explicitement.
 */

export const GAME_MODES = {
  NORMAL: {
    id: "NORMAL",
    nom: "Normal",
    disponible: true,

    // Multiplicateurs appliqués à CONFIG. 1 = valeur de référence.
    fogSpeed: 1,
    fogCreep: 1,
    damage: 1,
    resourceDensity: 1,
    crystalAbundance: 1,

    // La mort termine la run.
    viesSupplementaires: 0,
    // Le sac ralentit fortement le temps, sans l'arrêter.
    bagTimeScale: 0.15
  },

  ENDLESS: {
    id: "ENDLESS",
    nom: "Sans fin",
    // Non jouable : accessible seulement en mode diagnostic.
    disponible: false,

    // La pression plafonne tôt : on joue pour la distance, pas pour survivre
    // à une accélération.
    fogSpeed: 0.9,
    fogCreep: 0.35,
    damage: 1,
    resourceDensity: 1.15,
    crystalAbundance: 1.2,
    viesSupplementaires: 0,
    bagTimeScale: 0.15
  },

  HARDCORE: {
    id: "HARDCORE",
    nom: "Extrême",
    disponible: false,

    fogSpeed: 1.15,
    fogCreep: 2.2,
    damage: 1.6,
    resourceDensity: 0.85,
    crystalAbundance: 0.7,
    viesSupplementaires: 0,
    // Pas de répit : ouvrir le sac ne ralentit presque rien.
    bagTimeScale: 0.6
  }
};

export const MODE_PAR_DEFAUT = "NORMAL";

/**
 * Mode courant. Un seul point de lecture pour tout le jeu.
 *
 * Le mode ne change pas en cours de partie : le changer relance la run, sinon
 * les statistiques d'une run mélangeraient deux jeux de règles.
 */
let courant = GAME_MODES[MODE_PAR_DEFAUT];

export function modeCourant() { return courant; }

export function choisirMode(id, { forcer = false } = {}) {
  const mode = GAME_MODES[id];
  if (!mode) return false;
  if (!mode.disponible && !forcer) return false;
  courant = mode;
  return true;
}

/** Liste des modes proposables au joueur. */
export function modesJouables() {
  return Object.values(GAME_MODES).filter((m) => m.disponible);
}
