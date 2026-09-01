/**
 * FOG NOMAD — liaison de l'interface de run.
 *
 * Séparé de la logique de jeu : ce module ne décide de rien, il reflète l'état
 * et transmet les deux seules actions du joueur (jeter un objet, recommencer).
 */

import { CONFIG } from "./fognomad.mjs";
import { modeCourant } from "./modes.mjs";

const $ = (selector) => document.querySelector(selector);

export function bindRunUI(game) {
  const healthFill = $("#health-fill");
  const staminaFill = $("#stamina-fill");
  const weightFill = $("#weight-fill");
  const weightValue = $("#weight-value");
  const healthGauge = $(".gauge-health");
  const weightGauge = $(".gauge-weight");
  const fogGauge = $("#fog-gauge");
  const fogDistance = $("#fog-distance");
  const collectRing = $("#collect-ring");
  const collectFill = collectRing.querySelector("i");
  const bagList = $("#bag-list");
  const openBag = $("#open-bag");
  const bagPanel = $("#bag-panel");
  const bagItems = $("#bag-items");
  const bagWeight = $("#bag-weight");
  const closeBag = $("#close-bag");
  const vignette = $("#fog-vignette");
  const death = $("#death");
  const deathCause = $("#death-cause");
  const deathStats = $("#death-stats");
  const restartButton = $("#restart");
  const crystalButton = $("#use-crystal");
  const fireButton = $("#light-fire");
  const pickupFeed = $("#pickup-feed");
  const pulseFlash = $("#pulse-flash");

  // Le contenu du sac ne change qu'aux collectes et aux abandons : on ne
  // reconstruit la liste que lorsqu'elle diffère réellement.
  let lastBagSignature = "";
  let lastPanelSignature = "";
  let lastCollected = 0;

  // Le sac ouvert ne met pas le jeu en pause : il ralentit le temps. La brume
  // continue d'avancer, très lentement — assez pour que trier son sac reste
  // une décision et non un temps mort gratuit.
  let sacOuvert = false;

  function ouvrirSac() {
    sacOuvert = true;
    bagPanel.hidden = false;
    openBag.hidden = true;
    lastPanelSignature = "";
    renderPanel(game.state);
  }

  function fermerSac() {
    sacOuvert = false;
    bagPanel.hidden = true;
    openBag.hidden = false;
  }

  openBag.addEventListener("click", (event) => {
    event.preventDefault();
    ouvrirSac();
  });

  closeBag.addEventListener("click", (event) => {
    event.preventDefault();
    fermerSac();
  });

  // Échap ferme le sac au clavier — utile en test, sans effet sur mobile.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sacOuvert) fermerSac();
  });

  restartButton.addEventListener("click", () => {
    game.restart();
    death.hidden = true;
  });

  crystalButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (!game.usePulse()) return;

    // Le flash doit repartir de zéro même si on enchaîne deux cristaux.
    pulseFlash.classList.remove("on");
    void pulseFlash.offsetWidth;
    pulseFlash.classList.add("on");
    announce("brume repoussée");
  });

  fireButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (game.lightFire()) announce("feu allumé");
  });

  /** Petite étiquette montante : assez pour comprendre, trop courte pour gêner. */
  function announce(text) {
    const line = document.createElement("div");
    line.className = "pickup";
    line.textContent = text;
    pickupFeed.appendChild(line);
    setTimeout(() => line.remove(), 1000);
  }

  function setFill(element, ratio) {
    element.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
  }

  function renderBag(state) {
    const signature = Object.entries(state.inventory)
      .map(([key, count]) => `${key}:${count}`)
      .join("|");

    if (signature === lastBagSignature) return;
    lastBagSignature = signature;

    bagList.replaceChildren();

    for (const [key, count] of Object.entries(state.inventory)) {
      if (!count) continue;

      const spec = CONFIG.resources[key];
      const chip = document.createElement("div");
      chip.className = "bag-chip";

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = "#" + spec.color.toString(16).padStart(6, "0");

      const label = document.createElement("span");
      label.textContent = `${spec.label} ×${count}`;

      const kg = document.createElement("span");
      kg.className = "kg";
      kg.textContent = `${spec.weight * count}`;

      chip.append(swatch, label, kg);
      bagList.appendChild(chip);
    }
  }

  /**
   * Contenu du menu de sac. Reconstruit seulement quand l'inventaire change :
   * ouvert, il est rendu à chaque image comme le reste du HUD.
   */
  function renderPanel(state) {
    bagWeight.textContent = `${Math.round(state.weight)} / ${CONFIG.weight.max}`;

    // La signature inclut la possibilité de manger : à pleine santé le bouton
    // est désactivé, et il doit se réactiver dès qu'on prend le moindre dégât.
    const signature = Object.entries(state.inventory)
      .map(([key, count]) => `${key}:${count}`)
      .join("|") + `|manger:${game.canEat()}`;
    if (signature === lastPanelSignature) return;
    lastPanelSignature = signature;

    bagItems.replaceChildren();
    let lignes = 0;

    for (const key of Object.keys(CONFIG.resources)) {
      const count = state.inventory[key] || 0;
      if (!count) continue;
      lignes++;

      const spec = CONFIG.resources[key];
      const ligne = document.createElement("div");
      ligne.className = "ligne";

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = "#" + spec.color.toString(16).padStart(6, "0");

      const label = document.createElement("span");
      label.textContent = `${spec.label} ×${count}`;

      const kg = document.createElement("span");
      kg.className = "kg";
      kg.textContent = `${spec.weight * count} kg`;

      ligne.append(swatch, label, kg);

      // La ration se mange depuis le sac : c'est le seul objet du jeu qui
      // s'utilise plutôt que de se transporter ou de se jeter.
      if (spec.soin) {
        const manger = document.createElement("button");
        manger.type = "button";
        manger.className = "manger";
        manger.textContent = "Manger";
        manger.disabled = !game.canEat();
        manger.setAttribute("aria-label", "Manger une ration");
        manger.addEventListener("click", (event) => {
          event.preventDefault();
          if (!game.eatRation()) return;
          lastPanelSignature = "";
          renderPanel(game.state);
          render(game.state);
        });
        ligne.appendChild(manger);
      }

      const drop = document.createElement("button");
      drop.type = "button";
      drop.textContent = "×";
      drop.setAttribute("aria-label", `Jeter un ${spec.label}`);
      drop.addEventListener("click", (event) => {
        event.preventDefault();
        game.dropOne(key);
        lastPanelSignature = "";
        renderPanel(game.state);
        render(game.state);
      });

      ligne.appendChild(drop);
      bagItems.appendChild(ligne);
    }

    if (!lignes) {
      const vide = document.createElement("p");
      vide.className = "vide";
      vide.textContent = "Sac vide.";
      bagItems.appendChild(vide);
    }
  }

  function renderDeath(state) {
    if (!state.dead) {
      death.hidden = true;
      return;
    }

    deathCause.textContent = state.deathCause;
    deathStats.replaceChildren();

    const rows = [
      ["Distance", `${Math.round(state.distance)} m`],
      ["Durée", `${Math.floor(state.elapsed / 60)} min ${String(Math.floor(state.elapsed % 60)).padStart(2, "0")} s`],
      ["Ressources ramassées", String(state.collected)],
      ["Valeur rapportée", String(game.valueCarried())],
      ["Poids maximum", `${Math.round(state.maxWeight)} / ${CONFIG.weight.max}`],
      ["Objets jetés", String(state.dropped)],
      ["Cristaux utilisés", String(state.pulses)],
      ["Feux allumés", String(state.firesLit)],
      ["Rations mangées", String(state.rationsMangees)],
      ["Avance maximale", `${Math.round(state.maxFogGap)} m`]
    ];

    for (const [label, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      deathStats.append(dt, dd);
    }

    death.hidden = false;
  }

  function render(state) {
    if (state.collected > lastCollected) {
      const gained = state.collected - lastCollected;
      lastCollected = state.collected;
      announce(`+${gained}`);
    } else if (state.collected < lastCollected) {
      lastCollected = state.collected;   // nouvelle run
    }

    crystalButton.hidden = !game.canPulse();
    fireButton.hidden = !game.canLightFire();

    setFill(healthFill, state.health / CONFIG.player.maxHealth);
    setFill(staminaFill, state.stamina / CONFIG.stamina.max);

    const ratio = state.weight / CONFIG.weight.max;
    setFill(weightFill, ratio);
    weightValue.textContent = Math.round(state.weight);

    healthGauge.classList.toggle("low", state.health < CONFIG.player.maxHealth * 0.35);
    weightGauge.classList.toggle("full", ratio > 0.92);

    const gap = state.fogZ - game.playerZ();
    fogDistance.textContent = state.inFog ? "0" : String(Math.max(0, Math.round(gap)));
    fogGauge.classList.toggle("warn", gap < CONFIG.fog.warnDistance && gap > 6);
    fogGauge.classList.toggle("danger", gap <= 6);
    fogGauge.classList.toggle("sheltered", state.fires > 0);

    // L'assombrissement monte bien avant l'entrée dans la brume : c'est le
    // seul indice de proximité quand la caméra regarde vers l'avant.
    const closeness = 1 - Math.min(1, Math.max(0, gap / CONFIG.fog.warnDistance));
    vignette.style.opacity = String(state.inFog ? 0.92 : closeness * 0.7);

    if (state.collecting) {
      collectRing.hidden = false;
      collectFill.style.height = `${Math.round(state.collectProgress * 100)}%`;
    } else {
      collectRing.hidden = true;
    }

    renderBag(state);
    if (sacOuvert) renderPanel(state);

    // La mort ferme le sac : le panneau resterait par-dessus l'écran de fin.
    if (state.dead && sacOuvert) fermerSac();

    renderDeath(state);
  }

  game.onChange(render);
  render(game.state);

  /**
   * Échelle de temps demandée par l'interface. La boucle de jeu la lit à
   * chaque image ; elle ne connaît pas le sac, seulement ce nombre.
   */
  function echelleTemps() {
    return sacOuvert ? modeCourant().bagTimeScale : 1;
  }

  return { render, echelleTemps, get sacOuvert() { return sacOuvert; } };
}

