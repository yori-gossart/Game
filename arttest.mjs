/**
 * FOG NOMAD — BANC D'ESSAI ARTISTIQUE (?arttest et ?animtest)
 *
 * Ce fichier ne fait pas tourner le jeu. Il aligne les assets côte à côte, sur
 * un sol neutre, pour qu'un défaut se voie en une seconde plutôt qu'après dix
 * minutes de marche dans le monde.
 *
 * Ce qu'on vient y chercher, et qui ne se voit nulle part ailleurs :
 *
 *   - des CLONES : quatre nomades censés être distincts, alignés, comparables ;
 *   - un défaut de RIG : un membre détaché, un pied qui traverse le sol ;
 *   - de la TRANSPARENCE accidentelle — le défaut signalé sur l'appareil en
 *     0.5, sur les pieds du personnage ;
 *   - un MATÉRIAU faux : brillance absurde, texture manquante, couleur plate ;
 *   - une ÉCHELLE absurde : un nomade de trois mètres à côté d'un de un mètre.
 *
 * Et surtout : il tourne sur l'APPAREIL. Le rendu logiciel de la machine de
 * développement ne dit rien du GPU cible, et ce dépôt a déjà deux artefacts
 * (B0, B0 bis) qui n'existaient QUE sur l'appareil. Le skinning est un chemin
 * GPU entièrement nouveau pour ce projet : il doit être éprouvé là-bas, tôt,
 * avant que trente sections de travail ne reposent dessus.
 */

import * as THREE from "three";
import { createAssetManager, CLIPS } from "./assetmanager.mjs";

const PARAMS = new URLSearchParams(location.search);
const MODE_ANIM = PARAMS.has("animtest");

// ---------------------------------------------------------------------------
// Scène : neutre par conception.
//
// Pas de brume, pas de contamination, pas d'ambiance de danger. Tout ce qui
// donne du style au jeu masquerait ici le défaut qu'on est venu chercher. Le
// fond est gris moyen : un modèle trop clair comme un modèle trop sombre s'y
// détachent, ce que ni le noir ni le blanc ne permettent.
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6b7480);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
Object.assign(renderer.domElement.style, { position: "fixed", inset: "0", touchAction: "none" });

// Éclairage d'atelier : une clé chaude, un remplissage froid, un contre-jour.
// Trois lumières et pas une de plus — on juge le modèle, pas la mise en scène.
const cle = new THREE.DirectionalLight(0xfff2dc, 2.2);
cle.position.set(4, 7, 5);
scene.add(cle);
scene.add(new THREE.DirectionalLight(0x9fc4e8, 0.7).translateX(-5).translateY(3).translateZ(-4));
scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a4a44, 1.1));

// Sol quadrillé : sans repère régulier, un pied qui s'enfonce de deux
// centimètres ou un modèle qui flotte ne se voient pas.
const sol = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x59606b, roughness: 1 }),
);
sol.rotation.x = -Math.PI / 2;
scene.add(sol);
const grille = new THREE.GridHelper(60, 60, 0x8d97a5, 0x707a86);
grille.position.y = 0.002;
scene.add(grille);

// ---------------------------------------------------------------------------
// Interface : minimale, lisible au doigt, sur un téléphone, en extérieur.
// ---------------------------------------------------------------------------
const hud = document.createElement("div");
hud.id = "arttest-hud";
document.body.appendChild(hud);

const barre = document.createElement("div");
barre.id = "arttest-barre";
document.body.appendChild(barre);

function bouton(texte, action, actif = false) {
  const b = document.createElement("button");
  b.textContent = texte;
  b.className = actif ? "actif" : "";
  b.onclick = () => { action(); rafraichirBoutons(); };
  barre.appendChild(b);
  return b;
}

let etatAnim = "idle";
const sujets = [];       // { nom, racine, animateur, cle }
let boutonsAnim = [];

function rafraichirBoutons() {
  for (const b of boutonsAnim) b.className = b.dataset.etat === etatAnim ? "actif" : "";
}

function appliquerAnim(nouvel) {
  etatAnim = nouvel;
  for (const s of sujets) s.animateur?.jouer(nouvel);
}

// ---------------------------------------------------------------------------
// Chargement et mise en place
// ---------------------------------------------------------------------------
const journal = [];
const assets = createAssetManager({ onLog: (m) => { journal.push(m); console.log(m); } });

