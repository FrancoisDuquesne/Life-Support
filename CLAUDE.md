# CLAUDE.md

## Build & Run

Backend:
```bash
./mvnw package -DskipTests
java -jar target/quarkus-app/quarkus-run.jar
```

Dev mode: `./mvnw quarkus:dev`

Frontend (Nuxt 3 SPA):
```bash
cd frontend && npm run dev     # dev server on :3000, proxies /colony to :8080
cd frontend && npm run build   # static SPA in .output/public/
cd frontend && npm run deploy  # build + copy into Quarkus static resources
```

## Architecture

- **Backend**: Quarkus 3.17, Java 21. Colony state in `Colony.java`, game loop in `GameTickService` (SSE ticks every 5s), REST in `ColonyResource`.
- **Frontend**: Nuxt 3 SPA in `frontend/`. Vue 3 SFCs with `<script setup>`, scoped CSS. HTML5 Canvas hex map.
  - `utils/`: shared modules — `constants.js` (hex geometry, colors), `hex.js` (hex math), `drawing.js` (canvas rendering)
  - `composables/`: `useColony.js`, `useCamera.js`, `useGridInteraction.js`
  - `components/`: `HeaderBar.vue`, `ResourcePanel.vue`, `PopulationBar.vue`, `GameMap.vue`, `BuildPanel.vue`, `ResourceGraph.vue`, `EventLog.vue`
  - `pages/index.vue`: root page wiring all components
  - Dev proxy: `/colony` -> `http://localhost:8080` (in nuxt.config.ts)

## Key Conventions

- Canvas rendering uses CSS-pixel space; DPR scaling is handled by `ctx.scale(dpr, dpr)` in the render loop. Do NOT multiply input coords by DPR.
- Hex grid uses flat-top, odd-q offset coordinates. Hex origin offset (`HEX_W/2`, `HEX_H/2`) must be subtracted in `screenToGrid` before axial conversion.
- `revealedTiles` is a `Set<string>` of `"x,y"` keys. All map rendering layers skip unrevealed tiles.
- The `drawBuilding()` function in `utils/drawing.js` is shared between `GameMap` (on-map) and `BuildPanel` (thumbnails) — keep the signature `(ctx, type, x, y, size, alpha)` compatible.
- Resource history is capped at 60 entries. Sparklines show the last 20.
- Nuxt auto-imports: `ref`, `computed`, `watch`, `onMounted`, `onUnmounted`, `nextTick` are available without explicit imports in composables and `<script setup>`.
