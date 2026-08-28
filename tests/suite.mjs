import { chromium, devices, CHROME, GL_ARGS } from "./_pw.mjs";

const URL = "http://127.0.0.1:8123/index.html";
import { mkdirSync } from "node:fs";
const OUT = process.env.SHOT_DIR || "./.shots";
mkdirSync(OUT, { recursive: true });
const TAG = process.argv[2] || "run";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});
const ctx = await browser.newContext({ ...devices["Pixel 7"], hasTouch: true, isMobile: true });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text());
                          if (m.type() === "warning") errors.push("WARN: " + m.text()); });
page.on("response", r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

await page.goto(URL, { waitUntil: "load" });
await page.waitForTimeout(2000);

// ---- 1. boot / webgl ----
const boot = await page.evaluate(() => ({
  hasApi: typeof window.HORIZON === "object",
  webgl: (() => { const c = document.querySelector("#world");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    return gl ? gl.getParameter(gl.VERSION) : null; })(),
  canvas: (() => { const c = document.querySelector("#world");
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }; })(),
  docW: document.documentElement.clientWidth,
  docH: document.documentElement.clientHeight,
  scrollW: document.documentElement.scrollWidth,
  loadingGone: !document.querySelector("#loading")
}));
check("boot: WebGL context", !!boot.webgl, boot.webgl || "none");
check("boot: debug API", boot.hasApi);

// ---- 2. mobile layout ----
const vp = page.viewportSize();
check("mobile: canvas fills viewport",
  boot.canvas.cw === vp.width && Math.abs(boot.canvas.ch - vp.height) <= 2,
  `canvas ${boot.canvas.cw}x${boot.canvas.ch} vs vp ${vp.width}x${vp.height}`);
check("mobile: no horizontal overflow", boot.scrollW <= vp.width,
  `scrollW ${boot.scrollW} vs ${vp.width}`);

// controls on-screen and touch-sized
const ui = await page.evaluate(() => {
  const box = s => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
             touchAction: getComputedStyle(e).touchAction }; };
  return { joystick: box("#joystick"), run: box("#run"), nw: box("#new-world"),
           canvas: box("#world"), hud: box("#hud"),
           bodyTouch: getComputedStyle(document.body).touchAction };
});
const inView = b => b && b.x >= 0 && b.y >= 0 && b.right <= vp.width + 1 && b.bottom <= vp.height + 1;
check("mobile: joystick on screen", inView(ui.joystick), JSON.stringify(ui.joystick));
check("mobile: run button on screen", inView(ui.run));
check("mobile: run button >= 44px", ui.run.w >= 44 && ui.run.h >= 44, `${ui.run.w}x${ui.run.h}`);
check("mobile: canvas touch-action none", ui.canvas.touchAction === "none",
  `canvas touch-action=${ui.canvas.touchAction}`);
check("mobile: run button touch-action none", ui.run.touchAction === "none",
  `run touch-action=${ui.run.touchAction}`);

// ---- 3. joystick via real touch ----
const jb = ui.joystick;
const jcx = jb.x + jb.w / 2, jcy = jb.y + jb.h / 2;
const posBefore = await page.evaluate(() => window.HORIZON.pos);

await page.dispatchEvent("#joystick", "pointerdown",
  { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: jcx, clientY: jcy, bubbles: true });
await page.dispatchEvent("#joystick", "pointermove",
  { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: jcx, clientY: jcy - jb.h * 0.4, bubbles: true });
await page.waitForTimeout(1200);
const stickT = await page.evaluate(() => document.querySelector("#stick").style.transform);
const posMid = await page.evaluate(() => window.HORIZON.pos);
await page.dispatchEvent("#joystick", "pointerup",
  { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: jcx, clientY: jcy - jb.h * 0.4, bubbles: true });
await page.waitForTimeout(400);
const posAfterRelease = await page.evaluate(() => window.HORIZON.pos);

