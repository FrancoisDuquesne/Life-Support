# Life Support

A real-time colony survival simulator. Manage resources, place buildings on a hex-grid map, and expand your territory on a hostile planet.

## Screenshot

The game renders a hex-tile map with an organic fog-of-war reveal mechanic. A glassmorphic HUD floats over the full-viewport map, showing resource sparklines, building controls, and an event log.

## How to Play

- **Select a building** from the sidebar (or bottom sheet on mobile)
- **Click a revealed hex** to place it (costs resources)
- Each building **reveals nearby fog** when placed, expanding your territory
- The colony ticks every 5 seconds, producing and consuming resources
- Keep food and water above zero or your colonists will die

### Buildings

| Building | Produces | Consumes |
|----------|----------|----------|
| Solar Panel | Energy | - |
| Hydroponic Farm | Food | Energy, Water |
| Water Extractor | Water | Energy |
| Mine | Minerals | Energy |
| Habitat | +Population capacity | Food, Water |

## Requirements

- Java 21+
- No Node.js or frontend build tools needed

## Quick Start

```bash
# Build
./mvnw package -DskipTests

# Run
java -jar target/quarkus-app/quarkus-run.jar
```

Open [http://localhost:8080](http://localhost:8080).

## Development Mode

```bash
./mvnw quarkus:dev
```

Hot-reloads Java code and serves static frontend files. Open [http://localhost:8080](http://localhost:8080).

## Tech Stack

- **Backend**: Quarkus 3.17, Java 21, RESTEasy Reactive + Jackson, Server-Sent Events
- **Frontend**: Vue 3 (CDN, no build step), HTML5 Canvas
- **Build**: Maven wrapper included

## Project Structure

```
src/main/java/com/colony/
  model/          Colony, BuildingType, ResourceType, PlacedBuilding
  service/        ColonyService (game logic), GameTickService (SSE ticks)
  resource/       ColonyResource (REST endpoints)

src/main/resources/META-INF/resources/
  index.html      Single page + all CSS
  js/app.js       Vue app entry point
  js/composables/ useColony, useCamera, useGridInteraction
  js/components/  GameMap, BuildPanel, ResourcePanel, ResourceGraph,
                  PopulationBar, HeaderBar, EventLog
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/colony` | Current colony state |
| GET | `/colony/config` | Grid dimensions + building metadata |
| GET | `/colony/events` | SSE stream of game ticks |
| POST | `/colony/build/{TYPE}` | Place a building `{"x":0,"y":0}` |
| POST | `/colony/reset` | Reset the colony |

## Configuration

Edit `src/main/resources/application.properties`:

```properties
colony.tick.interval=5s
colony.grid.width=64
colony.grid.height=64
colony.start.energy=100
colony.start.food=50
colony.start.water=50
colony.start.minerals=30
```

## License

[MIT](LICENSE)
