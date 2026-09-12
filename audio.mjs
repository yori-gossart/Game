/**
 * FOG NOMAD — son minimal.
 *
 * Aucun fichier audio : tout est synthétisé par WebAudio à la volée. C'était
 * la condition posée — pas d'asset volumineux, et rien qui alourdisse le
 * build. Le dépôt reste un site statique de quelques fichiers.
 *
 * Le son est un CONFORT, jamais une dépendance :
 *   - le contexte n'est créé qu'au premier geste du joueur, parce que les
 *     navigateurs mobiles refusent de démarrer l'audio sans interaction ;
 *   - toute la surface publique est protégée : si WebAudio est absent,
 *     refusé ou en échec, le jeu tourne exactement pareil, en silence ;
 *   - rien dans la logique de jeu ne lit l'état du son.
 */

const CONFIG = {
  volumeMaitre: 0.32,
  pas: { intervalleMarche: 0.46, intervalleCourse: 0.29 },
  // La brume gronde d'autant plus fort qu'elle est proche. Le grondement
  // n'est jamais nul : on l'entend arriver bien avant de la voir de près.
  grondement: { distanceMax: 150, volumeMin: 0.015, volumeMax: 0.3 },

  /* ── AMBIANCE (0.7.2, §42-44) ─────────────────────────────────────────
     Le monde était muet : des pas, un grondement, et rien d'autre. Trois
     couches suffisent à le rendre habité, et toutes sont synthétisées — le
     dépôt reste un site statique, et aucune licence n'est en jeu.

     La seule règle : l'ambiance DIT quelque chose. Les oiseaux se taisent
     quand la Brume approche, et ce silence arrive avant que le grondement
     ne soit vraiment fort. C'est un avertissement, pas une décoration. */
  vent:     { volumeCalme: 0.055, volumeBourrasque: 0.16, periode: 11 },
  oiseaux:  { margeSilence: 55, margeCalme: 130, intervalleMin: 2.2,
              intervalleMax: 7.5 },
  insectes: { margeSilence: 70, volume: 0.05 },
  balise:   { portee: 46, volume: 0.085 }
};

let ctx = null;
let maitre = null;
let pret = false;
let coupe = false;

// Grondement continu de la brume.
let grondeSource = null;
let grondeGain = null;
let grondeFiltre = null;

let depuisPas = 0;

// Ambiance : vent continu, insectes continus, oiseaux ponctuels, et un
// bourdonnement spatialisé par balise en vue.
let ventGain = null, ventFiltre = null;
let insecteGain = null, insecteOsc = null, insecteLFO = null;
let phaseVent = 0;
let prochainOiseau = 3;
const bourdons = new Map();          // clé -> { osc, gain, pan }

/** Bruit rose approximé, en tampon bouclé : la base du grondement. */
function bufferBruit(secondes = 3) {
  const n = Math.floor(ctx.sampleRate * secondes);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Filtre de Voss-McCartney simplifié : plus grave et plus « lourd » qu'un
  // bruit blanc, qui sifflerait.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const blanc = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + blanc * 0.0990460;
    b1 = 0.96300 * b1 + blanc * 0.2965164;
    b2 = 0.57000 * b2 + blanc * 1.0526913;
    data[i] = (b0 + b1 + b2 + blanc * 0.1848) * 0.16;
  }
  return buffer;
}

/**
 * Démarre l'audio. À appeler depuis un geste du joueur ; les appels suivants
 * ne font rien. Rend true si le son est disponible.
 */
