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
  grondement: { distanceMax: 150, volumeMin: 0.015, volumeMax: 0.3 }
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
export function mettreAJourAudio(delta, { marge, marche, course }) {
  if (!pret) return;

  try {
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

export function audioDisponible() { return pret; }