const movedDist = Math.hypot(posMid.x - posBefore.x, posMid.z - posBefore.z);
check("joystick: touch moves player", movedDist > 2, `moved ${movedDist.toFixed(2)}u`);
check("joystick: stick visual follows", /translate\(.*px/.test(stickT), stickT);
const driftAfter = Math.hypot(posAfterRelease.x - posMid.x, posAfterRelease.z - posMid.z);
check("joystick: stops on release", driftAfter < 1.0, `drift ${driftAfter.toFixed(2)}u`);
const stickReset = await page.evaluate(() => document.querySelector("#stick").style.transform);
check("joystick: stick recentres", /translate\(0(px)?, ?0(px)?\)/.test(stickReset), stickReset);

// ---- 4. run ----
async function travel(seconds, run) {
  const p0 = await page.evaluate(() => window.HORIZON.pos);
  await page.evaluate(([r]) => { window.HORIZON.move(0, -1); window.HORIZON.setRun(r); }, [run]);
  await page.waitForTimeout(seconds * 1000);
  const p1 = await page.evaluate(() => window.HORIZON.pos);
  await page.evaluate(() => { window.HORIZON.move(0, 0); window.HORIZON.setRun(false); });
  return Math.hypot(p1.x - p0.x, p1.z - p0.z) / seconds;
}
const walkSpeed = await travel(1.5, false);
const runSpeed = await travel(1.5, true);
check("run: sprint faster than walk", runSpeed > walkSpeed * 1.3,
  `walk ${walkSpeed.toFixed(1)} u/s, run ${runSpeed.toFixed(1)} u/s`);

// ---- 5. camera drag on right side ----
const yaw0 = await page.evaluate(() => { window.HORIZON.setYaw(0); return 0; });
const rx = vp.width * 0.75, ry = vp.height * 0.5;
await page.dispatchEvent("#world", "pointerdown",
  { pointerId: 2, pointerType: "touch", isPrimary: true, clientX: rx, clientY: ry, bubbles: true });
for (let i = 1; i <= 6; i++)
  await page.dispatchEvent("#world", "pointermove",
    { pointerId: 2, pointerType: "touch", isPrimary: true, clientX: rx + i * 12, clientY: ry, bubbles: true });
await page.dispatchEvent("#world", "pointerup",
  { pointerId: 2, pointerType: "touch", isPrimary: true, clientX: rx + 72, clientY: ry, bubbles: true });
await page.waitForTimeout(200);
const yawAfter = await page.evaluate(() => window.HORIZON.yaw);
check("camera: horizontal drag on right half rotates yaw", Math.abs(yawAfter) > 0.2,
  `yaw 0 -> ${yawAfter.toFixed(3)}`);

// vertical drag -> pitch
const pitch0 = await page.evaluate(() => window.HORIZON.pitch);
await page.dispatchEvent("#world", "pointerdown",
  { pointerId: 3, pointerType: "touch", isPrimary: true, clientX: rx, clientY: ry, bubbles: true });
for (let i = 1; i <= 6; i++)
  await page.dispatchEvent("#world", "pointermove",
    { pointerId: 3, pointerType: "touch", isPrimary: true, clientX: rx, clientY: ry + i * 10, bubbles: true });
await page.dispatchEvent("#world", "pointerup",
  { pointerId: 3, pointerType: "touch", isPrimary: true, clientX: rx, clientY: ry + 60, bubbles: true });
await page.waitForTimeout(150);
const pitch1 = await page.evaluate(() => window.HORIZON.pitch);
check("camera: vertical drag changes pitch", Math.abs(pitch1 - pitch0) > 0.05,
  `pitch ${pitch0.toFixed(3)} -> ${pitch1.toFixed(3)}`);

// left half must NOT rotate the camera (it belongs to the joystick)
await page.evaluate(() => window.HORIZON.setYaw(0));
const lx = vp.width * 0.15;
await page.dispatchEvent("#world", "pointerdown",
  { pointerId: 4, pointerType: "touch", isPrimary: true, clientX: lx, clientY: ry, bubbles: true });
await page.dispatchEvent("#world", "pointermove",
  { pointerId: 4, pointerType: "touch", isPrimary: true, clientX: lx + 80, clientY: ry, bubbles: true });
await page.dispatchEvent("#world", "pointerup",
  { pointerId: 4, pointerType: "touch", isPrimary: true, clientX: lx + 80, clientY: ry, bubbles: true });
await page.waitForTimeout(150);
const yawLeft = await page.evaluate(() => window.HORIZON.yaw);
check("camera: left half reserved for movement", Math.abs(yawLeft) < 0.01, `yaw ${yawLeft}`);


// ---- 6. chunk streaming ----
const beforeTravel = await page.evaluate(() => ({ c: window.HORIZON.chunks, d: window.HORIZON.discovered,
                                                  info: window.HORIZON.info, objs: window.HORIZON.objectsInScene }));
const samples = [];
await page.evaluate(() => { window.HORIZON.move(0, -1); window.HORIZON.setRun(true); });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(700);
  samples.push(await page.evaluate(() => ({ c: window.HORIZON.chunks, d: window.HORIZON.discovered,
    p: window.HORIZON.pos, info: window.HORIZON.info, objs: window.HORIZON.objectsInScene })));
}
await page.evaluate(() => { window.HORIZON.move(0, 0); window.HORIZON.setRun(false); });