export function demarrerAudio() {
  if (pret || coupe) return pret;

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { coupe = true; return false; }

    ctx = new AC();
    maitre = ctx.createGain();
    maitre.gain.value = CONFIG.volumeMaitre;
    maitre.connect(ctx.destination);

    grondeSource = ctx.createBufferSource();
    grondeSource.buffer = bufferBruit();
    grondeSource.loop = true;

    // Passe-bas très bas : un grondement, pas un souffle.
    grondeFiltre = ctx.createBiquadFilter();
    grondeFiltre.type = "lowpass";
    grondeFiltre.frequency.value = 180;
    grondeFiltre.Q.value = 0.7;

    grondeGain = ctx.createGain();
    grondeGain.gain.value = 0;

    grondeSource.connect(grondeFiltre).connect(grondeGain).connect(maitre);
    grondeSource.start();

    // --- LE VENT : la couche qui remplit le silence -----------------------
    // Le même tampon de bruit, mais passé dans un passe-bande mobile : le
    // grondement de la Brume vient d'en bas, le vent vient d'en haut, et les
    // deux ne se confondent pas.
    const ventSource = ctx.createBufferSource();
    ventSource.buffer = bufferBruit(4);
    ventSource.loop = true;
    ventFiltre = ctx.createBiquadFilter();
    ventFiltre.type = "bandpass";
    ventFiltre.frequency.value = 620;
    ventFiltre.Q.value = 0.55;
    ventGain = ctx.createGain();
    ventGain.gain.value = 0;
    ventSource.connect(ventFiltre).connect(ventGain).connect(maitre);
    ventSource.start();

    // --- LES INSECTES : une note fine, hachée ------------------------------
    // Deux oscillateurs suffisent : une porteuse aiguë, et un LFO qui
    // l'ouvre et la ferme. C'est une stridulation, pas un sifflet.
    insecteOsc = ctx.createOscillator();
    insecteOsc.type = "triangle";
    insecteOsc.frequency.value = 4200;
    insecteGain = ctx.createGain();
    insecteGain.gain.value = 0;
    insecteLFO = ctx.createOscillator();
    insecteLFO.type = "square";
    insecteLFO.frequency.value = 24;
    const insecteProfondeur = ctx.createGain();
    insecteProfondeur.gain.value = 1;
    insecteLFO.connect(insecteProfondeur.gain);
    insecteOsc.connect(insecteProfondeur).connect(insecteGain).connect(maitre);
    insecteOsc.start();
    insecteLFO.start();

    pret = true;
    return true;
  } catch {
    // Un navigateur qui refuse l'audio ne doit pas empêcher de jouer.
    coupe = true;
    ctx = null;
    return false;
  }
}

/** Enveloppe percussive générique : une oscillation courte qui s'éteint. */
function bip({ type = "sine", freq = 440, freqFin = null, duree = 0.12,
               volume = 0.5, attaque = 0.005 }) {
  if (!pret) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqFin !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqFin), t + duree);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + attaque);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);

    osc.connect(gain).connect(maitre);
    osc.start(t);
    osc.stop(t + duree + 0.02);
  } catch { /* un son raté n'est jamais une erreur de jeu */ }
}

/** Coup de bruit filtré : pas, feu, impacts. */
function souffle({ freq = 900, duree = 0.1, volume = 0.4, type = "lowpass" }) {
  if (!pret) return;

  try {
    const src = ctx.createBufferSource();
    const n = Math.floor(ctx.sampleRate * duree);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    src.buffer = buffer;

    const filtre = ctx.createBiquadFilter();
    filtre.type = type;
    filtre.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    src.connect(filtre).connect(gain).connect(maitre);
    src.start();
  } catch { /* idem */ }
}

// ---------------------------------------------------------------------------
// Sons de jeu
// ---------------------------------------------------------------------------

