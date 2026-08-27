/**
 * Résolution de Playwright : installé globalement dans l'environnement de
 * développement, localement ailleurs. PLAYWRIGHT_PATH permet de forcer.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);

function resolvePlaywright() {
  if (process.env.PLAYWRIGHT_PATH) return process.env.PLAYWRIGHT_PATH;
  try {
    return require.resolve("playwright");
  } catch {
    const root = execSync("npm root -g").toString().trim();
    return `${root}/playwright/index.js`;
  }
}

const mod = await import(resolvePlaywright());
export const { chromium, devices } = mod.default ?? mod;

export const CHROME =
  process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export const GL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
