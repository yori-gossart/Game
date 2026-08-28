# Tests

Cinq suites, exécutées sur Chromium en émulation Pixel 7 avec entrées tactiles.
**166 vérifications au total.**

| Suite | Vérifications | Couvre |
| --- | --- | --- |
| `suite.mjs` | 32 | moteur 0.2 : démarrage, tactile, caméra, streaming de chunks, sauvegarde |
| `audit.mjs` | 26 | audit 0.2 : mémoire, quadrants, déterminisme, NOUVEAU répété, performance |
| `fog03.mjs` | 42 | Fog Nomad 0.3 : brume, dégâts, mort, restart, ressources, poids, sac, endurance, jeter |
| `fog04.mjs` | 47 | Fog Nomad 0.4 : ressources sur 100 chunks, objets jetés, cristal, feu, 10 cycles mort/restart |
| `regressions.mjs` | 19 | défauts historiques déjà corrigés, visés par leur **mécanisme** |

## Lancer

```bash
npx http-server -p 8123 -c-1 .        # ou : python3 -m http.server 8123
node tests/suite.mjs
node tests/audit.mjs
node tests/fog03.mjs
node tests/fog04.mjs
node tests/regressions.mjs
```

Variables d'environnement : `URL` et `FOG_URL` (défaut
`http://127.0.0.1:8123/index.html`), `CHROME_PATH`, `PLAYWRIGHT_PATH`,
`SHOT_DIR` pour les captures.

## Deux principes

**`regressions.mjs` vise les causes, pas les symptômes.** Un test qui ne
vérifie que le symptôme laisse revenir la cause sous une autre forme. Il ne
teste donc pas « l'écran n'est pas noir » mais « aucune fleur n'est
instanciée », qui est le mécanisme réellement identifié.

**Le rendu de test est logiciel (SwiftShader).** Les FPS relevés ne transposent
pas sur un GPU réel : ils servent à comparer avant/après, pas à valider la
cible mobile. Cette validation-là se fait sur appareil, avec `?fogtest`.