export const sons = {
  /** Pas : bruit sourd et très court, hauteur légèrement variable. */
  pas(course) {
    souffle({ freq: 220 + Math.random() * 90, duree: course ? 0.075 : 0.1,
              volume: course ? 0.5 : 0.34 });
  },

  /** Collecte : deux notes montantes, brèves. */
  collecte() {
    bip({ type: "triangle", freq: 620, freqFin: 940, duree: 0.11, volume: 0.3 });
  },

  /** Cristal utilisé : une note qui descend puis un souffle clair. */
  cristal() {
    bip({ type: "sine", freq: 1180, freqFin: 300, duree: 0.5, volume: 0.36 });
    souffle({ freq: 2600, duree: 0.35, volume: 0.16, type: "highpass" });
  },

  /** Feu allumé : craquement bas. */
  feu() {
    souffle({ freq: 480, duree: 0.3, volume: 0.4 });
    bip({ type: "sawtooth", freq: 150, freqFin: 70, duree: 0.28, volume: 0.16 });
  },

  /** Objet jeté : choc mat. */
  jeter() {
    souffle({ freq: 300, duree: 0.14, volume: 0.36 });
  },

  /** Souffle court : joué quand l'endurance tombe à zéro. */
  essouffle() {
    souffle({ freq: 700, duree: 0.42, volume: 0.24, type: "bandpass" });
  },

  /* ── Prologue (0.7) ───────────────────────────────────────────────────
     Trois sons, et le doute comme principe. Le §13 est explicite : pas de
     rugissement de monstre en continu. Ce qu'on entend doit pouvoir être le
     vent — ou autre chose. C'est la question qui fait peur, pas la réponse. */

  /** Réveil après la chute : acouphène qui s'efface, souffle, cœur. */
  reveil() {
    bip({ type: "sine", freq: 2400, freqFin: 1100, duree: 1.8, volume: 0.1 });
    souffle({ freq: 320, duree: 2.4, volume: 0.22, type: "lowpass" });
    bip({ type: "sine", freq: 62, freqFin: 44, duree: 1.2, volume: 0.3 });
  },

  /**
   * Ce que la Brume rattrape. Un bruit sec, coupé net, puis rien.
   *
   * Le silence qui suit fait le travail : c'est l'absence de suite qui dit ce
   * qui vient de se passer, pas le bruit lui-même. Volontairement ambigu —
   * un craquement de bois autant qu'un cri.
   */
  disparition() {
    souffle({ freq: 900, duree: 0.16, volume: 0.34, type: "bandpass" });
    bip({ type: "sawtooth", freq: 420, freqFin: 90, duree: 0.22, volume: 0.2 });
  },

  /** Fragment de mémoire : une note lointaine, filtrée, comme sous l'eau. */
  souvenir() {
    bip({ type: "sine", freq: 520, freqFin: 380, duree: 1.4, volume: 0.16 });
    souffle({ freq: 180, duree: 1.6, volume: 0.14, type: "lowpass" });
  },

  /**
   * Un oiseau, quelque part. Deux ou trois notes rapides, jamais les mêmes.
   *
   * Il n'est pas là pour faire joli : c'est son ABSENCE qui compte. Quand la
   * Brume approche, les oiseaux s'arrêtent, et ce silence tombe avant que le
   * grondement ne devienne fort. Le joueur l'apprend sans qu'on le lui dise.
   */
  oiseau(pan = 0) {
    if (!pret) return;
    try {
      const notes = 2 + Math.floor(Math.random() * 3);
      const base = 1900 + Math.random() * 1500;
      const t0 = ctx.currentTime;
      for (let i = 0; i < notes; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const pano = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        const t = t0 + i * (0.055 + Math.random() * 0.05);
        const f = base * (0.86 + Math.random() * 0.34);
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * (1.1 + Math.random() * 0.5),
                                                   t + 0.045);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.055, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        if (pano) { pano.pan.value = pan; osc.connect(gain).connect(pano).connect(maitre); }
        else osc.connect(gain).connect(maitre);
        osc.start(t);
        osc.stop(t + 0.09);
      }
    } catch { /* un son raté n'est jamais une erreur de jeu */ }
  },

  /** Mort : une descente longue et sourde. */
  mort() {
    bip({ type: "sine", freq: 300, freqFin: 45, duree: 1.5, volume: 0.4 });
    souffle({ freq: 200, duree: 1.2, volume: 0.3 });
  }
};

/**
 * À appeler chaque image. Gère le grondement de la brume et la cadence des
 * pas — celle-ci vit ici plutôt que dans la boucle de jeu, pour que le moteur
 * n'ait pas à connaître le son.
 */
export function mettreAJourAudio(delta, { marge, marche, course, balises = [] }) {
  if (!pret) return;

  try {
    ambiance(delta, marge, balises);
    const d = CONFIG.grondement;
    const proximite = 1 - Math.min(1, Math.max(0, marge / d.distanceMax));
    const cible = d.volumeMin + (d.volumeMax - d.volumeMin) * proximite * proximite;

    // Rampe courte plutôt qu'affectation directe : sans elle, chaque image
    // produit un saut de gain audible (un « zip » caractéristique).
    grondeGain.gain.setTargetAtTime(cible, ctx.currentTime, 0.12);

    // La brume proche gronde aussi plus grave.
    grondeFiltre.frequency.setTargetAtTime(120 + 180 * proximite, ctx.currentTime, 0.3);

    if (marche) {
      depuisPas += delta;
      const intervalle = course ? CONFIG.pas.intervalleCourse : CONFIG.pas.intervalleMarche;
      if (depuisPas >= intervalle) { depuisPas = 0; sons.pas(course); }
    } else {
      depuisPas = 999;   // le prochain pas sonne immédiatement
    }
  } catch { /* idem */ }
}

