/**
 * FOG NOMAD — WORLD DIRECTOR
 *
 * La génération ne se contente plus de tirer « arbre ou pierre » au hasard :
 * elle regarde ce qu'il y a autour avant de décider ce qui manque.
 *
 * ---------------------------------------------------------------------------
 * DÉTERMINISME — la décision de conception la plus importante de ce module
 * ---------------------------------------------------------------------------
 *
 * Un « directeur » classique garde une mémoire de ce qu'il vient de générer et
 * corrige le tir pour la suite. C'est simple, et c'est incompatible avec ce
 * projet : le moteur garantit qu'une même seed régénère un monde identique
 * (vérifié par `suite.mjs` et `audit.mjs`). Avec une mémoire liée à l'ordre de
 * parcours, revenir sur ses pas donnerait un monde différent — et un joueur
 * qui recharge sa partie ne retrouverait pas ses repères.
 *
 * La mémoire est donc remplacée par un BALAYAGE DÉTERMINISTE du voisinage :
 * pour savoir si la région manque de structures, on réévalue la même fonction
 * de tirage sur les chunks alentour. Le résultat ne dépend que de la position
 * et de la seed, jamais du chemin parcouru.
 *
 * Ce balayage coûte ~49 hachages par chunk créé, soit un coût négligeable
 * comparé à la construction de la géométrie — et il n'a lieu qu'à la création
 * du chunk, jamais par image.
 *
 * ---------------------------------------------------------------------------
 * AUCUNE IA DISTANTE
 * ---------------------------------------------------------------------------
 * Pas d'API, pas de modèle, pas de réseau. Uniquement des règles, des
 * pondérations et des hachages de position. Le monde doit sembler pensé sans
 * rien coûter d'autre que du calcul local.
 */

// ---------------------------------------------------------------------------
// Réglages — tout ce qui s'équilibre est ici.
// ---------------------------------------------------------------------------

export const WORLD = {
  // Rayon du balayage de voisinage, en chunks. 3 couvre 49 cases, soit
  // ~200 unités : assez pour juger « cette région est vide » sans coûter cher.
  scanRadius: 3,

  // Probabilité de base qu'un chunk porte un point d'intérêt humain, avant
  // toute correction de contexte.
  interetBase: 0.055,

  // Le manque fait monter la probabilité. À `videMax` cases vides autour, la
  // probabilité est multipliée par `videBoost`.
  videMax: 34,
  videBoost: 3.4,

  // ... et l'excès la fait baisser : au-delà de `tropPres` voisins occupés,
  // la probabilité s'effondre. C'est ce qui empêche les grappes absurdes.
  tropPres: 4,
  tropBaisse: 0.12,

  // Repères lointains : tirés sur une grille grossière, pas par chunk, sinon
  // ils apparaîtraient et disparaîtraient au gré du streaming alors que leur
  // raison d'être est d'être visés de loin.
  landmarkGrid: 7,
  landmarkChance: 0.5,

  // Vie. Les animaux sont fréquents et discrets, les nomades rares.
  animauxBase: 0.30,
  oiseauxBase: 0.22,
  nomadeBase: 0.035,

  // Un chunk trop proche de la brume ne reçoit plus de vie : elle a fui.
  vieMargeMin: 30,

  // Sécheresse de vie : si le voisinage est presque désert, la probabilité
  // d'animaux monte. Sans cette correction, un couloir pouvait enchaîner
  // seize chunks sans le moindre événement — mesuré, 512 mètres de rien.
  //
  // Le seuil compte autant que le gain, et il vient d'une mesure, pas d'une
  // intuition. Distribution réelle de « voisins sans vie » sur 48 voisins :
  // médiane 26, 90e centile 31, maximum 38.
  //
  //   seuil 26 → le correctif s'applique partout : 80 % des chunks peuplés.
  //   seuil 38 → il ne se déclenche jamais.
  //   seuil 30 → il ne touche que le dixième le plus mort des régions.
  vieVideSeuil: 30,
  vieVideMax: 38,
  vieBoost: 3.2,

  // Altitude au-dessus de laquelle une zone compte comme « haute ».
  altitudeHaute: 3.2,
  // En dessous, on considère le chunk noyé : rien ne s'y construit.
  altitudeEau: -1.6
};

