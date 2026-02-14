# Polytopia-Style Competitive Colonies: Investigation & Implementation Plan

## Goal

Evolve Life Support from a single-colony survival sandbox into a multi-colony strategy game where AI colonies expand on the same map and compete with the player for territory, resources, and strategic positioning.

## Current Architecture Constraints

The current codebase assumes one colony state and one build network:

1. **Single-colony state model**
   - `createColonyState()` creates a single mutable state object with one `resources`, one `placedBuildings` array, and one `occupiedCells` set.
   - `processTick()` advances only that single colony economy and event stack.
2. **Single owner for map occupancy**
   - `occupiedCells` is globally tied to the one colony; there is no tile ownership concept.
3. **Fog-of-war only for player vision**
   - `revealedTiles` tracks only what the player can see.
4. **UI only presents player context**
   - HUD/resource panels and build UX assume one faction.
5. **Save format stores one colony state**
   - Persistence currently serializes one game state object.

## High-Impact Systems to Add

### 1) Factions + Colony Registry (Core Refactor)

Introduce a top-level `worldState`:

- `worldState.factions`: player + AI faction metadata (`id`, `name`, color, diplomacy stance)
- `worldState.coloniesByFaction`: per-faction colony states (or one shared structure keyed by faction)
- `worldState.tileControl`: per-tile owner/influence
- `worldState.sharedTerrain`: existing terrain map stays global

Recommended approach:

- Keep the existing colony model, but wrap it into a faction container.
- Convert engine APIs from `state` to `(worldState, factionId)` where needed.

### 2) Tile Ownership, Claiming, and Resource Denial

Add ownership mechanics to make competition meaningful:

- **Claim rules**: buildings project influence radius; contiguous control preferred.
- **Deposit locking**: only owner can extract (or reduced extraction for trespass).
- **Contested tiles**: if multiple influences overlap, mark as contested and reduce output.

This requires updates to:

- Placement validation (`validateBuildPlacement`) with ownership checks.
- Resource computation (`computeResourceDeltas`) to account for contested/foreign tiles.
- Rendering overlays to visualize borders and contested zones.

### 3) AI Colony Lifecycle (Polytopia-like Expansion Behavior)

Implement an AI turn layer executed each tick:

- **Expansion heuristic**: prioritize unclaimed high-yield tiles.
- **Economic balancing**: build energy/water/food minimums before specialization.
- **Strategic pressure**: block player expansion paths near choke points/resources.

Suggested architecture:

- `utils/aiEngine.js`
  - `planFactionTurn(worldState, factionId)`
  - `scoreBuildCandidates(...)`
  - `selectExpansionTarget(...)`

Start simple (rule-based AI), then iterate with weighted scoring.

### 4) Shared Resource Competition

Polytopia-like tension comes from scarcity:

- Convert key terrain deposits into finite nodes (depletion/regeneration policy).
- Add strategic resources (optional): e.g., rare minerals for advanced structures.
- Introduce market/trade pressure later (optional phase).

### 5) Diplomacy/Conflict (Phased)

Phase 1 can be purely economic competition; Phase 2 can add interaction:

- Soft conflict: influence pressure, border friction penalties.
- Hard conflict: sabotage/raids/defense response tied to existing defense systems.
- Victory conditions: score, domination, tech, or survival timer.

### 6) Fog of War per Faction

Store reveal sets per faction:

- `revealedByFaction[factionId] = Set<"x,y">`
- Player still sees only own explored map.
- AI can optionally use imperfect intel to avoid omniscience.

### 7) UI/UX Changes Needed

- Border visualization layer on canvas (faction colors).
- Colony badges/names on map.
- Diplomatic status panel (even if only “Rival” initially).
- Scoreboard panel: population, territory %, resource income per faction.
- Notifications for enemy expansion into contested/nearby zones.

## File-Level Change Map

### `utils/gameEngine.js`

- Refactor core APIs around `worldState` + `factionId`.
- Add tile ownership updates each tick.
- Integrate faction-aware build validation/resource accounting.

### `composables/useColony.js`

- Evolve into world manager (or create `useWorld.js`).
- Tick loop should process all factions each tick.
- Expose AI/faction snapshots for UI panels.

### `utils/saveManager.js`

- New save schema version with multi-faction data.
- Migration path from single-colony save to `worldState` with one player faction.

### `utils/drawing.js` and `components/GameMap.vue`

- Add border and colony marker rendering.
- Add ownership highlight in hover/placement previews.

### `components/*` (ResourcePanel, EventLog, optional new Scoreboard)

- Keep player resource panel, but add rival progress indicators.

## Implementation Roadmap (Low Risk)

### Phase 1 — Multi-faction data model (foundation)

1. Add `worldState` with one player + 1–3 AI factions.
2. Keep existing gameplay unchanged for player.
3. Migrate save/load to new schema.

### Phase 2 — Territory control + blocking

1. Add claim/influence map.
2. Enforce build and extraction ownership rules.
3. Render borders/contested cells.

### Phase 3 — AI expansion

1. Implement rule-based AI builder.
2. Add basic AI economy balancing.
3. Tune decision weights for map pressure.

### Phase 4 — Competitive win/loss loop

1. Add score/territory tracking.
2. Trigger rivalry notifications and objectives.
3. Add victory condition options.

### Phase 5 (optional) — Conflict/diplomacy depth

1. Border incidents or raids.
2. Ceasefire/trade/alliances.
3. Late-game strategic tech race.

## Practical MVP Definition

A realistic “Polytopia-like MVP” for this project:

- 3 factions total (player + 2 AI)
- Territory borders and contested tiles
- AI expands and claims resource-rich regions
- Player blocked from freely taking rival-controlled deposits
- End condition: highest territory/resource score at tick N

## Risks & Mitigations

1. **Performance risk (tick complexity)**
   - Mitigation: cache candidate build cells and influence recalculation deltas.
2. **Refactor risk in engine API**
   - Mitigation: adapter layer preserving old single-colony function signatures during migration.
3. **AI fairness risk**
   - Mitigation: avoid full-map omniscience; apply scouting radius constraints.
4. **Save migration risk**
   - Mitigation: explicit version bump and deterministic migration with fallback defaults.

## Suggested First PR Sequence

1. **PR 1:** Introduce `worldState` + save migration (no gameplay change).
2. **PR 2:** Tile ownership + border rendering.
3. **PR 3:** Basic AI expansion each tick.
4. **PR 4:** Scoreboard and victory condition.

This sequence keeps each PR testable and reduces regressions while moving toward the full competitive-colonies vision.