/** Boîte englobante réelle d'un objet, pour juger l'échelle sans la supposer. */
function mesurer(objet) {
  const b = new THREE.Box3().setFromObject(objet);
  const t = new THREE.Vector3();
  b.getSize(t);
  return { hauteur: t.y, largeur: t.x, profondeur: t.z, minY: b.min.y };
}

/** Étiquette au sol sous chaque sujet : un banc sans noms ne sert à rien. */
function etiquette(texte, x, z) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(20,24,30,.82)";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#fff";
  g.font = "600 26px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText(texte, 128, 41);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(1.6, 0.4, 1);
  sp.position.set(x, 0.12, z + 1.1);
  scene.add(sp);
}

async function monter() {
  const cles = Object.keys(assets.catalogue);
  const bilan = await assets.precharger(cles);

  const prets = bilan.filter((b) => b.pret);
  const rates = bilan.filter((b) => !b.pret);

  // Alignement sur une rangée, pas espacés au hasard : c'est l'alignement qui
  // rend un écart de taille ou de posture immédiatement visible.
  const PAS = 1.9;
  const debut = -((prets.length - 1) * PAS) / 2;

  prets.forEach((b, i) => {
    const inst = assets.instancier(b.cle);
    if (!inst) return;

    const x = debut + i * PAS;
    inst.objet.position.set(x, 0, 0);
    inst.objet.rotation.y = Math.PI;   // face à la caméra
    scene.add(inst.objet);

    const m = mesurer(inst.objet);
    const animateur = assets.creerAnimateur(inst);
    animateur?.jouer(etatAnim);

    sujets.push({ nom: b.cle, racine: inst.objet, animateur, cle: b.cle, mesure: m, inst });
    etiquette(b.cle.replace("nomade_", ""), x, 0);
  });

  // Un asset manquant doit se VOIR dans la scène, pas seulement dans un
  // journal qu'on oublie d'ouvrir. Un cube magenta est la convention.
  rates.forEach((b, i) => {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.7, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff00ff }),
    );
    cube.position.set(debut + (prets.length + i) * PAS, 0.85, 0);
    scene.add(cube);
    etiquette("MANQUANT", cube.position.x, 0);
  });

  cadrer();
  construireBarre();
  rafraichirHud(bilan);
}

/** Cadre la caméra sur l'ensemble des sujets, quelle que soit leur quantité. */
function cadrer() {
  const b = new THREE.Box3();
  for (const s of sujets) b.expandByObject(s.racine);
  if (!sujets.length) b.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(4, 2, 2));
  const centre = b.getCenter(new THREE.Vector3());
  const taille = b.getSize(new THREE.Vector3());
  const rayon = Math.max(taille.x, taille.y) * 0.75 + 1.2;
  orbite.cible.copy(centre);
  orbite.distance = rayon / Math.tan((camera.fov * Math.PI) / 360) * 1.15;
  orbite.distance = Math.max(3, orbite.distance);
}

function construireBarre() {
  if (MODE_ANIM) {
    // ?animtest : le sujet du test est la transition entre états. Les quatre
    // boutons sont là pour enchaîner vite et voir si les pieds glissent.
    for (const e of ["idle", "marche", "course", "fuite"]) {
      const b = bouton(e, () => appliquerAnim(e), e === etatAnim);
      b.dataset.etat = e;
      boutonsAnim.push(b);
    }
    bouton("½ vitesse", () => { for (const s of sujets) s.animateur?.vitesse(0.5); });
    bouton("vitesse 1", () => { for (const s of sujets) s.animateur?.vitesse(1); });
  } else {
    bouton("anim ▸", () => appliquerAnim(etatAnim === "idle" ? "marche" : "idle"));
  }
  bouton("pieds", () => { vuePieds = !vuePieds; cadrerPieds(); });
  bouton("fil de fer", () => {
    filDeFer = !filDeFer;
    for (const s of sujets) s.racine.traverse((o) => { if (o.isMesh) o.material.wireframe = filDeFer; });
  });
  bouton("journal", () => { hud.classList.toggle("ouvert"); });
}

let vuePieds = false, filDeFer = false;

/** Vue rapprochée au ras du sol : c'est là que le défaut de 0.5 se voyait. */
function cadrerPieds() {
  if (vuePieds) { orbite.cible.set(0, 0.18, 0); orbite.distance = 2.4; orbite.hauteur = 0.12; }
  else { cadrer(); orbite.hauteur = 0.55; }
}

// ---------------------------------------------------------------------------
// Orbite tactile. Pas de dépendance : quelques lignes suffisent, et le projet
// n'en importe aucune.
// ---------------------------------------------------------------------------
const orbite = { cible: new THREE.Vector3(0, 1, 0), distance: 7, angle: 0, hauteur: 0.55 };
let pointeur = null;

