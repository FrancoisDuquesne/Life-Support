# CLAUDE.md — Space Colony ("Life Support")

Single-player, fully client-side colony-building strategy game on a hex grid. No backend.

## Build & Run

```bash
npm run dev       # dev server on :3000
npm run build     # static SPA → .output/public/
npm run preview   # build + serve locally
npm run format    # prettier --write .
```

Deploy: upload `.output/public/*` to any static host.

## Stack

- **Nuxt 4** (SSR off) + **Vue 3** (`<script setup>`) + **Tailwind CSS v4**
- **NuxtUI v4** (`@nuxt/ui`) — UButton, UCard, UBadge, UModal, UDrawer, UButtonGroup
- **PWA** via `@vite-pwa/nuxt` — offline-capable, auto-updating service worker
- **Fonts**: Orbitron (headings), Rajdhani (body) via `@nuxt/fonts`
- **No test framework** — no unit/integration tests exist
- **Formatter**: Prettier (+ prettier-plugin-tailwindcss)

## Directory Structure

```
utils/                    # Pure JS — NO Vue dependencies
├─ gameEngine.js          # Core game logic: state, ticks, building, resources
├─ drawing.js             # Canvas rendering: hexes, buildings, overlays, effects
├─ terrain.js             # Procedural terrain generation, deposits, hazards
├─ eventEngine.js         # Random events: dust storm, meteor, solar flare, etc.
├─ colonistEngine.js      # Colonist simulation: roles, health, morale, growth
├─ saveManager.js         # localStorage persistence with version migrations
├─ milestones.js          # 10 achievements with unlock conditions
├─ constants.js           # Hex geometry constants (HEX_SIZE=18, HEX_W, HEX_H)
├─ hex.js                 # Hex math: neighbors, distance, offsetToCube, hexesInRadius
└─ formatting.js          # Number display: compact, signed, clamped

composables/              # Vue 3 composition functions
├─ useColony.js           # Main state manager: tick loop, save/load, build actions
├─ useCamera.js           # Viewport: pan, zoom (0.5–2.0×), screen↔grid conversion
└─ useGridInteraction.js  # Input handling: click, drag, pinch, long-press, hover

components/
├─ GameMap.vue            # 100% Canvas — hex grid, buildings, terrain, events
├─ BuildPanel.vue         # Building selector with cost/production preview
├─ RadialBuildMenu.vue    # Mobile long-press radial menu for placement
├─ HeaderBar.vue          # Title, pause button, tick counter
├─ ResourcePanel.vue      # Resource display (sidebar desktop / top bar mobile)
├─ PopulationBar.vue      # Population / capacity progress bar
├─ ResourceGraph.vue      # Modal sparkline chart (UModal)
├─ EventLog.vue           # Scrolling event messages
├─ ResourceIcon.vue       # Small resource badge
└─ TutorialOverlay.vue    # Guided tutorial steps

pages/index.vue           # Root page wiring all components + event handlers
app.vue                   # UApp wrapper, injects --game-bg CSS variable
app.config.ts             # NuxtUI theme: primary=orange, neutral=slate
nuxt.config.ts            # Nuxt config: SSR off, modules, PWA, fonts
assets/css/main.css       # Tailwind imports, resource color tokens, base styles
```

## Game Engine (`utils/gameEngine.js`)

### Building Types (12)

| Type | Produces | Consumes | Cost (minerals) | Footprint |
|------|----------|----------|-----------------|-----------|
| MDV_LANDING_SITE | — | — | — | 7 cells (starter) |
| PIPELINE | — | — | 2 | 1 cell |
| SOLAR_PANEL | +5 energy | — | 10 | 1 cell |
| HYDROPONIC_FARM | +5 food | water, energy | 15 | 1 cell |
| WATER_EXTRACTOR | +6 water | energy | 12 | 1 cell |
| MINE | +4 minerals | energy | 12 | 2 cells |
| HABITAT | +5 pop cap | — | 20 | 2 cells |
| OXYGEN_GENERATOR | +6 oxygen | water, energy | 15 | 1 cell |
| RTG | +5 energy | — | 25 | 1 cell |
| RECYCLING_CENTER | -3 waste/tick | — | 18 | 3 cells |
| REPAIR_STATION | 5 HP/tick shared | — | 20 | 1 cell |

- Buildings can upgrade to level 3 (cost: 12M × level, 5E × level)
- HP degrades 0.25/tick; repair stations distribute a shared pool
- Build requires adjacency to existing colony (MDV adjacency enforced)
- `getBuildableCells()` returns cells within 5 hexes of colony core

### Resources (5 + waste)

