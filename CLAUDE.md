# CLAUDE.md

## Build & Run

```bash
./mvnw package -DskipTests
java -jar target/quarkus-app/quarkus-run.jar
```

Dev mode: `./mvnw quarkus:dev`

## Architecture

- **Backend**: Quarkus 3.17, Java 21. Colony state in `Colony.java`, game loop in `GameTickService` (SSE ticks every 5s), REST in `ColonyResource`.
- **Frontend**: Vue 3 via CDN (no build tools). HTML5 Canvas hex map. All JS in `src/main/resources/META-INF/resources/js/`.
- Components use `window.SpaceColony` namespace as plain JS objects (not SFCs).

## Key Conventions

- Canvas rendering uses CSS-pixel space; DPR scaling is handled by `ctx.scale(dpr, dpr)` in the render loop. Do NOT multiply input coords by DPR.
- Hex grid uses flat-top, odd-q offset coordinates. Hex origin offset (`HEX_W/2`, `HEX_H/2`) must be subtracted in `screenToGrid` before axial conversion.
- `revealedTiles` is a `Set<string>` of `"x,y"` keys. All map rendering layers skip unrevealed tiles.
- The `drawBuilding()` function is shared between `GameMap` (on-map) and `BuildPanel` (thumbnails) — keep the signature `(ctx, type, x, y, size, alpha)` compatible.
- Resource history is capped at 60 entries. Sparklines show the last 20.