/** Hachage déterministe réutilisable, indépendant de celui du terrain. */
function hash01(x, z, seed, salt) {
  let n =
    Math.imul((x | 0) ^ seed ^ salt, 374761393) +
    Math.imul((z | 0) + seed + salt, 668265263);

  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

/**
 * Tirage BRUT d'un chunk : porte-t-il un point d'intérêt, sans tenir compte du
 * voisinage ? C'est cette fonction que le balayage réévalue sur les chunks
 * alentour — elle doit donc rester très bon marché et sans effet de bord.
 */
function interetBrut(cx, cz, seed) {
  return hash01(cx * 89, cz * 127, seed, 409) < WORLD.interetBase * 2.2;
}

/**
 * Un chunk porte-t-il de la vie, tirage brut ?
 *
 * Miroir du tirage réel des animaux, sans correction de contexte : c'est cette
 * fonction que le balayage réévalue autour pour détecter une région morte.
 */
function vieBrute(cx, cz, seed) {
  return hash01(cx * 211, cz * 307, seed, 431) < WORLD.animauxBase ||
         hash01(cx * 137, cz * 251, seed, 435) < WORLD.oiseauxBase;
}

/**
 * Contexte local d'un chunk. Calculé une fois, à la création.
 *
 * Toutes les mesures viennent d'un échantillonnage grossier (3×3 points) :
 * on cherche à caractériser une région, pas à la cartographier.
 */
export function worldContext(cx, cz, deps) {
  const { chunkSize, terrainHeight, zoneAt, biomeIndexAt, seed,
          fogGap = Infinity, distance = 0, elapsed = 0 } = deps;

  const centerX = cx * chunkSize + chunkSize / 2;
  const centerZ = cz * chunkSize + chunkSize / 2;

  let somme = 0;
  let mini = Infinity;
  let maxi = -Infinity;

  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const h = terrainHeight(centerX + i * chunkSize * 0.36,
                              centerZ + j * chunkSize * 0.36);
      somme += h;
      mini = Math.min(mini, h);
      maxi = Math.max(maxi, h);
    }
  }

  const altitude = somme / 9;
  const zone = zoneAt(centerX, centerZ);

  return {
    cx, cz, centerX, centerZ,
    altitude,
    // Écart entre le point le plus haut et le plus bas : une mesure de pente
    // suffisante pour distinguer un plateau d'un versant.
    pente: maxi - mini,
    biome: biomeIndexAt(centerX, centerZ),
    rocaille: zone.rocaille,
    clairiere: zone.clairiere,
    sec: zone.sec,
    // Un chunk noyé ne porte ni construction ni vie terrestre.
    noye: altitude < WORLD.altitudeEau,
    fogGap,
    distance,
    elapsed
  };
}

/**
 * Le directeur. Il ne construit rien : il dit ce qui devrait exister ici.
 */