/**
 * Overlay de métriques, activé par ?fogtest ou ?diag. Sert à contrôler le coût
 * réel sur l'appareil, pas seulement en test automatisé.
 */
export function bindPerfOverlay(renderer, readState) {
  const panel = document.createElement("div");
  panel.id = "perf";
  document.body.appendChild(panel);

  let frames = 0;
  let elapsed = 0;
  let fps = 0;
  let worstFrame = 0;

  return function updatePerf(delta) {
    frames++;
    elapsed += delta;
    worstFrame = Math.max(worstFrame, delta);

    if (elapsed < 0.5) return;

    fps = frames / elapsed;
    const info = renderer.info;
    const extra = readState();

    panel.textContent =
      `${fps.toFixed(0)} fps   pire ${(worstFrame * 1000).toFixed(0)} ms   pr ${renderer.getPixelRatio().toFixed(2)}\n` +
      `${info.render.calls} calls   ${info.render.triangles} tris   ` +
      `${info.memory.geometries} geo   ${info.memory.textures} tex\n` +
      `${extra.chunks} chunks   ${extra.objects} objets   ${extra.resources} ressources`;

    frames = 0;
    elapsed = 0;
    worstFrame = 0;
  };
}

/**
 * Overlay ?worldtest — contrôle du monde vivant.
 *
 * Le panneau ?fogtest mesure le coût de rendu ; celui-ci mesure ce que le
 * WorldDirector a réellement produit autour du joueur. Les deux répondent à des
 * questions différentes : « est-ce que ça tient 45 images par seconde » et
 * « est-ce que le monde est peuplé de ce qu'on croit ».
 *
 * Il est relevé deux fois par seconde, pas à chaque image : le parcours de
 * scène qu'il demande coûterait plus cher que ce qu'il mesure.
 */