/**
 * Les trois couches d'ambiance, et les bourdonnements de cristal.
 *
 * `balises` : { cle, distance, pan } pour chaque source lumineuse en vue —
 * la tour, la stèle. `pan` est déjà en [-1, 1] : le moteur sait où est la
 * caméra, l'audio n'a pas à le savoir.
 */
function ambiance(delta, marge, balises) {
  const t = ctx.currentTime;

  // --- LE VENT ----------------------------------------------------------
  // Il respire : deux périodes décalées, pour qu'aucune bourrasque ne
  // revienne à intervalle régulier — c'est ça qui trahit une boucle.
  phaseVent += delta;
  const v = CONFIG.vent;
  const souffleLent = 0.5 + 0.5 * Math.sin((phaseVent / v.periode) * Math.PI * 2);
  const souffleVif = 0.5 + 0.5 * Math.sin((phaseVent / (v.periode * 0.37)) * Math.PI * 2);
  const force = souffleLent * 0.72 + souffleVif * 0.28;
  ventGain.gain.setTargetAtTime(
    v.volumeCalme + (v.volumeBourrasque - v.volumeCalme) * force, t, 0.6);
  ventFiltre.frequency.setTargetAtTime(480 + force * 520, t, 0.8);

  // --- LES INSECTES -----------------------------------------------------
  // Ils se taisent d'un coup, avant les oiseaux : la Brume les prend en
  // premier parce qu'ils sont au sol.
  const i = CONFIG.insectes;
  const vivant = Math.min(1, Math.max(0, (marge - i.margeSilence) / 45));
  insecteGain.gain.setTargetAtTime(i.volume * vivant, t, 0.9);
  insecteLFO.frequency.setTargetAtTime(19 + 9 * vivant, t, 1.5);

  // --- LES OISEAUX ------------------------------------------------------
  const o = CONFIG.oiseaux;
  if (marge > o.margeSilence) {
    prochainOiseau -= delta;
    if (prochainOiseau <= 0) {
      // Plus la Brume est loin, plus la forêt est bavarde.
      const calme = Math.min(1, (marge - o.margeSilence) /
                                (o.margeCalme - o.margeSilence));
      sons.oiseau((Math.random() * 2 - 1) * 0.85);
      prochainOiseau = o.intervalleMax
        - (o.intervalleMax - o.intervalleMin) * calme
        + Math.random() * 2.5;
    }
  } else {
    prochainOiseau = 1.5 + Math.random() * 2;   // ils reviennent vite si elle recule
  }

  // --- LES CRISTAUX : la seule chose spatialisée ------------------------
  const vues = new Set();
  for (const b of balises) {
    if (!b || b.distance > CONFIG.balise.portee) continue;
    vues.add(b.cle);
    let n = bourdons.get(b.cle);
    if (!n) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.type = "sine";
      osc.frequency.value = b.frequence || 660;
      gain.gain.value = 0;
      if (pan) osc.connect(gain).connect(pan).connect(maitre);
      else osc.connect(gain).connect(maitre);
      osc.start();
      n = { osc, gain, pan };
      bourdons.set(b.cle, n);
    }
    const proche = 1 - b.distance / CONFIG.balise.portee;
    n.gain.gain.setTargetAtTime(CONFIG.balise.volume * proche * proche, t, 0.25);
    if (n.pan) n.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, b.pan || 0)), t, 0.2);
  }
  // Ce qui est sorti de portée s'éteint, puis se libère.
  for (const [cle, n] of bourdons) {
    if (vues.has(cle)) continue;
    n.gain.gain.setTargetAtTime(0, t, 0.4);
    if (n.gain.gain.value < 0.0006) {
      try { n.osc.stop(); } catch { /* déjà arrêté */ }
      bourdons.delete(cle);
    }
  }
}

export function audioDisponible() { return pret; }