export function createWorldDirector(deps) {
  const { seed } = deps;

  // Comptage de ce qui a RÉELLEMENT été posé. Sert uniquement à la télémétrie
  // et aux tests de distribution — jamais à la décision, sans quoi le monde
  // cesserait d'être déterministe.
  const stats = {
    chunks: 0, vides: 0,
    cabane: 0, camp: 0, ruine: 0, balise: 0,
    monument: 0, grandarbre: 0,
    nomades: 0, animaux: 0, oiseaux: 0,
    videMax: 0
  };
  let depuisEvenement = 0;

  /**
   * Combien de chunks voisins portent un point d'intérêt ?
   *
   * C'est la « mémoire » du directeur, en version déterministe : au lieu de se
   * souvenir de ce qu'il a généré, il recalcule ce qui EXISTE autour.
   */
  function occupationVoisine(cx, cz) {
    const r = WORLD.scanRadius;
    let occupes = 0;
    let sansVie = 0;
    let total = 0;

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0) continue;
        total++;
        if (interetBrut(cx + dx, cz + dz, seed)) occupes++;
        if (!vieBrute(cx + dx, cz + dz, seed)) sansVie++;
      }
    }

    return { occupes, vides: total - occupes, sansVie };
  }

  /**
   * Décide du contenu d'un chunk. Appelée UNE FOIS par chunk créé.
   */
  function decide(ctx) {
    stats.chunks++;

    const resultat = {
      structure: null,
      landmark: null,
      nomade: false,
      animaux: 0,
      oiseaux: 0
    };

    // --- repère lointain ---------------------------------------------------
    // Tiré sur une grille grossière, indépendamment du reste : un repère doit
    // pouvoir tomber dans une région déjà dense, c'est son rôle d'être visé
    // de loin.
    const gx = Math.floor(cxDiv(ctx.cx, WORLD.landmarkGrid));
    const gz = Math.floor(cxDiv(ctx.cz, WORLD.landmarkGrid));

    if (!ctx.noye && hash01(gx * 313, gz * 571, seed, 401) < WORLD.landmarkChance) {
      const dx = Math.floor(hash01(gx * 17, gz * 29, seed, 403) * WORLD.landmarkGrid);
      const dz = Math.floor(hash01(gx * 41, gz * 11, seed, 405) * WORLD.landmarkGrid);

      if (modPositif(ctx.cx, WORLD.landmarkGrid) === dx &&
          modPositif(ctx.cz, WORLD.landmarkGrid) === dz) {
        // Le relief décide de la nature du repère : une statue sur un plateau,
        // un arbre géant dans une zone basse et verte.
        const haut = ctx.altitude > WORLD.altitudeHaute || ctx.rocaille > 0.3;
        resultat.landmark = haut ? "monument" : "grandarbre";
        stats[resultat.landmark]++;
      }
    }

    // Un seul balayage du voisinage par chunk : il sert à la fois aux
    // structures et à la vie.
    const voisinage = ctx.noye ? null : occupationVoisine(ctx.cx, ctx.cz);

    // --- point d'intérêt humain -------------------------------------------
    if (voisinage && !resultat.landmark) {
      const { occupes, vides } = voisinage;
      stats.videMax = Math.max(stats.videMax, vides);

      // Le manque augmente la probabilité, l'excès l'écrase.
      let facteur = 1 + (vides / WORLD.videMax) * (WORLD.videBoost - 1);
      if (occupes >= WORLD.tropPres) facteur *= WORLD.tropBaisse;

      // Le contexte oriente : une clairière appelle un campement, une zone
      // rocheuse et haute appelle une ruine.
      if (ctx.clairiere > 0.35) facteur *= 1.35;
      if (ctx.pente > 5.5) facteur *= 0.45;      // on ne bâtit pas sur un versant

      const p = Math.min(0.6, WORLD.interetBase * facteur);

      if (hash01(ctx.cx * 149, ctx.cz * 97, seed, 411) < p) {
        resultat.structure = choisirStructure(ctx, seed);
        stats[resultat.structure]++;
      }
    }

    // --- vie ---------------------------------------------------------------
    // Rien ne vit à portée de la brume : le monde fuit devant elle.
    if (ctx.fogGap > WORLD.vieMargeMin && !ctx.noye) {
      // Les animaux terrestres préfèrent le couvert, les oiseaux le dégagé.
      const couvert = 1 - Math.min(1, Math.max(0, ctx.clairiere));

      // Correction de sécheresse : une région où rien ne vit voit sa
      // probabilité d'animaux monter, jusqu'à vieBoost. Déterministe, puisque
      // `sansVie` vient du balayage du voisinage et non d'un historique.
      const ampleur = voisinage
        ? (voisinage.sansVie - WORLD.vieVideSeuil) /
          (WORLD.vieVideMax - WORLD.vieVideSeuil)
        : 0;
      const secheresse = 1 + Math.min(1, Math.max(0, ampleur)) * (WORLD.vieBoost - 1);

      const pAnimaux = WORLD.animauxBase * (0.5 + couvert) *
                       (ctx.rocaille > 0.45 ? 0.5 : 1) * secheresse;

      if (hash01(ctx.cx * 211, ctx.cz * 307, seed, 431) < pAnimaux) {
        resultat.animaux = 1 + Math.floor(hash01(ctx.cx, ctx.cz, seed, 433) * 3);
        stats.animaux += resultat.animaux;
      }

      const pOiseaux = WORLD.oiseauxBase * (0.6 + Math.max(0, ctx.clairiere)) * secheresse;
      if (hash01(ctx.cx * 137, ctx.cz * 251, seed, 435) < pOiseaux) {
        resultat.oiseaux = 2 + Math.floor(hash01(ctx.cx, ctx.cz, seed, 437) * 4);
        stats.oiseaux += resultat.oiseaux;
      }

      // Un nomade se tient près d'une trace humaine, ou seul sur la route.
      const pNomade = WORLD.nomadeBase * (resultat.structure ? 3.2 : 1);
      if (hash01(ctx.cx * 419, ctx.cz * 173, seed, 439) < pNomade) {
        resultat.nomade = true;
        stats.nomades++;
      }
    }

    const vide = !resultat.structure && !resultat.landmark &&
                 !resultat.nomade && !resultat.animaux && !resultat.oiseaux;
    if (vide) { stats.vides++; depuisEvenement++; }
    else depuisEvenement = 0;

    return resultat;
  }

  return {
    decide,
    get stats() { return { ...stats }; },
    get depuisEvenement() { return depuisEvenement; },
    reset() {
      for (const k of Object.keys(stats)) stats[k] = 0;
      depuisEvenement = 0;
    }
  };
}

/** Division entière qui traite correctement les coordonnées négatives. */
function cxDiv(v, n) { return Math.floor(v / n); }

/** Modulo toujours positif : les coordonnées de chunk peuvent être négatives. */
function modPositif(v, n) { return ((v % n) + n) % n; }

/**
 * Nature de la structure, décidée par le terrain et non par un tirage nu.
 *
 * Les cabanes sont les plus fréquentes — ce sont des traces de vie récente.
 * Les ruines demandent de la hauteur ou de la roche. Les balises sont rares
 * partout : ce sont elles qui posent la question sans y répondre.
 */
function choisirStructure(ctx, seed) {
  const t = hash01(ctx.cx * 53, ctx.cz * 71, seed, 413);

  const hauteur = ctx.altitude > WORLD.altitudeHaute;
  const rocheux = ctx.rocaille > 0.32;

  if (rocheux || hauteur) {
    if (t < 0.44) return "ruine";
    if (t < 0.70) return "cabane";
    if (t < 0.90) return "camp";
    return "balise";
  }

  if (ctx.clairiere > 0.35) {
    if (t < 0.46) return "camp";
    if (t < 0.84) return "cabane";
    if (t < 0.94) return "ruine";
    return "balise";
  }

  if (t < 0.42) return "cabane";
  if (t < 0.72) return "camp";
  if (t < 0.92) return "ruine";
  return "balise";
}