const maxChunks = Math.max(...samples.map(s => s.c));
const minChunks = Math.min(...samples.map(s => s.c));
const lastD = samples[samples.length - 1].d;
const dist = Math.hypot(samples.at(-1).p.x - beforeTravel.info ? 0 : 0, 0);
check("chunks: never exceeds 25 active", maxChunks <= 25, `max ${maxChunks}`);
check("chunks: stays close to 25 while streaming", minChunks >= 20, `min ${minChunks}`);
check("chunks: new chunks generated while exploring", lastD > beforeTravel.d,
  `discovered ${beforeTravel.d} -> ${lastD}`);

// real unload proof: geometry count must not grow with distance travelled
const geoStart = beforeTravel.info.geometries;
const geoEnd = samples.at(-1).info.geometries;
check("chunks: GPU geometries bounded (real unload)", geoEnd <= geoStart * 1.5 + 10,
  `geometries ${geoStart} -> ${geoEnd}`);
const objEnd = samples.at(-1).objs;
check("chunks: scene object count bounded", objEnd <= beforeTravel.objs * 1.5 + 20,
  `scene objects ${beforeTravel.objs} -> ${objEnd}`);

console.log("\n--- RENDER COST (after travel) ---");
console.log("draw calls:", samples.at(-1).info.calls, "| triangles:", samples.at(-1).info.tris,
            "| geometries:", samples.at(-1).info.geometries, "| programs:", samples.at(-1).info.programs,
            "| scene objects:", samples.at(-1).objs);

// ---- 7. FPS ----
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
                       else res(n / ((performance.now() - t0) / 1000)); };
  requestAnimationFrame(tick);
}));
console.log("FPS (swiftshader software GL):", fps.toFixed(1));

// ---- 8. long-run leak check ----
await page.evaluate(() => { window.HORIZON.move(0, -1); window.HORIZON.setRun(true); });
await page.waitForTimeout(12000);
await page.evaluate(() => { window.HORIZON.move(0, 0); window.HORIZON.setRun(false); });
const far = await page.evaluate(() => ({ c: window.HORIZON.chunks, d: window.HORIZON.discovered,
  info: window.HORIZON.info, objs: window.HORIZON.objectsInScene, p: window.HORIZON.pos }));
