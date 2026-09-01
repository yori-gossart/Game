/**
 * FOG NOMAD — DISPOSITION DE L'INTERFACE
 *
 * Les positions des commandes ne sont plus écrites en dur dans la feuille de
 * style : elles vivent ici et sont appliquées en variables CSS.
 *
 * Ce n'est pas un éditeur de HUD, et ce n'en sera pas un aujourd'hui. C'est le
 * minimum pour que déplacer le joystick, passer en mode gaucher ou changer la
 * taille des boutons devienne un changement de données plutôt qu'une reprise
 * du CSS — donc pour que ces fonctions restent possibles plus tard sans tout
 * défaire.
 */

export const UI_DEFAUT = {
  // Toutes les distances sont en pixels CSS, appliquées par-dessus les marges
  // de sécurité de l'appareil (encoche, barre gestuelle).
  joystick: { taille: 132, bas: 28, cote: 16 },
  courir:   { taille: 88,  bas: 34, cote: 20 },
  sac:      { taille: 72,  bas: 132, cote: 20 },
  pouvoirs: { bas: 178, cote: 20 },
  jauges:   { haut: 12, cote: 16 },
  brume:    { haut: 12, cote: 16 },

  // Main directrice. En gaucher, les commandes de gauche et de droite sont
  // échangées — le joystick passe à droite.
  gaucher: false,

  // Échelle globale du HUD, pour les écrans très petits ou très grands.
  echelle: 1
};

const VARIABLES = {
  "--ui-joystick-taille": (u) => `${u.joystick.taille * u.echelle}px`,
  "--ui-joystick-bas": (u) => `${u.joystick.bas}px`,
  "--ui-joystick-cote": (u) => `${u.joystick.cote}px`,
  "--ui-courir-taille": (u) => `${u.courir.taille * u.echelle}px`,
  "--ui-courir-bas": (u) => `${u.courir.bas}px`,
  "--ui-courir-cote": (u) => `${u.courir.cote}px`,
  "--ui-sac-taille": (u) => `${u.sac.taille * u.echelle}px`,
  "--ui-sac-bas": (u) => `${u.sac.bas}px`,
  "--ui-sac-cote": (u) => `${u.sac.cote}px`,
  "--ui-pouvoirs-bas": (u) => `${u.pouvoirs.bas}px`,
  "--ui-pouvoirs-cote": (u) => `${u.pouvoirs.cote}px`,
  "--ui-jauges-haut": (u) => `${u.jauges.haut}px`,
  "--ui-jauges-cote": (u) => `${u.jauges.cote}px`
};

let courant = structuredClone(UI_DEFAUT);

/** Applique la disposition en variables CSS sur la racine du document. */
export function appliquerUI(patch = null) {
  if (patch) courant = { ...courant, ...patch };

  const racine = document.documentElement;
  for (const [nom, calc] of Object.entries(VARIABLES)) {
    racine.style.setProperty(nom, calc(courant));
  }

  // Le mode gaucher est une simple classe : le CSS échange les côtés.
  document.body.classList.toggle("gaucher", !!courant.gaucher);
  return courant;
}

export function dispositionCourante() { return { ...courant }; }
