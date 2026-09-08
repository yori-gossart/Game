/**
 * FOG NOMAD — HABILLAGE DU JOUEUR
 *
 * Remplace le mannequin procédural par le personnage riggé, SANS toucher au
 * reste du moteur. Ce module ne connaît ni le gameplay, ni la brume : on lui
 * donne le groupe `player` déjà construit, il l'habille, et il rend de quoi
 * l'animer.
 *
 * Trois contraintes ont dicté sa forme.
 *
 * 1. LE MANNEQUIN RESTE. Il n'est pas supprimé, il est masqué. Si le glTF ne
 *    charge pas — réseau, fichier absent, GPU qui refuse le skinning — le jeu
 *    doit rester jouable avec ce qu'il sait faire seul. Un jeu qui ne démarre
 *    pas parce qu'un asset manque est un jeu plus fragile qu'avant.
 *
 * 2. LE SAC N'EST PAS REMPLACÉ. Ses cinq paliers marchent depuis la 0.4 et
 *    sont pilotés par `updateBagVisual()` dans fognomad.mjs, en coordonnées
 *    locales au joueur. Le réécrire pour l'accrocher au squelette aurait
 *    demandé de toucher au module de règles pour un gain nul. On le déplace
 *    donc SOUS un os, avec un compensateur qui préserve exactement ses
 *    coordonnées d'origine — voir `poserSocketSac()`.
 *
 * 3. LE PERSONNAGE REGARDE VERS +Z. C'est la convention du mannequin
 *    procédural (« l'avant du personnage est son +Z local »), et tout le
 *    moteur en dépend : `player.rotation.y = atan2(moveX, moveZ)`. Les modèles
 *    KayKit regardent nativement vers −Z, d'où la rotation d'un demi-tour.
 */

import * as THREE from "three";

/** Le personnage du joueur. Capuche : c'est la silhouette du nomade. */
export const CLE_JOUEUR = "nomade_capuche";

/** Os d'accroche du sac. Le torse plutôt que le bassin : un sac porté au dos
    suit la flexion du buste, pas la rotation des hanches. */
const OS_SAC = /^chest$/i;

/**
 * Vitesses de référence du moteur, pour caler la cadence du pas sur la vitesse
 * réelle. Sans ça, un personnage chargé qui avance lentement continue de battre
 * des jambes au rythme d'un pas normal — c'est le « glissement des pieds » que
 * la 0.6 doit supprimer.
 */
const VITESSE_MARCHE = 6.2;
const VITESSE_COURSE = 6.2 * 1.8;

export async function habillerJoueur({ player, assets, log = () => {} }) {
  const paquet = await assets.charger(CLE_JOUEUR);
  if (!paquet) {
    log("Joueur : personnage glTF indisponible, le mannequin procédural reste en place.");
    return null;
  }

  const instance = assets.instancier(CLE_JOUEUR);
  if (!instance) return null;

  const u = player.userData;

  // --- masquage du mannequin -------------------------------------------
  // On masque, on ne supprime pas : le repli doit rester possible à chaud, et
  // `animatePlayer()` écrit encore dans ces objets sans dommage.
  const procedural = [
    u.body, u.basque, u.shoulders, u.head, u.hairCap, u.foulard, u.panFoulard,
    u.cou, u.leftLeg, u.rightLeg, u.leftBoot, u.rightBoot, u.leftArm, u.rightArm,
  ].filter(Boolean);
  for (const m of procedural) m.visible = false;

  // Les sangles appartenaient au mannequin : le personnage riggé a les
  // siennes, et deux jeux superposés donnaient une bosse sur le torse.
  for (const enfant of player.children) {
    if (enfant !== u.bag && !procedural.includes(enfant) && enfant.isMesh) {
      enfant.visible = false;
    }
  }

  // --- pose du personnage ------------------------------------------------
  const corps = instance.objet;
  corps.rotation.y = Math.PI;   // voir la contrainte 3 en tête de fichier
  corps.name = "joueur-gltf";
  player.add(corps);

  const socket = poserSocketSac(player, corps, u.bag, log);

  const animateur = assets.creerAnimateur(instance, { fondu: 0.16 });
  animateur?.jouer("idle");

  log(`Joueur habillé — ${instance.tris} tris, ${instance.parties} parties, `
    + `sac ${socket ? "accroché à l'os « chest »" : "laissé en coordonnées joueur"}.`);

  return {
    corps,
    animateur,
    socket,
    /**
     * Un seul point d'entrée depuis la boucle de jeu. Il décide de l'état ET
     * de la cadence : c'est le couple des deux qui fait qu'un pas « accroche »
     * au sol au lieu de glisser dessus.
     */
    mettreAJour(delta, { avance, sprint, vitesse }) {
      if (!animateur) return null;

      const etat = !avance ? "idle" : sprint ? "course" : "marche";
      animateur.jouer(etat);

      if (etat === "idle") animateur.vitesse(1);
      else {
        // La cadence suit la vitesse réelle, bornée : sous 0,55 le pas devient
        // une reptation, au-dessus de 1,45 il vibre.
        const reference = etat === "course" ? VITESSE_COURSE : VITESSE_MARCHE;
        const r = vitesse / reference;
        animateur.vitesse(Math.max(0.55, Math.min(1.45, r)));
      }

      animateur.update(delta);
      return etat;
    },
    /** Repli à chaud : rend la main au mannequin procédural. */
    retirer() {
      animateur?.liberer();
      corps.removeFromParent();
      for (const m of procedural) m.visible = true;
      if (socket && u.bag) {
        player.add(u.bag);      // Object3D.add retire d'abord de l'ancien parent
      }
    },
  };
}

/**
 * Accroche le sac à un os, sans changer ses coordonnées.
 *
 * Le problème : `updateBagVisual()` écrit des positions ABSOLUES en espace
 * joueur (y ≈ 1,36, z ≈ −0,4). Reparenter le sac sous un os ferait lire ces
 * mêmes nombres dans l'espace de l'os, et le sac partirait à un mètre du dos.
 *
 * La solution : un compensateur intercalé, dont la matrice vaut la transformée
 * qui envoie l'espace du joueur sur l'espace de l'os, figée à la pose de
 * repos. Le sac garde alors ses coordonnées d'origine ET suit le torse.
 *
 * Renvoie null si l'os est introuvable — le sac reste alors sous le joueur,
 * ce qui est le comportement de la 0.5 et n'a rien de cassé.
 */
function poserSocketSac(player, corps, sac, log) {
  if (!sac) return null;

  let os = null;
  corps.traverse((o) => { if (!os && o.isBone && OS_SAC.test(o.name)) os = o; });
  if (!os) {
    log(`Joueur : aucun os « chest » trouvé, le sac reste en coordonnées joueur.`);
    return null;
  }

  // Les matrices monde ne valent quelque chose qu'une fois la scène à jour.
  player.updateWorldMatrix(true, true);

  const compensateur = new THREE.Object3D();
  compensateur.name = "socket-sac";
  compensateur.matrixAutoUpdate = false;
  compensateur.matrix
    .copy(os.matrixWorld).invert()
    .multiply(player.matrixWorld);

  os.add(compensateur);
  compensateur.add(sac);      // retire le sac de `player` au passage
  return compensateur;
}
