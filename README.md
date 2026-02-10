# Life Support

A real-time colony survival simulator. Manage resources, place buildings on a hex-grid map, and expand your territory on a hostile planet.

Runs entirely in the browser — no server needed. Saves progress to localStorage and works offline as an installable PWA.

## Screenshot

The game renders a hex-tile map with an organic fog-of-war reveal mechanic. A glassmorphic HUD floats over the full-viewport map, showing resource sparklines, building controls, and an event log.

## How to Play

- **Select a building** from the sidebar (or bottom sheet on mobile)
- **Click a revealed hex** to place it (costs resources)
- Each building **reveals nearby fog** when placed, expanding your territory
- The colony ticks every 5 seconds, producing and consuming resources
- Keep food and water above zero or your colonists will die
- Use speed controls (1x/2x/5x/10x) or advance ticks manually

### Buildings

| Building        | Cost                  | Produces          | Consumes          |
| --------------- | --------------------- | ----------------- | ----------------- |
| Solar Panel     | 10 minerals           | 5 energy          | —                 |
| Hydroponic Farm | 15 minerals, 5 energy | 3 food            | 1 water, 1 energy |
| Water Extractor | 12 minerals           | 4 water           | 2 energy          |
| Mine            | 8 minerals            | 2 minerals        | 3 energy          |
| Habitat         | 25 minerals, 10 water | +5 population cap | 2 energy          |

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build & Deploy

```bash
npm run build
```

Upload the contents of `.output/public/` to any static hosting (Apache, Nginx, Netlify, Vercel, GitHub Pages, OVH, etc.).

For hosts that don't handle SPA routing natively, add a fallback rule. For example, with Apache `.htaccess`:

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ /index.html [L]
```

## Tech Stack

- **Framework**: Nuxt 3 (Vue 3), static SPA mode
- **Rendering**: HTML5 Canvas hex map
- **Game engine**: Pure JavaScript (`utils/gameEngine.js`)
- **Persistence**: localStorage (auto-saves every tick)
- **PWA**: `@vite-pwa/nuxt` — installable, works offline

## Project Structure

```
├── assets/css/          Global CSS variables and styles
├── components/          Vue SFCs (GameMap, BuildPanel, ResourcePanel, etc.)
├── composables/         Reactive logic (useColony, useCamera, useGridInteraction)
├── pages/index.vue      Root page wiring all components
├── public/icons/        PWA icons
├── utils/
│   ├── gameEngine.js    Game logic (buildings, ticks, resources, population)
│   ├── saveManager.js   localStorage save/load
│   ├── constants.js     Hex geometry and color constants
│   ├── hex.js           Hex math (neighbors, distance, coordinate conversion)
│   └── drawing.js       Canvas rendering helpers
├── nuxt.config.ts       Nuxt + PWA configuration
└── package.json
```

## License

[MIT](LICENSE)