| Resource | Start | Notes |
|----------|-------|-------|
| energy | 100 | Solar affected by dust storms; RTG immune |
| food | 50 | Consumed by population (0.5 per colonist) |
| water | 50 | Consumed by farms, O2 gens, colonists (0.33 each) |
| minerals | 30 | Spent on building costs |
| oxygen | 80 | Consumed 1.0 per colonist |
| waste | 0 / 50 cap | +0.3/building/tick, +0.2/colonist/tick; overflow → -25% production |

### Key Functions

```
createColonyState(options)          → Initialize new game
processTick(state, terrainMap, revealedTiles) → One tick; returns { tick, events, colonyState, newRevealedTiles }
buildAt(state, type, x, y, terrainMap)       → Place building (synchronous)
demolishAt(state, x, y)            → Remove building
upgradeBuildingAt(state, x, y)     → Level up building
validateBuildPlacement(state, type, x, y, terrainMap) → Check placement rules
computeResourceDeltas(state, terrainMap)     → Production/consumption preview (non-mutating)
toSnapshot(state)                  → Mutable state → immutable UI snapshot
getFootprintCellsForType(type, x, y)        → BFS hex expansion for multi-cell buildings
getBuildableCells(state)            → Valid placement cells
```

### Tick Loop

- **Interval**: 1 second (1000ms) in `useColony.js`
- **Order**: cleanup expired events → meteor strikes → HP degradation → repair → remove dead buildings → colonist health/morale → resource production/consumption → population growth → colonist exploration (reveal adjacent tiles)
- **Auto-save**: after every tick and build action

## Terrain System (`utils/terrain.js`)

**Types**: PLAINS, HIGHLANDS (+20% solar), CRATER, ICE_FIELD, VOLCANIC
**Deposits** (~8% of tiles): MINERAL_VEIN (×1.5 mining), ICE_DEPOSIT (×1.5 water), GEOTHERMAL_VENT (×1.5 energy), RARE_EARTH
**Hazards** (~5% of tiles): RADIATION (blocks pop growth), UNSTABLE (×1.5 cost), TOXIC_VENT (×0.75 production)
**Generation**: Seeded noise via `mulberry32()`, cached after first call per seed

## Events (`utils/eventEngine.js`)

| Event | Effect | Duration | Probability |
|-------|--------|----------|-------------|
| DUST_STORM | -50% solar | 5 ticks | 0.015 |
| METEOR_STRIKE | Destroys random building | instant | 0.008 |
| SOLAR_FLARE | +30% energy, blocks pop growth | 3 ticks | 0.01 |
| EQUIPMENT_FAILURE | Disables random building | 3 ticks | 0.015 |
| RESOURCE_DISCOVERY | Reveals 5-8 frontier tiles | instant | 0.02 |

Max 2 simultaneous active events. Seeded PRNG for determinism.

## Colonists (`utils/colonistEngine.js`)

**Roles**: ENGINEER (+10% solar/RTG/repair), BOTANIST (+10% farm/O2), GEOLOGIST (+10% mine/water), MEDIC (+0.5 health/tick), GENERAL (+3% all)
**Stats**: health 0-100, morale 0-100 → death at health ≤ 0
**Growth**: Every 10 ticks if resources adequate, avg morale >40, room in habitats
**Initial**: 3 colonists (guaranteed engineer, botanist, geologist)
**Efficiency**: `(health/100 + morale/100) / 2` per colonist → colony avg affects production

## Persistence (`utils/saveManager.js`)

- **Key**: `life-support-save` in localStorage
- **Format**: `{ v: 4, state: {...}, revealedTiles: ["x,y", ...] }`
- **Migrations**: v1→v2 (add terrain/events) → v3 (add oxygen/waste/HP) → v4 (population→colonist array)
- `occupiedCells` Set is rebuilt from `placedBuildings` on load
- Milestones stored separately in `life-support-milestones`
- Dev mode toggle in `life-support-dev-preset-enabled`

## State Flow

1. Mutable `colony` object lives inside `useColony.js` (not exposed directly)
2. After each tick/build, `toSnapshot()` creates an immutable copy → pushed to reactive `state` ref
3. Components read `state` (read-only snapshot) and `resourceDeltas` (computed preview)
4. User actions call composable methods (`buildAtGrid`, `demolish`, `togglePause`, etc.)
5. Auto-save serializes the mutable state, not the snapshot

## Canvas Rendering (`utils/drawing.js` + `GameMap.vue`)

### Critical Rules
- **DPR scaling**: `ctx.scale(dpr, dpr)` is set once in the render loop. All coordinates are in CSS pixels. Do NOT multiply input coords by `devicePixelRatio`.
- **Hex origin offset**: Subtract `(HEX_W/2, HEX_H/2)` before axial conversion in `screenToGrid()`.
- **GameMap.vue is 100% canvas** — never add NuxtUI/HTML elements inside it.
- **Frustum culling**: Only visible tiles are rendered based on camera offset/zoom.

