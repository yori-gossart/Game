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
 * 3. LE MODÈLE N'EST PAS TOURNÉ. Le moteur oriente déjà le groupe `player`
 *    avec `rotation.y = atan2(moveX, moveZ)`, ce qui met son +Z local dans la
 *    direction de marche ; et l'avant natif des modèles KayKit est DÉJÀ leur
 *    +Z. Toute rotation ajoutée ici s'empile sur celle du moteur.
 *
 *    La 0.6 appliquait un demi-tour « pour que le personnage regarde la
 *    caméra », réglé sur le banc d'essai où le modèle n'a pas de parent tourné.
 *    En jeu, ce demi-tour s'ajoutait aux 180° du groupe joueur : le total
 *    revenait à zéro et le personnage marchait À RECULONS, face à la caméra.
 *    Signalé sur appareil, confirmé par capture d'écran.
 *
 *    La valeur est donc établie par l'image, pas par le raisonnement — c'est
 *    la troisième fois dans ce projet qu'un raisonnement d'orientation se
 *    trompe et qu'une capture tranche.
 */

import * as THREE from "three";
import { ORIENTATION_MODELE } from "./assetmanager.mjs";

/** Le personnage du joueur. Capuche : c'est la silhouette du nomade. */
export const CLE_JOUEUR = "nomade_capuche";

/** Os d'accroche du sac. Le torse plutôt que le bassin : un sac porté au dos
    suit la flexion du buste, pas la rotation des hanches. */
const OS_SAC = /^chest$/i;


/**
 * Part de la largeur du torse que le sac occupe À VIDE.
 *
 * Il ne faut pas lire ce nombre comme la taille finale : `updateBagVisual()`
 * fait encore grossir le sac de 32 % en largeur et de 44 % en hauteur au
 * dernier palier de charge. À 0,62 le sac chargé était aussi haut que le
 * buste et effaçait la silhouette — exactement ce que ART_DIRECTION_0.6.md
 * interdit. 0,50 laisse la charge se voir sans faire disparaître le nomade.
 */
const LARGEUR_SAC_RELATIVE = 0.50;

/** Recul du sac derrière la surface du dos, en fraction de sa propre épaisseur. */
const RECUL_SAC = 0.55;

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
  corps.rotation.y = ORIENTATION_MODELE;   // voir la contrainte 3 en tête de fichier
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
 * Accroche le sac au dos, sur l'os du torse.
 *
 * LA CAUSE DU BUG « SAC SUR LE VISAGE ».
 *
 * Le sac est construit dans fognomad.mjs aux coordonnées du MANNEQUIN
 * procédural : y ≈ 1,36, z ≈ −0,4. Sur ce mannequin, la tête est une petite
 * sphère à y ≈ 1,99 et le buste à y ≈ 1,30 — 1,36 est donc le haut du dos.
 *
 * Le personnage KayKit a des proportions héroïques et une tête ÉNORME : son
 * maillage de tête occupe y 1,07 à 2,20, le torse 0,35 à 1,31, l'os `chest`
 * est à 0,944. À 1,36, on n'est plus dans le dos : on est en plein dans le
 * visage. Le premier correctif se contentait de préserver les coordonnées
 * d'origine — il préservait donc fidèlement une position devenue fausse.
 *
 * La correction ne « décale » rien à la main : elle MESURE le corps du modèle
 * et pose le sac par rapport à lui. Un autre personnage, d'autres proportions,
 * et l'ancrage suit tout seul.
 *
 * Le compensateur applique, dans l'ordre : passage en espace os, translation
 * vers l'ancre mesurée, mise à l'échelle sur la largeur du torse, puis
 * annulation de la position d'auteur. Un enfant posé à sa coordonnée d'auteur
 * atterrit donc exactement sur l'ancre — et les caisses de charge, qui sont
 * positionnées dans le même repère, suivent sans qu'une ligne de fognomad.mjs
 * ne change.
 *
 * Renvoie null si l'os est introuvable : le sac reste alors sous le joueur,
 * ce qui est le comportement de la 0.5 et n'a rien de cassé.
 */