export function bindWorldTest(renderer, lireMonde) {
  const panel = document.createElement("div");
  panel.id = "worldtest";
  document.body.appendChild(panel);

  let frames = 0;
  let cumul = 0;
  let pire = 0;

  return function updateWorldTest(delta) {
    frames++;
    cumul += delta;
    pire = Math.max(pire, delta);

    if (cumul < 0.5) return;

    const fps = frames / cumul;
    const info = renderer.info;
    const m = lireMonde();

    // Chrome expose le tas JS ; ailleurs la ligne est simplement absente
    // plutôt que remplie d'un zéro trompeur.
    const tas = performance.memory
      ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} Mo JS`
      : "tas non mesurable";

    panel.textContent =
      `${fps.toFixed(0)} fps   pire ${(pire * 1000).toFixed(0)} ms\n` +
      `${info.render.calls} calls   ${info.render.triangles} tris   ` +
      `${info.memory.geometries} géo   ${tas}\n` +
      `${m.chunks} chunks   ${m.structures} structures   ${m.reperes} repères\n` +
      `${m.nomades} nomades   ${m.animaux} animaux   ${m.oiseaux} oiseaux\n` +
      `${m.entites} entités vivantes   ${m.ressources} ressources`;

    frames = 0;
    cumul = 0;
    pire = 0;
  };
}
