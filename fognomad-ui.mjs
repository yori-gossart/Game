/**
 * FOG NOMAD — liaison de l'interface de run.
 *
 * Séparé de la logique de jeu : ce module ne décide de rien, il reflète l'état
 * et transmet les deux seules actions du joueur (jeter un objet, recommencer).
 */

import { CONFIG } from "./fognomad.mjs";

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
  let lastCollected = 0;

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

      const drop = document.createElement("button");
      drop.type = "button";
      drop.textContent = "×";
      drop.setAttribute("aria-label", `Jeter un ${spec.label}`);
      drop.addEventListener("click", (event) => {
        event.preventDefault();
        game.dropOne(key);
        render(game.state);
      });

      chip.append(swatch, label, kg, drop);
      bagList.appendChild(chip);
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
    renderDeath(state);
  }

  game.onChange(render);
  render(game.state);

  return { render };
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
