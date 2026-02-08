# CLAUDE.md

## Build & Run

Fully client-side static SPA — no backend needed.

```bash
cd frontend && npm run dev     # dev server on :3000
cd frontend && npm run build   # static SPA in .output/public/
cd frontend && npm run preview # build + serve locally
```

Deploy: upload `frontend/.output/public/*` to any static host.

Legacy backend (optional, no longer required):
```bash
./mvnw package -DskipTests
java -jar target/quarkus-app/quarkus-run.jar
```

## Architecture

- **Game engine**: All game logic runs client-side in `frontend/utils/gameEngine.js` (port of Colony.java + ColonyService.java). Tick loop via `setInterval` in `useColony.js`.
- **Persistence**: localStorage save/load in `frontend/utils/saveManager.js`. Auto-saves on every tick and build action.
- **PWA**: Installable via `@vite-pwa/nuxt`. Service worker pre-caches all assets for offline play.
- **Frontend**: Nuxt 3 SPA in `frontend/`. Vue 3 SFCs with `<script setup>`, scoped CSS. HTML5 Canvas hex map.
  - `utils/`: shared modules — `constants.js` (hex geometry, colors), `hex.js` (hex math), `drawing.js` (canvas rendering), `gameEngine.js` (game logic), `saveManager.js` (localStorage)
  - `composables/`: `useColony.js` (state + tick loop + save/load), `useCamera.js`, `useGridInteraction.js`
  - `components/`: `HeaderBar.vue`, `ResourcePanel.vue`, `PopulationBar.vue`, `GameMap.vue`, `BuildPanel.vue`, `ResourceGraph.vue`, `EventLog.vue`
  - `pages/index.vue`: root page wiring all components

## Key Conventions

- Canvas rendering uses CSS-pixel space; DPR scaling is handled by `ctx.scale(dpr, dpr)` in the render loop. Do NOT multiply input coords by DPR.
- Hex grid uses flat-top, odd-q offset coordinates. Hex origin offset (`HEX_W/2`, `HEX_H/2`) must be subtracted in `screenToGrid` before axial conversion.
- `revealedTiles` is a `Set<string>` of `"x,y"` keys. All map rendering layers skip unrevealed tiles.
- The `drawBuilding()` function in `utils/drawing.js` is shared between `GameMap` (on-map) and `BuildPanel` (thumbnails) — keep the signature `(ctx, type, x, y, size, alpha)` compatible.
- Resource history is capped at 60 entries. Sparklines show the last 20.
- Nuxt auto-imports: `ref`, `computed`, `watch`, `onMounted`, `onUnmounted`, `nextTick` are available without explicit imports in composables and `<script setup>`.
- Game state is mutable internally (`colony` object in `useColony`), with reactive snapshots pushed to `state` ref via `toSnapshot()`.
