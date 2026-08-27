# Tests

Trois suites, exécutées sur Chromium en émulation Pixel 7 avec entrées tactiles.

| Suite | Couvre |
| --- | --- |
| `suite.mjs` | moteur 0.2 : démarrage, tactile, caméra, streaming de chunks, sauvegarde |
| `audit.mjs` | audit 0.2 : mémoire, quadrants, déterminisme, NOUVEAU répété, performance |
| `fog03.mjs` | Fog Nomad 0.3 : brume, dégâts, mort, restart, ressources, poids, sac, endurance, jeter, 10 runs |

## Lancer

```bash
npx http-server -p 8123 -c-1 .        # ou : python3 -m http.server 8123
node tests/suite.mjs
node tests/audit.mjs
node tests/fog03.mjs
```

Variables d'environnement : `URL` (défaut `http://127.0.0.1:8123/index.html`),
`CHROME_PATH`, `PLAYWRIGHT_PATH`, `SHOT_DIR` pour les captures.

Le rendu de test est **logiciel** (SwiftShader). Les FPS relevés ne transposent
pas sur un GPU réel : ils servent à comparer avant/après, pas à valider la cible
mobile. Cette validation-là se fait sur appareil.
