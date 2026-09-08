/**
 * FOG NOMAD — DÉCOR : VÉGÉTATION ET STRUCTURES EN MODÈLES RÉELS
 *
 * Ce module répond à un reproche précis, formulé après un test sur appareil :
 * « il n'y a que le personnage qui a changé, rien d'autre ». Il avait raison.
 * La 0.6 avait téléchargé 105 modèles, écrit une direction artistique, et
 * n'avait branché que les personnages. Le monde rendait encore intégralement
 * la géométrie procédurale de la 0.5.
 *
 * Trois contraintes ont dicté la forme de ce fichier, et aucune n'est
 * négociable.
 *
 * 1. LE BUDGET D'APPELS DE RENDU NE BOUGE PAS. Un arbre = un Mesh aurait
 *    donné des centaines d'appels sur 25 chunks. Les arbres d'un chunk sont
 *    donc FUSIONNÉS en une géométrie par atlas — un appel par atlas et par
 *    chunk, exactement ce que coûtait la version instanciée qu'ils remplacent.
 *
 * 2. AUCUNE INSTANCIATION. C'est la règle B0 du projet : sur le GPU de test
 *    (Samsung Xclipse 530), l'InstancedMesh produit de grands polygones noirs,
 *    mécanisme jamais expliqué, récidive constatée en 0.5 sur le bois mort.
 *    La fusion coûte le même prix et n'a jamais échoué sur cet appareil.
 *
 * 3. LA CONTAMINATION S'APPLIQUE. Le monde qui se décolore à l'approche de la
 *    brume est la signature visuelle du jeu. Un décor importé qui resterait
 *    vert vif devant le mur casserait ce que la 0.5 avait construit.
 *
 * Et un repli, comme partout ailleurs : si les modèles ne chargent pas, le
 * moteur reprend sa végétation procédurale. Le jeu ne dépend pas du réseau.
 */

import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { enregistrerAuCatalogue } from "./assetmanager.mjs";

/**
 * Modèles de décor. Deux packs, donc deux atlas — et un atlas = un appel de
 * rendu. Les mélanger dans un même chunk coûte donc deux appels au lieu d'un ;
 * c'est le prix de la variété, il est mesuré et il est acceptable.
 *
 * `hauteur` est la taille visée dans le monde, en unités. Les modèles sont
 * livrés à des échelles très différentes — les arbres du pack Hexagon sont des
 * décorations de tuile hautes de 1,1 unité, ceux de Halloween sont à l'échelle
 * du monde à 5,4 — et cette normalisation est ce qui permet de les mélanger
 * sans que la scène parte en morceaux.
 */
export const DECOR = {
  // --- conifères : la masse du paysage --------------------------------
  pin_haut:    { url: "assets/structures/tree_pine_yellow_large.gltf",  atlas: "halloween", hauteur: 7.2 },
  pin_moyen:   { url: "assets/structures/tree_pine_orange_medium.gltf", atlas: "halloween", hauteur: 5.4 },
  pin_petit:   { url: "assets/structures/tree_pine_yellow_small.gltf",  atlas: "halloween", hauteur: 3.8 },
  pin_sombre:  { url: "assets/structures/tree_pine_orange_large.gltf",  atlas: "halloween", hauteur: 6.4 },

  // --- feuillus : silhouette ronde, elle casse la forêt de cônes ------
  feuillu_dense: { url: "assets/nature/trees_B_medium.gltf", atlas: "hexagon", hauteur: 4.6 },
  feuillu_clair: { url: "assets/nature/trees_A_medium.gltf", atlas: "hexagon", hauteur: 4.2 },
  feuillu_isole: { url: "assets/nature/tree_single_A.gltf",  atlas: "hexagon", hauteur: 3.6 },

  // --- bois mort : le monde qui meurt ---------------------------------
  mort_grand:  { url: "assets/structures/tree_dead_large.gltf",  atlas: "halloween", hauteur: 5.0 },
  mort_moyen:  { url: "assets/structures/tree_dead_medium.gltf", atlas: "halloween", hauteur: 4.0 },
  mort_petit:  { url: "assets/structures/tree_dead_small.gltf",  atlas: "halloween", hauteur: 2.8 },

  // --- rochers --------------------------------------------------------
  rocher_a: { url: "assets/nature/rock_single_A.gltf", atlas: "hexagon", hauteur: 1.1 },
  rocher_b: { url: "assets/nature/rock_single_C.gltf", atlas: "hexagon", hauteur: 1.5 },

  // --- structures : posées à l'unité, elles sont rares ----------------
  ruine_pilier:   { url: "assets/structures/pillar.gltf",            atlas: "halloween", hauteur: 3.2 },
  ruine_tombe:    { url: "assets/structures/grave_A_destroyed.gltf", atlas: "halloween", hauteur: 2.1 },
  ruine_cloture:  { url: "assets/structures/fence_broken.gltf",      atlas: "halloween", hauteur: 1.6 },
  camp_banc:      { url: "assets/structures/bench.gltf",             atlas: "halloween", hauteur: 1.0 },
  camp_lanterne:  { url: "assets/structures/post_lantern.gltf",      atlas: "halloween", hauteur: 3.0 },
  repere_arche:   { url: "assets/structures/arch.gltf",              atlas: "halloween", hauteur: 8.5 },
  repere_portail: { url: "assets/structures/arch_gate.gltf",         atlas: "halloween", hauteur: 7.0 },
  repere_crypte:  { url: "assets/structures/crypt.gltf",             atlas: "halloween", hauteur: 9.0 },
  sanctuaire:     { url: "assets/structures/shrine.gltf",            atlas: "halloween", hauteur: 3.4 },
};

/** Familles d'arbres proposées au directeur de monde. Cinq silhouettes, pas
    cinq tailles du même modèle — c'est la demande explicite du §10. */
