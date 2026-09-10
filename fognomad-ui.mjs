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
  const pickButton = $("#pick-up");
  const pickLabel = $("#pick-up-texte");
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

  pickButton.addEventListener("click", (event) => {
    event.preventDefault();
    game.collectCandidate();
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

    // Le bouton n'existe que tant qu'il y a quelque chose à prendre. Il porte
    // le NOM de la ressource : le joueur doit pouvoir décider sans s'arrêter,
    // et « prendre » tout court ne lui dit pas s'il ramasse sept kilos de bois
    // ou treize de pierre.
    const cible = state.candidate && !state.collecting ? state.candidateType : null;
    pickButton.hidden = !cible;
    if (cible) {
      const spec = CONFIG.resources[cible];
      pickLabel.textContent = spec ? spec.label.toUpperCase() : "PRENDRE";
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

/**
 * Overlay ?prologuetest — conduire le prologue sans le rejouer.
 *
 * Le prologue dure une dizaine de minutes et ses quinze étapes s'enchaînent
 * dans un seul ordre. Vérifier la douzième en la jouant coûte donc onze étapes
 * à chaque essai, et c'est ainsi qu'on finit par ne plus la vérifier du tout.
 *
 * Ce panneau donne trois choses, et rien d'autre : ce que le prologue croit,
 * un moyen d'aller directement à une étape, et un moyen de le refaire.
 *
 * Il ne CONTOURNE rien : `sauterA()` franchit réellement chaque étape
 * intermédiaire, dans l'ordre, avec ses effets — le sac est ramassé, la Brume
 * est relâchée, l'objectif est posé. Un saut qui se contenterait d'écrire un
 * nom d'étape mentirait sur l'état du jeu, et le premier bug qu'il masquerait
 * serait précisément celui qu'on cherchait.
 */
export function bindPrologueTest({ prologue, game, player, etapes, renderer }) {
  const panel = document.createElement("div");
  panel.id = "prologuetest";

  // Le panneau complet couvre le joystick et les boutons d'action : les deux
  // coins bas de l'écran leur appartiennent, et il n'y a pas de troisième
  // coin. Un panneau de test qui empêche de jouer ne sert à rien — c'est très
  // exactement le défaut de la 0.6, où le banc s'affichait sous l'écran de
  // chargement et personne ne s'en apercevait avant l'appareil.
  //
  // Il s'ouvre donc, et se referme. Replié, il ne montre que sa lecture ;
  // déplié, il montre ses commandes et masque celles du jeu, ce qui est un
  // choix que le testeur fait au moment où il en a besoin.
  const lecture = document.createElement("div");
  lecture.className = "lecture";
  lecture.onclick = () => panel.classList.toggle("ouvert");
  lecture.title = "Toucher pour ouvrir ou fermer les commandes";
  panel.appendChild(lecture);

  const barre = document.createElement("div");
  barre.className = "barre";
  panel.appendChild(barre);

  function bouton(texte, titre, faire) {
    const b = document.createElement("button");
    b.textContent = texte;
    b.title = titre;
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); faire(); };
    barre.appendChild(b);
    return b;
  }

  bouton("⟲", "Rejouer le prologue depuis le début", () => prologue.demarrer());
  bouton("⏭", "Franchir l'étape suivante", () => {
    const i = etapes.indexOf(prologue.etape);
    if (i >= 0 && i < etapes.length - 1) prologue.sauterA(etapes[i + 1]);
  });
  // Les deux sauts qui coûtent le plus cher à rejouer : la structure ancienne
  // est à 620 unités du départ, la sortie à 760.
  bouton("⛏", "Sauter à la structure ancienne", () => {
    prologue.sauterA("ANCIENT_STRUCTURE_FOUND");
    // Le saut d'étape ne déplace pas le joueur : sans cela le bouton
    // APPROCHER resterait invisible et l'étape suivante serait injouable.
    //
    // La destination est lue sur l'OBJET réellement posé, pas recalculée
    // depuis SCENE : le pilier est ancré sur la position du joueur au réveil,
    // et refaire le calcul depuis sa position courante viserait un point
    // différent à chaque appui.
    const pilier = window.HORIZON?.scene.getObjectByName("prologue-pilier-ancien");
    if (pilier) window.HORIZON.teleport(pilier.position.x, pilier.position.z + 8);
  });
  bouton("✦", "Déclencher le pilier et la réaction de la Brume",
         () => prologue.forcerPilier());
  bouton("⇥", "Terminer : passer au monde procédural",
         () => prologue.terminer("panneau de test"));

  const listeEtapes = document.createElement("div");
  listeEtapes.className = "etapes";
  panel.appendChild(listeEtapes);
  const pastilles = etapes.map((nom) => {
    const el = document.createElement("span");
    el.textContent = nom.replace(/_/g, " ").toLowerCase();
    el.title = nom;
    el.onclick = () => prologue.sauterA(nom);
    listeEtapes.appendChild(el);
    return el;
  });

  document.body.appendChild(panel);

  let cumul = 0;
  let images = 0;
  let fps = 0;
  return function updatePrologueTest(delta) {
    cumul += delta;
    images++;
    if (cumul < 0.25) return;
    fps = images / cumul;
    cumul = 0;
    images = 0;

    const p = prologue;
    const s = game.state;
    const info = renderer.info;
    const objectif = document.getElementById("pro-objectif-texte")?.textContent || "—";

    // Ce qu'il faut pour juger une passe sans rejouer quinze minutes : où on en
    // est, ce que la Brume fait, ce que le joueur porte, et l'état des deux
    // scènes qui peuvent silencieusement ne pas se jouer — le condamné et le
    // pilier. Le §T les demande nommément, et pour cause : ce sont exactement
    // les deux qui étaient marquées PASS en 0.7 sans avoir eu lieu.
    const cond = p.acteurs.find((a) => a.condamne);
    const profil = game.brumeProfil;
    const pilier = window.HORIZON?.scene.getObjectByName("prologue-pilier-ancien");
    const traces = window.HORIZON?.scene.getObjectByName("prologue-traces");
    const dist = (o) => o
      ? Math.hypot(player.position.x - o.position.x, player.position.z - o.position.z).toFixed(0) + " u"
      : "pas posé";

    lecture.textContent =
      `${p.actif ? "PROLOGUE ACTIF" : "monde procédural"}   ${p.temps.toFixed(1)} s   ` +
      `${fps.toFixed(0)} fps  ${info.render.calls} calls  ${info.render.triangles} tris\n` +
      `étape     ${p.etape || "—"}   (${p.franchies.length}/${etapes.length})\n` +
      `objectif  ${objectif}\n` +
      `brume     ${game.fogGap.toFixed(0)} u devant   ${profil.vitesse} u/s   ` +
      `profil ${profil.nom}\n` +
      `joueur    z ${player.position.z.toFixed(0)}   parcouru ${s.distance.toFixed(0)} u   ` +
      `${(s.weight).toFixed(0)}/${game.config.weight.max} kg\n` +
      `sac       ${p.sacPris ? "pris" : "au sol"}   ${s.collected} ramassée(s)   ` +
      `${s.firesLit} feu(x)   ${s.candidateType || "—"} à portée\n` +
      `condamné  ${cond ? (cond.vivant ? "court" : "ENGLOUTI") : "pas lâché"}` +
      `${cond ? "   z " + cond.z : ""}\n` +
      `traces    ${dist(traces)}       pilier   ${dist(pilier)}   ` +
      `${p.franchies.includes("CRYSTAL_INTERACTION") ? "activé" : "inerte"}\n` +
      `décor     ${p.props.length} objet(s)   acteurs ` +
      `${p.acteurs.filter((a) => a.vivant).length}/${p.acteurs.length}`;

    for (let i = 0; i < pastilles.length; i++) {
      const nom = etapes[i];
      pastilles[i].className = p.franchies.includes(nom)
        ? (nom === p.etape ? "courante" : "faite") : "";
    }
  };
}

/**
 * Overlay ?fogtest — regarder la Brume, pas la mesurer.
 *
 * `?fogtest` existait déjà et servait au panneau de performance ; il continue.
 * Ce panneau-ci s'y AJOUTE, parce que le §U demande de pouvoir observer la
 * Brume à plusieurs distances sans jouer quinze minutes pour y arriver, et que
 * séparer les deux aurait créé un troisième paramètre à retenir.
 *
 * Il fait trois choses et pas une de plus : poser la Brume à une distance
 * choisie, se retourner pour la regarder, et dire ce qu'on est en train de
 * voir. La 0.7 a montré qu'un diagnostic de brume tenait entièrement dans ces
 * trois gestes — et qu'aucun raisonnement ne les remplaçait.
 */
export function bindFogTest({ game, player, horizon }) {
  const panel = document.createElement("div");
  panel.id = "fogtest-vue";

  const lecture = document.createElement("div");
  lecture.className = "lecture";
  panel.appendChild(lecture);

  const barre = document.createElement("div");
  barre.className = "barre";
  panel.appendChild(barre);

  // Les quatre distances qui comptent, et pourquoi.
  //   10  elle vous mange — c'est l'image de la mort
  //   30  c'est la distance du diagnostic 0.7, celle où le mur était plat
  //   60  la distance de révélation du prologue (§12)
  //  140  de loin, quand elle barre l'horizon
  for (const d of [10, 30, 60, 140]) {
    const b = document.createElement("button");
    b.textContent = `${d} u`;
    b.onclick = (e) => { e.preventDefault(); horizon.setFogGap(d); };
    barre.appendChild(b);
  }

  const regard = document.createElement("button");
  regard.textContent = "↻ regarder";
  regard.title = "Se retourner vers la Brume — elle est TOUJOURS hors champ sinon";
  regard.onclick = (e) => {
    e.preventDefault();
    // La caméra du jeu est dos à la Brume. Sans ce bouton, ce panneau
    // proposerait de regarder quelque chose qu'on ne peut pas voir.
    horizon.setYaw(Math.abs(horizon.yaw) < 1.6 ? Math.PI : 0);
  };
  barre.appendChild(regard);

  const seules = document.createElement("button");
  seules.textContent = "◐ nappes seules";
  seules.title = "Masquer tout le reste : c'est ainsi qu'on a vu que le mur était plat";
  let isole = false;
  seules.onclick = (e) => {
    e.preventDefault();
    isole = !isole;
    seules.classList.toggle("actif", isole);
    horizon.isolerBrume(isole);
  };
  barre.appendChild(seules);

  document.body.appendChild(panel);

  let cumul = 0;
  return function updateFogTest(delta) {
    cumul += delta;
    if (cumul < 0.3) return;
    cumul = 0;

    const n = game.fogLayers;
    lecture.textContent =
      `BRUME   ${game.fogGap.toFixed(0)} u devant   ${game.brumeProfil.vitesse} u/s   ` +
      `profil ${game.brumeProfil.nom}\n` +
      `caméra  lacet ${horizon.yaw.toFixed(2)}   ` +
      `${Math.abs(Math.abs(horizon.yaw) - Math.PI) < 0.6 ? "TOURNÉE VERS LA BRUME" : "dos à la Brume"}\n` +
      `nappes  ${n.map((l) => `${l.z >= 0 ? "+" : ""}${l.z} u`).join("  ")}\n` +
      `relief  crête ±${n.map((l) => l.crest.toFixed(2)).join(" ")}   ` +
      `profondeur ±${n.map((l) => l.depth.toFixed(0)).join(" ")} u`;
  };
}
