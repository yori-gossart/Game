/**
 * FOG NOMAD — GESTIONNAIRE D'ASSETS
 *
 * Un seul endroit sait charger un fichier glTF, le garder en mémoire, et en
 * distribuer des copies. Le reste du moteur demande un modèle par son nom et
 * ne sait pas d'où il vient.
 *
 * Trois règles, et elles ne sont pas décoratives.
 *
 * 1. UN FICHIER N'EST TÉLÉCHARGÉ QU'UNE FOIS. Le monde se construit par chunks,
 *    et un chunk se rebâtit chaque fois qu'on repasse dessus. Charger le même
 *    arbre à chaque chunk était le premier moyen évident de transformer une
 *    bibliothèque d'assets en fuite mémoire et en pluie de requêtes réseau.
 *    Le cache est donc au niveau du FICHIER, pas de l'objet posé.
 *
 * 2. UN ÉCHEC DE CHARGEMENT N'EST JAMAIS SILENCIEUX, ET N'EST JAMAIS FATAL.
 *    Le réseau tombe, un fichier manque, un GPU refuse. Le jeu doit continuer
 *    de tourner avec ce qu'il sait faire seul. `instancier()` renvoie alors
 *    null, et l'appelant repasse sur sa géométrie procédurale. Le diagnostic
 *    reste lisible dans `etat` — un asset absent doit se voir, pas se deviner.
 *
 * 3. LES PERSONNAGES ANIMÉS SE CLONENT AVEC SkeletonUtils, PAS AVEC .clone().
 *    Un clone ordinaire copie les objets mais laisse les SkinnedMesh pointer
 *    vers le squelette de l'original : deux nomades se déformaient alors
 *    ensemble, sur la pose du dernier animé. C'est le piège classique du
 *    skinning dans Three.js, et il ne se voit qu'avec deux personnages à
 *    l'écran — donc jamais dans un test à un seul modèle.
 *
 * Les géométries et les matériaux, eux, RESTENT partagés entre les clones :
 * c'est ce qui rend un deuxième nomade presque gratuit en mémoire.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as clonerSquelette } from "three/addons/utils/SkeletonUtils.js";

/**
 * Catalogue. Une entrée = un fichier, et ce qu'on veut en tirer.
 *
 * `garder` filtre les objets du fichier à conserver. Les packs d'assets sont
 * livrés avec tout leur contenu — pour les personnages KayKit, six parties de
 * corps ET six armes. Fog Nomad n'a ni ennemi ni combat : une arbalète dans le
 * dos d'un nomade contredirait la seule chose que le jeu raconte. On les retire
 * au chargement plutôt qu'à chaque instanciation.
 */
export const CATALOGUE = {
  // --- personnages -------------------------------------------------------
  // Quatre silhouettes du même auteur et du même rig : la variation est dans
  // la morphologie et la tenue, pas dans le style. Voir ART_DIRECTION_0.6.md.
  nomade_capuche: { url: "assets/characters/nomade_capuche.glb", type: "personnage" },
  nomade_robuste: { url: "assets/characters/nomade_robuste.glb", type: "personnage" },
  // Le chapeau pointu monte la silhouette à 3,00 unités contre 2,25 à 2,47
  // pour les trois autres — hors de la fourchette de ART_DIRECTION_0.6.md, et
  // relevé par ?arttest avant d'être vu à l'œil. Il lit « magicien » là où le
  // jeu ne parle que de voyageurs : le retirer corrige l'échelle ET le propos.
  nomade_long:    { url: "assets/characters/nomade_long.glb",    type: "personnage",
                    exclure: /hat|spellbook/i },
  nomade_charge:  { url: "assets/characters/nomade_charge.glb",  type: "personnage" },
};

/** Objets à retirer de TOUT personnage : armes et projectiles. */
const ARMES = /crossbow|knife|throwable|sword|axe|shield|staff|wand|bow|arrow|dagger|spear|hammer/i;

/** Un objet est-il à retirer de ce modèle-ci ? Armes partout, plus le filtre
    propre à l'entrée du catalogue quand elle en déclare un. */