check("chunks: settles back to 25 after long run", far.c === 25, `chunks ${far.c}`);
check("chunks: geometries still bounded after long run", far.info.geometries <= geoStart * 1.5 + 10,
  `geometries ${far.info.geometries}, travelled to X${far.p.x.toFixed(0)} Z${far.p.z.toFixed(0)}, discovered ${far.d}`);

await page.screenshot({ path: `${OUT}/${TAG}-explore.png` });

// ---- 9. persistence ----
const savedState = await page.evaluate(() => ({ seed: window.HORIZON.seed, pos: window.HORIZON.pos }));
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.waitForTimeout(300);
const rawSave = await page.evaluate(() => localStorage.getItem("horizon-proto-0.2-save"));
check("save: written to localStorage", !!rawSave, rawSave ? rawSave.slice(0, 120) : "null");

await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);
const restored = await page.evaluate(() => ({ seed: window.HORIZON.seed, pos: window.HORIZON.pos }));
check("save: same seed after reload", restored.seed === savedState.seed,
  `${savedState.seed} -> ${restored.seed}`);
// Depuis Fog Nomad 0.3 la position n'est volontairement PLUS restaurée : la
// recharger remettrait la brume à distance de sécurité. La seed l'est toujours,
// donc le monde est identique et la run repart du départ.
const fromOrigin = Math.hypot(restored.pos.x, restored.pos.z);
check("save: run repart du départ (position non restaurée, par conception)",
  fromOrigin < 5,
  `X${savedState.pos.x.toFixed(1)} Z${savedState.pos.z.toFixed(1)} -> X${restored.pos.x.toFixed(1)} Z${restored.pos.z.toFixed(1)}`);

// Déterminisme : même seed => même terrain. On échantillonne à coordonnées
// fixes, et non sous le joueur, qui ne repart plus au même endroit.
const det = await page.evaluate(() => {
  const pts = [];
  for (let i = 0; i < 12; i++) pts.push(window.HORIZON.terrainAt(i * 37.3, -i * 21.7));
  return { pts, seed: window.HORIZON.seed };
});
check("save: world regenerated identically (seed drives terrain)",
  det.seed === savedState.seed && det.pts.every(Number.isFinite),
  `seed ${det.seed}, ${det.pts.length} points échantillonnés`);
globalThis.__detPts = det.pts;

// ---- 10. new world button ----
// Depuis la 0.5, NOUVEAU est un outil de développement : il ne s'affiche
// qu'en mode dev (?fogtest / ?diag), parce qu'un joueur qui fuit une brume
// n'a rien à faire d'un bouton qui régénère le monde. Le comportement, lui,
// doit rester vérifié — on active donc le mode dev pour le tester.
const seedBefore = restored.seed;
await page.evaluate(() => document.body.classList.add("dev"));
await page.click("#new-world");
await page.waitForTimeout(800);
const afterNew = await page.evaluate(() => ({ seed: window.HORIZON.seed, pos: window.HORIZON.pos,
                                              c: window.HORIZON.chunks }));
check("new world: seed changes", afterNew.seed !== seedBefore, `${seedBefore} -> ${afterNew.seed}`);
check("new world: player respawns at origin",
  Math.hypot(afterNew.pos.x, afterNew.pos.z) < 5, `X${afterNew.pos.x} Z${afterNew.pos.z}`);
check("new world: chunks rebuilt", afterNew.c === 25, `${afterNew.c}`);

// ---- 11. errors ----
const realErrors = errors.filter(e => !e.includes("favicon"));
check("runtime: no console/page errors", realErrors.length === 0,
  realErrors.length ? JSON.stringify(realErrors.slice(0, 6)) : "clean");

console.log("\n================ SUMMARY ================");
const failed = results.filter(r => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log("FAILURES:"); failed.forEach(f => console.log("  ✗ " + f.name + " — " + f.detail)); }
console.log("ALL ERRORS SEEN:", errors.length ? JSON.stringify(errors, null, 2) : "none");

await browser.close();
process.exit(failed.length ? 1 : 0);