export const FAMILLES_ARBRES = {
  conifere_haut:  ["pin_haut", "pin_sombre"],
  conifere_dense: ["pin_moyen", "pin_petit"],
  feuillu:        ["feuillu_dense", "feuillu_clair"],
  isole:          ["feuillu_isole"],
  mort:           ["mort_grand", "mort_moyen", "mort_petit"],
};

export function createDecors({ THREE, assets, contaminable, log = () => {} }) {
  enregistrerAuCatalogue(DECOR);

  // Un patron par clé : géométrie normalisée en hauteur, matériau partagé par
  // atlas. Préparé une seule fois, jamais par chunk.
  const patrons = new Map();
  const materiaux = new Map();   // atlas -> Material contaminable
  let pret = false;

  /**
   * Aplatit un modèle en UNE géométrie et retient son matériau d'atlas.
   *
   * Les gltf de ces packs portent parfois plusieurs primitives ; comme elles
   * partagent toutes le même atlas, les fondre en une seule géométrie ne perd
   * rien et simplifie tout le reste.
   */
  function preparer(cle) {
    if (patrons.has(cle)) return patrons.get(cle);
    const paquet = assets.infos(cle);
    if (!paquet) return null;

    const morceaux = [];
    let materiau = null;
    paquet.scene.updateWorldMatrix(true, true);
    paquet.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = normaliser(o.geometry);
      g.applyMatrix4(o.matrixWorld);
      morceaux.push(g);
      if (!materiau && o.material) materiau = o.material;
    });
    if (!morceaux.length) return null;

    let geo = morceaux.length === 1 ? morceaux[0] : mergeGeometries(morceaux, false);
    if (!geo) return null;

    // Normalisation : origine au sol, centrée en X/Z, mise à la hauteur visée.
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    const hauteurBrute = b.max.y - b.min.y || 1;
    const facteur = DECOR[cle].hauteur / hauteurBrute;
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.scale(facteur, facteur, facteur);
    geo.computeBoundingBox();

    const atlas = DECOR[cle].atlas;
    if (!materiaux.has(atlas) && materiau) {
      // Un seul matériau par atlas, contaminable : c'est lui qui fait que le
      // décor importé se décolore devant la brume comme le reste du monde.
      const m = materiau.clone();
      m.roughness = 0.92;
      m.metalness = 0;
      contaminable(m);
      materiaux.set(atlas, m);
    }

    const patron = { geo, atlas, tris: geo.attributes.position.count / 3 };
    patrons.set(cle, patron);
    return patron;
  }

  /** Position + normale + uv, et rien d'autre : mergeGeometries exige des
      attributs identiques d'une géométrie à l'autre. */
  function normaliser(source) {
    const g = source.clone();
    for (const nom of Object.keys(g.attributes)) {
      if (nom !== "position" && nom !== "normal" && nom !== "uv") g.deleteAttribute(nom);
    }
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.index) return g.toNonIndexed();
    return g;
  }

  /** Charge tout le décor. Les échecs ne rejettent pas : ils se lisent. */
  async function precharger() {
    const cles = Object.keys(DECOR);
    const bilan = await assets.precharger(cles);
    let ok = 0;
    for (const b of bilan) if (b.pret && preparer(b.cle)) ok++;
    pret = ok >= Object.keys(FAMILLES_ARBRES).length;   // assez de familles pour valoir le coup
    log(`Décor — ${ok}/${cles.length} modèle(s) prêts, ${materiaux.size} atlas, `
      + `végétation ${pret ? "en modèles réels" : "PROCÉDURALE (repli)"}.`);
    return pret;
  }

  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const V = new THREE.Vector3();

  /**
   * Fusionne une liste d'objets en un maillage par atlas.
   *
   * `items` : { cle, x, y, z, rotation, scale }. Renvoie un tableau de Mesh —
   * un par atlas présent, donc au plus deux. Les géométries produites
   * appartiennent au chunk et doivent être libérées avec lui : elles sont
   * marquées `userData.ownedGeometry`.
   */
  function fusionner(items) {
    if (!items.length) return [];

    const parAtlas = new Map();
    for (const it of items) {
      const patron = patrons.get(it.cle);
      if (!patron) continue;
      const g = patron.geo.clone();
      E.set(0, it.rotation || 0, 0);
      Q.setFromEuler(E);
      V.setScalar(it.scale || 1);
      M.compose(new THREE.Vector3(it.x, it.y, it.z), Q, V);
      g.applyMatrix4(M);
      const liste = parAtlas.get(patron.atlas);
      if (liste) liste.push(g); else parAtlas.set(patron.atlas, [g]);
    }

    const meshes = [];
    for (const [atlas, liste] of parAtlas) {
      const fusion = liste.length === 1 ? liste[0] : mergeGeometries(liste, false);
      if (!fusion) continue;
      if (liste.length > 1) for (const g of liste) g.dispose();
      const mesh = new THREE.Mesh(fusion, materiaux.get(atlas));
      mesh.userData.ownedGeometry = true;
      meshes.push(mesh);
    }
    return meshes;
  }

  /** Un objet isolé, quand il est trop rare pour mériter une fusion. */
  function poser(cle, { x, y, z, rotation = 0, scale = 1 }) {
    const patron = patrons.get(cle);
    if (!patron) return null;
    const mesh = new THREE.Mesh(patron.geo, materiaux.get(patron.atlas));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.scale.setScalar(scale);
    return mesh;
  }

  return {
    precharger, fusionner, poser,
    get pret() { return pret; },
    get patrons() {
      return [...patrons.entries()].map(([cle, p]) => ({ cle, atlas: p.atlas, tris: p.tris }));
    },
    get atlas() { return [...materiaux.keys()]; },
  };
}