function aRetirer(nom, entree) {
  return ARMES.test(nom) || (entree.exclure ? entree.exclure.test(nom) : false);
}

/**
 * Correspondance entre les états du jeu et les clips du pack.
 *
 * Les packs nomment leurs animations à leur façon ; le jeu, lui, ne connaît
 * que quatre états. Cette table est la seule frontière entre les deux, et elle
 * accepte plusieurs candidats par état : un pack qui n'aurait pas « Walking_B »
 * doit encore pouvoir marcher.
 */
export const CLIPS = {
  idle:   ["Idle", "Unarmed_Idle", "Idle_A", "IDLE"],
  marche: ["Walking_A", "Walking_B", "Walking_C", "Walk", "WALK"],
  course: ["Running_A", "Running_B", "Run", "RUN"],
  fuite:  ["Running_B", "Running_A", "Run", "RUN"],
  ramasse: ["PickUp", "Interact", "Use_Item"],
};

export function createAssetManager({ onLog = () => {} } = {}) {
  const loader = new GLTFLoader();

  // Un fichier en cours de chargement est déjà dans `enCours` : deux chunks
  // créés dans la même image demandent le même arbre, et il ne doit partir
  // qu'une seule requête.
  const cache = new Map();     // cle -> { scene, animations, tris, parties }
  const enCours = new Map();   // cle -> Promise
  const echecs = new Map();    // cle -> message

  const etat = {
    demandes: 0, telechargements: 0, instances: 0,
    octets: 0, echecs: 0,
  };

  /**
   * Charge un fichier et le prépare une fois pour toutes : filtrage des armes,
   * réglage des matériaux, comptage. Le résultat vit en cache et n'est JAMAIS
   * ajouté à la scène — c'est un patron, pas un objet du monde.
   */
  async function charger(cle) {
    if (cache.has(cle)) return cache.get(cle);
    if (enCours.has(cle)) return enCours.get(cle);
    if (echecs.has(cle)) return null;

    const entree = CATALOGUE[cle];
    if (!entree) {
      echecs.set(cle, "clé inconnue au catalogue");
      etat.echecs++;
      onLog(`Asset « ${cle} » : absent du catalogue.`);
      return null;
    }

    const promesse = (async () => {
      const t0 = performance.now();
      try {
        const gltf = await loader.loadAsync(entree.url);
        const scene = gltf.scene;

        // Le pack livre les armes montées sur le squelette. On les retire ici,
        // donc une seule fois, plutôt qu'à chaque nomade posé dans le monde.
        const retires = [];
        scene.traverse((o) => { if (o.isMesh && aRetirer(o.name, entree)) retires.push(o); });
        for (const o of retires) o.removeFromParent();

        let tris = 0, parties = 0;
        scene.traverse((o) => {
          if (!o.isMesh) return;
          parties++;
          const g = o.geometry;
          if (g?.index) tris += g.index.count / 3;
          else if (g?.attributes?.position) tris += g.attributes.position.count / 3;

          // Les personnages projettent et reçoivent : c'est ce qui les détache
          // du décor. L'activation réelle des ombres reste décidée par le
          // moteur, qui mesure son coût — ici on ne fait que le permettre.
          o.castShadow = true;
          o.receiveShadow = false;
          if (o.material) {
            // Les textures des packs sont des atlas de gradient : le filtrage
            // linéaire y mélange des teintes voisines et bave sur les bords.
            const map = o.material.map;
            if (map) {
              map.minFilter = THREE.LinearMipmapLinearFilter;
              map.magFilter = THREE.NearestFilter;
              map.anisotropy = 1;
              map.generateMipmaps = true;
            }
            o.material.roughness = 0.85;
            o.material.metalness = 0.0;
          }
        });

        const paquet = {
          scene, animations: gltf.animations || [],
          tris: Math.round(tris), parties,
          type: entree.type, url: entree.url,
          retires: retires.map((o) => o.name),
        };
        cache.set(cle, paquet);
        etat.telechargements++;
        onLog(`Asset « ${cle} » chargé — ${Math.round(tris)} tris, ${parties} partie(s), `
          + `${paquet.animations.length} clip(s), ${Math.round(performance.now() - t0)} ms`
          + (retires.length ? `, ${retires.length} objet(s) retiré(s).` : "."));
        return paquet;
      } catch (e) {
        const message = e?.message || String(e);
        echecs.set(cle, message);
        etat.echecs++;
        // Jamais fatal : l'appelant retombera sur sa géométrie procédurale.
        onLog(`Asset « ${cle} » INDISPONIBLE (${message}) — repli procédural.`);
        return null;
      } finally {
        enCours.delete(cle);
      }
    })();

    enCours.set(cle, promesse);
    return promesse;
  }

  /**
   * Copie utilisable dans le monde. Géométries et matériaux restent partagés
   * avec le patron ; seuls les objets et le squelette sont neufs.
   *
   * Renvoie null si l'asset n'est pas chargé — l'appelant DOIT gérer ce cas.
   */
  function instancier(cle) {
    etat.demandes++;
    const paquet = cache.get(cle);
    if (!paquet) return null;

    // SkeletonUtils pour tout le monde : sur un modèle sans squelette il fait
    // le même travail qu'un clone ordinaire, et on évite d'avoir à savoir
    // lequel des deux appeler selon le fichier.
    const objet = clonerSquelette(paquet.scene);
    etat.instances++;
    return { objet, animations: paquet.animations, tris: paquet.tris, parties: paquet.parties };
  }

  /**
   * Mixer prêt à l'emploi, avec les clips du jeu déjà résolus.
   *
   * Renvoie `actions` indexé par état du jeu (idle, marche, course…), et un
   * `jouer(etat)` qui gère la transition. Le fondu enchaîné n'est pas un luxe :
   * sans lui, passer de marche à course fait sauter les pieds d'une pose à
   * l'autre, ce qui est précisément le défaut que la 0.6 doit corriger.
   */
  function creerAnimateur(instance, { fondu = 0.18 } = {}) {
    if (!instance || !instance.animations.length) return null;

    const mixer = new THREE.AnimationMixer(instance.objet);
    const parNom = new Map(instance.animations.map((c) => [c.name, c]));
    const actions = {};

    for (const [etatJeu, candidats] of Object.entries(CLIPS)) {
      const nom = candidats.find((n) => parNom.has(n));
      if (!nom) continue;
      const action = mixer.clipAction(parNom.get(nom));
      action.clampWhenFinished = false;
      actions[etatJeu] = action;
    }

    let courant = null;

    function jouer(etatJeu) {
      const suivant = actions[etatJeu];
      if (!suivant || suivant === courant) return courant ? courant._nomEtat : null;
      suivant.reset().setEffectiveWeight(1).play();
      if (courant) courant.crossFadeTo(suivant, fondu, false);
      suivant._nomEtat = etatJeu;
      courant = suivant;
      return etatJeu;
    }

    return {
      mixer, actions, jouer,
      get etatCourant() { return courant ? courant._nomEtat : null; },
      /** Cadence de la marche/course, pour aligner le pas sur la vitesse réelle. */
      vitesse(v) { if (courant) courant.setEffectiveTimeScale(v); },
      update(delta) { mixer.update(delta); },
      liberer() { mixer.stopAllAction(); mixer.uncacheRoot(instance.objet); },
    };
  }

  /** Précharge une liste de clés. Les échecs ne rejettent pas : ils se lisent. */
  async function precharger(cles) {
    await Promise.all(cles.map((c) => charger(c)));
    return cles.map((c) => ({ cle: c, pret: cache.has(c), erreur: echecs.get(c) || null }));
  }

  return {
    charger, instancier, creerAnimateur, precharger,
    pret: (cle) => cache.has(cle),
    erreur: (cle) => echecs.get(cle) || null,
    infos: (cle) => cache.get(cle) || null,
    get etat() { return { ...etat, enCache: cache.size, enEchec: echecs.size }; },
    get catalogue() { return CATALOGUE; },
  };
}