renderer.domElement.addEventListener("pointerdown", (e) => { pointeur = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener("pointerup", () => { pointeur = null; });
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!pointeur) return;
  orbite.angle -= (e.clientX - pointeur.x) * 0.008;
  orbite.hauteur = Math.max(-0.25, Math.min(1.3, orbite.hauteur + (e.clientY - pointeur.y) * 0.005));
  pointeur = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener("wheel", (e) => {
  orbite.distance = Math.max(1.2, Math.min(30, orbite.distance + e.deltaY * 0.01));
}, { passive: true });

// ---------------------------------------------------------------------------
// Compteurs. Le banc doit dire son propre coût : c'est ici qu'on apprend ce
// qu'un personnage animé coûte réellement, avant de peupler le monde avec.
// ---------------------------------------------------------------------------
function rafraichirHud(bilan) {
  const l = [];
  l.push(`<b>${MODE_ANIM ? "?animtest" : "?arttest"}</b>`);
  l.push(`<span id="art-fps">—</span>`);
  l.push("");
  for (const b of bilan) {
    const i = assets.infos(b.cle);
    l.push(b.pret
      ? `✓ ${b.cle} — ${i.tris} tris · ${i.parties} parties · ${i.animations.length} clips`
      : `✗ ${b.cle} — ${b.erreur}`);
  }
  const s = sujets[0];
  if (s) {
    l.push("");
    l.push(`hauteur mesurée : ${s.mesure.hauteur.toFixed(2)} m`);
    l.push(`pose au sol : y min = ${s.mesure.minY.toFixed(3)} m`);
    l.push(`clips résolus : ${Object.keys(CLIPS).filter((k) => s.animateur?.actions[k]).join(", ") || "aucun"}`);
  }
  l.push("");
  l.push(...journal.slice(-6));
  hud.innerHTML = l.map((x) => `<div>${x}</div>`).join("");
}

let images = 0, cumul = 0, pire = 0;
const horloge = new THREE.Clock();

function boucle() {
  requestAnimationFrame(boucle);
  const delta = Math.min(horloge.getDelta(), 0.05);

  for (const s of sujets) s.animateur?.update(delta);

  camera.position.set(
    orbite.cible.x + Math.sin(orbite.angle) * orbite.distance,
    orbite.cible.y + orbite.hauteur * orbite.distance * 0.5,
    orbite.cible.z + Math.cos(orbite.angle) * orbite.distance,
  );
  camera.lookAt(orbite.cible);
  renderer.render(scene, camera);

  images++; cumul += delta; pire = Math.max(pire, delta);
  if (cumul >= 0.5) {
    const el = document.getElementById("art-fps");
    if (el) {
      const info = renderer.info;
      let skinnes = 0;
      scene.traverse((o) => { if (o.isSkinnedMesh) skinnes++; });
      el.textContent = `${(images / cumul).toFixed(0)} fps · pire ${(pire * 1000).toFixed(0)} ms · `
        + `${info.render.calls} calls · ${info.render.triangles} tris · ${skinnes} skinned`;
    }
    images = 0; cumul = 0; pire = 0;
  }
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Sonde, pour les tests automatisés comme pour la console de l'appareil.
window.ARTTEST = {
  get sujets() {
    return sujets.map((s) => ({
      cle: s.cle, hauteur: s.mesure.hauteur, minY: s.mesure.minY,
      tris: s.inst.tris, parties: s.inst.parties,
      clips: Object.keys(s.animateur?.actions || {}),
      etat: s.animateur?.etatCourant || null,
    }));
  },
  get etat() { return assets.etat; },
  get info() {
    let skinnes = 0, meshes = 0, transparents = [];
    scene.traverse((o) => {
      if (o.isSkinnedMesh) skinnes++;
      if (o.isMesh) {
        meshes++;
        // La transparence accidentelle est le défaut signalé sur l'appareil :
        // on la relève par objet, pour pouvoir le NOMMER et pas seulement le
        // constater.
        if (o.material?.transparent || (o.material?.opacity ?? 1) < 1) {
          transparents.push(o.name || "(sans nom)");
        }
      }
    });
    return {
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      skinnes, meshes, transparents,
    };
  },
  jouer: (e) => appliquerAnim(e),
  get journal() { return journal.slice(); },
  get pret() { return sujets.length > 0 || assets.etat.echecs > 0; },
};

monter();
boucle();