function poserSocketSac(player, corps, sac, log) {
  if (!sac) return null;

  let os = null;
  corps.traverse((o) => { if (!os && o.isBone && OS_SAC.test(o.name)) os = o; });
  if (!os) {
    log("Joueur : aucun os « chest » trouvé, le sac reste en coordonnées joueur.");
    return null;
  }

  // Les matrices monde ne valent quelque chose qu'une fois la scène à jour.
  player.updateWorldMatrix(true, true);

  // --- mesure du TORSE, dans le repère du joueur -------------------------
  //
  // Le torse et lui seul. Mesurer tous les maillages skinnés donnait 1,94 de
  // large — c'est l'envergure des bras écartés en pose de repos, pas la
  // largeur d'un dos, et le sac s'en trouvait deux fois trop grand. Le repère
  // utile pour un sac à dos, c'est le buste.
  const bustes = [];
  corps.traverse((o) => {
    if (o.isSkinnedMesh && /body|torso|chest/i.test(o.name)) bustes.push(o);
  });
  // Repli : si le pack ne nomme pas son torse, tous les maillages skinnés,
  // en sachant que la largeur sera surestimée.
  if (!bustes.length) corps.traverse((o) => { if (o.isSkinnedMesh) bustes.push(o); });

  const boite = new THREE.Box3();
  const p = new THREE.Vector3();
  for (const o of bustes) {
    const pos = o.geometry?.attributes?.position;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i += 3) {   // un sommet sur trois : la boîte n'a pas besoin de plus
      p.fromBufferAttribute(pos, i);
      o.localToWorld(p);
      player.worldToLocal(p);
      boite.expandByPoint(p);
    }
  }

  const taille = boite.getSize(new THREE.Vector3());
  const posAuteur = sac.position.clone();

  // Épaisseur du sac telle qu'elle est dessinée, avant toute mise à l'échelle.
  const boiteSac = new THREE.Box3().setFromObject(sac);
  const tailleSac = boiteSac.getSize(new THREE.Vector3());
  const largeurSac = tailleSac.x || 0.5;
  const epaisseurSac = tailleSac.z || 0.3;

  const echelle = Math.max(0.4, Math.min(2.5,
    (taille.x * LARGEUR_SAC_RELATIVE) / largeurSac));

  // Ancre : à la hauteur de l'os du torse, juste derrière la surface du dos.
  const chest = os.getWorldPosition(new THREE.Vector3());
  player.worldToLocal(chest);

  // Légèrement sous l'os du torse : un sac se porte au milieu du dos, pas sur
  // les épaules. Sans ce décalage, le sac chargé montait dans la nuque.
  const ancre = new THREE.Vector3(
    0,
    chest.y - taille.y * 0.08,
    boite.min.z - epaisseurSac * echelle * RECUL_SAC,
  );

  const compensateur = new THREE.Object3D();
  compensateur.name = "socket-sac";
  compensateur.matrixAutoUpdate = false;

  const versOs = new THREE.Matrix4().copy(os.matrixWorld).invert().multiply(player.matrixWorld);
  const versAncre = new THREE.Matrix4().makeTranslation(ancre.x, ancre.y, ancre.z);
  const mise = new THREE.Matrix4().makeScale(echelle, echelle, echelle);
  const retourAuteur = new THREE.Matrix4().makeTranslation(-posAuteur.x, -posAuteur.y, -posAuteur.z);

  compensateur.matrix.copy(versOs).multiply(versAncre).multiply(mise).multiply(retourAuteur);

  os.add(compensateur);

  // Le sac ET ses caisses de charge doivent partager le même parent : elles
  // sont positionnées dans le même repère par updateBagVisual(). En laisser
  // une sous `player` les faisait diverger dès que le torse bougeait.
  const caisses = player.children.filter((o) => o.userData && "palier" in o.userData);
  compensateur.add(sac, ...caisses);

  log(`Sac ancré — torse ${taille.x.toFixed(2)}×${taille.y.toFixed(2)}×${taille.z.toFixed(2)} `
    + `(${bustes.map((o) => o.name).join("+") || "aucun"}), `
    + `ancre y${ancre.y.toFixed(2)} z${ancre.z.toFixed(2)}, échelle ${echelle.toFixed(2)}, `
    + `${caisses.length} caisse(s) suivies.`);

  return compensateur;
}