### Shared Drawing
`drawBuilding(ctx, type, x, y, size, alpha, rotation)` — renders a single building icon. Used by both `GameMap` (on-map) and `BuildPanel`/`RadialBuildMenu` (thumbnails). Keep signature compatible.

`drawFootprintBuilding(ctx, type, cells, z, ox, oy, hexS, alpha)` — multi-cell buildings (MINE, HABITAT, RECYCLING_CENTER, MDV).

### Hex Geometry (from `constants.js`)
```
HEX_SIZE = 18        # Center to vertex (flat-top)
HEX_W = 36           # Full width
HEX_H ≈ 31.18        # Full height
HORIZ = 27            # Column spacing (¾ × HEX_W)
VERT ≈ 31.18          # Row spacing
Grid = 64×64 cells    # Odd-q offset coordinates
```

### Caching
Tile colors, rocks, and noise are cached at module level. Call `clearDrawingCaches()` on game reset.

## Composables

### `useColony.js` — Main state manager
**Exports**: `state`, `eventLog`, `resourceHistory`, `revealedTiles`, `terrainMap`, `resourceDeltas`, `buildingsInfo`, `gridWidth`, `gridHeight`, `isAlive`, `canAfford()`, `selectedBuildingInfo`, `newGame()`, `tick()`, `buildAtGrid()`, `demolish()`, `togglePause()`, `reset()`, `saveToFile()`, `loadFromFile()`

### `useCamera.js` — Viewport
**Exports**: `offsetX`, `offsetY`, `zoom`, `pan()`, `zoomAt()`, `centerOn()`, `screenToGrid()`, `gridToScreen()`, hex constants
**Zoom range**: 0.5–2.0×

### `useGridInteraction.js` — Input
**Exports**: `hoverTile`, `selectedBuilding`, `selectBuilding()`, `clearSelection()`, input handlers
- Desktop: mouse events + wheel zoom + right-click (radial menu)
- Mobile: touch events + pinch zoom + long-press (radial menu, 500ms threshold)
- Drag threshold: 10px

## Component Notes

- **BuildPanel.vue**: Shows all building types with canvas thumbnails, cost breakdown, delta preview, "turns until affordable" countdown. Emits `select`.
- **RadialBuildMenu.vue**: Mobile-only circular popup (120px radius, 48px items). Canvas thumbnails with circular clip. Emits `select`.
- **ResourcePanel.vue**: Left sidebar (desktop) / top bar (mobile). Color-coded per resource.
- **TutorialOverlay.vue**: Steps: pipeline → solar panel → farm → oxygen generator. Dismissible.
- **ResourceGraph.vue**: UModal wrapping sparkline chart of last 20 history entries.

## UI Framework (NuxtUI v4)

- `UModal`: `:open` prop + `@close` event (not v-model)
- `UDrawer`: `v-model:open` + `direction="bottom"` (mobile build panel)
- `UCard`: `ui="{ body: 'p-X sm:p-X' }"` for custom padding
- `UBadge`: `color="success"/"error"/"neutral"` with `variant="subtle"`
- `UButtonGroup`: wraps `UButton` children

## Styling

### CSS Custom Properties (`assets/css/main.css`)
```
--energy    → amber-600
--food      → green-600
--water     → blue-600
--minerals  → orange-600
--oxygen    → sky-500
```
Also registered as NuxtUI theme colors: `resource-energy`, `resource-food`, `resource-water`, `resource-minerals`, `resource-oxygen`.

### Colorblind Mode
`.colorblind` class on root element swaps to deuteranopia-safe palette.

### Fonts
- Headings: `font-family: 'Orbitron'` with text-shadow glow
- Body: `font-family: 'Rajdhani'`

## Key Conventions

- **Nuxt auto-imports**: `ref`, `computed`, `watch`, `onMounted`, `onUnmounted`, `nextTick` — no explicit imports needed in composables or `<script setup>`.
- **`buildAt()` is synchronous** — callers that `await` it still work (await on non-Promise resolves immediately).
- **`revealedTiles`** is a `Set<string>` of `"x,y"` keys. All rendering skips unrevealed tiles.
- **Resource history** capped at 60 entries; sparklines show last 20.
- **Events use mouse\*/touch\*** (not pointer\*) because pinch-zoom needs `e.touches`.
- **Resource deltas** are computed from building metadata × counts, accounting for terrain bonuses, HP, level, events, roles, waste penalty — without mutating state.
- **`occupiedCells`** is a `Set<string>` rebuilt from `placedBuildings` on load; kept in sync on build/demolish.
