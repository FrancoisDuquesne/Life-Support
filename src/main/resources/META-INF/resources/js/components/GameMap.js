// GameMap.js — canvas element, rendering loop, hex grid, buildings, fog of war
(function() {
  // Flat-top hex geometry (must match useCamera.js)
  const HEX_SIZE = 18;
  const HEX_W    = HEX_SIZE * 2;
  const HEX_H    = HEX_SIZE * Math.sqrt(3);
  const HORIZ    = HEX_W * 0.75;
  const VERT     = HEX_H;

  // Building colors
  const BUILDING_COLORS = {
    SOLAR_PANEL:     { fill: '#f59e0b', accent: '#fbbf24' },
    HYDROPONIC_FARM: { fill: '#22c55e', accent: '#4ade80' },
    WATER_EXTRACTOR: { fill: '#3b82f6', accent: '#60a5fa' },
    MINE:            { fill: '#f97316', accent: '#fb923c' },
    HABITAT:         { fill: '#94a3b8', accent: '#cbd5e1' }
  };

  // Pre-generated caches
  let tileColors = null;
  let tileRocks = null;

  function valueNoise(x, y, seed, scale) {
    const sx = x / scale;
    const sy = y / scale;
    const ix = Math.floor(sx);
    const iy = Math.floor(sy);
    const fx = sx - ix;
    const fy = sy - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    function hash(a, b) {
      let h = (a * 374761393 + b * 668265263 + seed) | 0;
      h = (h ^ (h >> 13)) * 1274126177;
      return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
    }
    const v00 = hash(ix, iy);
    const v10 = hash(ix + 1, iy);
    const v01 = hash(ix, iy + 1);
    const v11 = hash(ix + 1, iy + 1);
    const top = v00 + (v10 - v00) * ux;
    const bot = v01 + (v11 - v01) * ux;
    return top + (bot - top) * uy;
  }

  function getTileColors(gw, gh) {
    if (tileColors && tileColors.w === gw && tileColors.h === gh) return tileColors.data;
    const data = new Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const n1 = valueNoise(x, y, 42, 6);
        const n2 = valueNoise(x, y, 137, 3);
        const n3 = valueNoise(x, y, 251, 1.2);
        const combined = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
        const hue = 28 + (n2 - 0.5) * 10;
        const sat = 30 + (n1 - 0.5) * 15;
        const light = 58 + (combined - 0.5) * 18;
        data[y * gw + x] = 'hsl(' + hue.toFixed(0) + ',' + sat.toFixed(0) + '%,' + light.toFixed(0) + '%)';
      }
    }
    tileColors = { w: gw, h: gh, data };
    return data;
  }

  function getTileRocks(gw, gh) {
    if (tileRocks && tileRocks.w === gw && tileRocks.h === gh) return tileRocks.data;
    const data = [];
    for (let i = 0; i < gw * gh; i++) {
      const r = Math.random();
      if (r < 0.08) {
        data.push({ type: 'rock_large', ox: Math.random() * 0.4 + 0.1, oy: Math.random() * 0.4 + 0.1,
                     size: 0.2 + Math.random() * 0.15, color: '#9e8a6a' });
      } else if (r < 0.22) {
        const pebbles = [];
        const count = 1 + Math.floor(Math.random() * 3);
        for (let p = 0; p < count; p++) {
          pebbles.push({
            ox: Math.random() * 0.7 + 0.1,
            oy: Math.random() * 0.7 + 0.1,
            size: 0.04 + Math.random() * 0.06
          });
        }
        data.push({ type: 'pebbles', pebbles, color: '#a08e70' });
      } else if (r < 0.28) {
        data.push({ type: 'crater', ox: 0.25 + Math.random() * 0.3, oy: 0.25 + Math.random() * 0.3,
                     size: 0.15 + Math.random() * 0.15 });
      } else {
        data.push(null);
      }
    }
    tileRocks = { w: gw, h: gh, data };
    return data;
  }

  // Hex center in screen space
  function hexScreenX(col, z, ox) {
    return col * HORIZ * z + (HEX_W / 2) * z + ox;
  }
  function hexScreenY(col, row, z, oy) {
    return row * VERT * z + (col & 1) * (VERT / 2) * z + (HEX_H / 2) * z + oy;
  }

  // Draw a flat-top hexagon path centered at (cx, cy) with given size (center-to-vertex)
  function hexPath(ctx, cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 180 * (60 * i);
      const vx = cx + size * Math.cos(angle);
      const vy = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
  }

  // Rocks/decorations drawn relative to hex center
  function drawRocks(ctx, rock, cx, cy, hexS) {
    if (!rock) return;
    const inR = hexS * 0.6;
    switch (rock.type) {
      case 'rock_large': {
        const rx = cx + (rock.ox - 0.5) * inR * 2;
        const ry = cy + (rock.oy - 0.5) * inR * 2;
        const rs = rock.size * hexS;
        ctx.fillStyle = rock.color;
        ctx.beginPath();
        ctx.moveTo(rx, ry - rs * 0.3);
        ctx.lineTo(rx + rs * 0.5, ry - rs * 0.1);
        ctx.lineTo(rx + rs * 0.4, ry + rs * 0.3);
        ctx.lineTo(rx - rs * 0.3, ry + rs * 0.35);
        ctx.lineTo(rx - rs * 0.45, ry);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#b8a080';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        break;
      }
      case 'pebbles': {
        ctx.fillStyle = rock.color;
        for (const p of rock.pebbles) {
          const px = cx + (p.ox - 0.5) * inR * 2;
          const py = cy + (p.oy - 0.5) * inR * 2;
          const ps = p.size * hexS;
          ctx.beginPath();
          ctx.arc(px, py, ps, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'crater': {
        const crx = cx + (rock.ox - 0.5) * inR * 2;
        const cry = cy + (rock.oy - 0.5) * inR * 2;
        const cr = rock.size * hexS;
        ctx.strokeStyle = 'rgba(120, 100, 70, 0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(crx, cry, cr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.beginPath();
        ctx.arc(crx + cr * 0.1, cry + cr * 0.1, cr * 0.7, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  // Distinct building shapes — center-relative drawing
  function drawBuilding(ctx, type, x, y, size, alpha) {
    const colors = BUILDING_COLORS[type] || { fill: '#888', accent: '#aaa' };
    ctx.globalAlpha = alpha;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size * 0.4;

    switch (type) {
      case 'SOLAR_PANEL': {
        // Flat wide rectangle with grid lines + sun dot
        const pw = r * 1.8;
        const ph = r * 1.1;
        ctx.fillStyle = colors.fill;
        ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 0.8;
        // 3x2 grid
        for (let i = 1; i < 3; i++) {
          const gx = cx - pw / 2 + (pw / 3) * i;
          ctx.beginPath();
          ctx.moveTo(gx, cy - ph / 2);
          ctx.lineTo(gx, cy + ph / 2);
          ctx.stroke();
        }
        const midY = cy;
        ctx.beginPath();
        ctx.moveTo(cx - pw / 2, midY);
        ctx.lineTo(cx + pw / 2, midY);
        ctx.stroke();
        // Sun dot
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.arc(cx + pw / 2 - r * 0.3, cy - ph / 2 - r * 0.2, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'HYDROPONIC_FARM': {
        // Green ellipse dome + leaf
        ctx.fillStyle = colors.fill;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 1.1, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        // Arc highlight
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy + r * 0.1, r * 0.6, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        // Leaf symbol
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.35);
        ctx.quadraticCurveTo(cx + r * 0.4, cy - r * 0.1, cx, cy + r * 0.25);
        ctx.quadraticCurveTo(cx - r * 0.4, cy - r * 0.1, cx, cy - r * 0.35);
        ctx.fill();
        break;
      }
      case 'WATER_EXTRACTOR': {
        // Concentric rings + water drop
        ctx.strokeStyle = colors.fill;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
        ctx.stroke();
        // Water drop in center
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.35);
        ctx.quadraticCurveTo(cx + r * 0.25, cy, cx, cy + r * 0.3);
        ctx.quadraticCurveTo(cx - r * 0.25, cy, cx, cy - r * 0.35);
        ctx.fill();
        break;
      }
      case 'MINE': {
        // Diamond/rhombus + pickaxe cross
        ctx.fillStyle = colors.fill;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.8, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r * 0.8, cy);
        ctx.closePath();
        ctx.fill();
        // Pickaxe cross lines
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.35, cy - r * 0.35);
        ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
        ctx.moveTo(cx + r * 0.35, cy - r * 0.35);
        ctx.lineTo(cx - r * 0.1, cy + r * 0.1);
        ctx.stroke();
        break;
      }
      case 'HABITAT': {
        // Dome on rectangular base + window + door
        const baseW = r * 1.4;
        const baseH = r * 0.45;
        // Base
        ctx.fillStyle = colors.fill;
        ctx.fillRect(cx - baseW / 2, cy, baseW, baseH);
        // Dome
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.7, Math.PI, 0);
        ctx.fill();
        // Window arc
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.1, r * 0.25, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        // Door
        ctx.fillStyle = colors.accent;
        ctx.fillRect(cx - r * 0.1, cy, r * 0.2, baseH * 0.8);
        break;
      }
      default: {
        ctx.fillStyle = colors.fill;
        ctx.fillRect(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7);
      }
    }
    ctx.globalAlpha = 1;
  }

  const GameMap = {
    props: ['camera', 'interaction', 'state', 'gridWidth', 'gridHeight', 'onTileClick', 'revealedTiles'],
    setup(props) {
      const { ref, onMounted, onUnmounted, watch } = Vue;
      const canvasRef = ref(null);
      let animId = null;
      let dirty = true;
      let lastPlacedCount = 0;

      const placementAnims = [];

      // Get hex neighbors helper from global (set by useColony)
      function getHexNeighbors(col, row) {
        const fn = window.SpaceColony.hexNeighbors;
        if (fn) return fn(col, row);
        // Fallback odd-q offset neighbors
        const parity = col & 1;
        if (parity === 0) {
          return [[col+1,row-1],[col+1,row],[col,row+1],[col-1,row],[col-1,row-1],[col,row-1]];
        } else {
          return [[col+1,row],[col+1,row+1],[col,row+1],[col-1,row+1],[col-1,row],[col,row-1]];
        }
      }

      function markDirty() { dirty = true; }

      watch(() => props.state, () => {
        if (props.state && props.state.placedBuildings) {
          const newCount = props.state.placedBuildings.length;
          if (newCount > lastPlacedCount) {
            for (let i = lastPlacedCount; i < newCount; i++) {
              const b = props.state.placedBuildings[i];
              placementAnims.push({ x: b.x, y: b.y, start: performance.now(), duration: 600 });
            }
            lastPlacedCount = newCount;
          }
        }
        markDirty();
      }, { deep: true });
      watch(() => props.interaction.hoverTile.value, markDirty);
      watch(() => props.interaction.selectedBuilding.value, markDirty);
      watch(() => props.camera.offsetX.value, markDirty);
      watch(() => props.camera.offsetY.value, markDirty);
      watch(() => props.camera.zoom.value, markDirty);
      watch(() => props.revealedTiles, markDirty);

      // Re-center when grid dimensions change (after config loads)
      watch(() => [props.gridWidth, props.gridHeight], () => {
        const canvas = canvasRef.value;
        if (canvas && props.gridWidth && props.gridHeight) {
          props.camera.centerOn(canvas.clientWidth, canvas.clientHeight);
          markDirty();
        }
      });

      function render() {
        animId = requestAnimationFrame(render);

        const now = performance.now();
        let animRunning = false;
        for (let i = placementAnims.length - 1; i >= 0; i--) {
          if (now - placementAnims[i].start > placementAnims[i].duration) {
            placementAnims.splice(i, 1);
          } else {
            animRunning = true;
          }
        }
        if (animRunning) dirty = true;

        if (!dirty) return;
        dirty = false;

        const canvas = canvasRef.value;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cam = props.camera;
        const gw = props.gridWidth || 32;
        const gh = props.gridHeight || 32;
        const z = cam.zoom.value;
        const ox = cam.offsetX.value;
        const oy = cam.offsetY.value;
        const hexS = HEX_SIZE * z;

        // Retina scaling
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          ctx.scale(dpr, dpr);
        } else {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        // Clear — dark void background
        ctx.fillStyle = '#1a1510';
        ctx.fillRect(0, 0, w, h);

        // Frustum culling
        const minCol = Math.max(0, Math.floor((-ox - HEX_W * z) / (HORIZ * z)));
        const maxCol = Math.min(gw - 1, Math.ceil((w - ox + HEX_W * z) / (HORIZ * z)));
        const minRow = Math.max(0, Math.floor((-oy - HEX_H * z) / (VERT * z)));
        const maxRow = Math.min(gh - 1, Math.ceil((h - oy + HEX_H * z) / (VERT * z)));

        const colors = getTileColors(gw, gh);
        const rocks = getTileRocks(gw, gh);
        const revealed = props.revealedTiles;

        // Layer 1: Ground hex tiles (only revealed)
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            if (revealed && !revealed.has(col + ',' + row)) continue;
            const cx = hexScreenX(col, z, ox);
            const cy = hexScreenY(col, row, z, oy);
            ctx.fillStyle = colors[row * gw + col];
            hexPath(ctx, cx, cy, hexS);
            ctx.fill();
          }
        }

        // Layer 1b: Terrain rocks (only revealed)
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            if (revealed && !revealed.has(col + ',' + row)) continue;
            const rock = rocks[row * gw + col];
            if (rock) {
              const cx = hexScreenX(col, z, ox);
              const cy = hexScreenY(col, row, z, oy);
              drawRocks(ctx, rock, cx, cy, hexS);
            }
          }
        }

        // Layer 1c: Fog frontier — unrevealed tiles adjacent to revealed tiles
        if (revealed && revealed.size > 0) {
          for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
              if (revealed.has(col + ',' + row)) continue;
              // Check if any neighbor is revealed
              const neighbors = getHexNeighbors(col, row);
              let adjacentToRevealed = false;
              for (const [nc, nr] of neighbors) {
                if (nc >= 0 && nc < gw && nr >= 0 && nr < gh && revealed.has(nc + ',' + nr)) {
                  adjacentToRevealed = true;
                  break;
                }
              }
              if (adjacentToRevealed) {
                const cx = hexScreenX(col, z, ox);
                const cy = hexScreenY(col, row, z, oy);
                ctx.fillStyle = 'rgba(30, 24, 15, 0.55)';
                hexPath(ctx, cx, cy, hexS);
                ctx.fill();
              }
            }
          }
        }

        // Layer 2: Grid lines (only revealed)
        ctx.strokeStyle = 'rgba(139, 92, 42, 0.2)';
        ctx.lineWidth = 0.5;
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            if (revealed && !revealed.has(col + ',' + row)) continue;
            const cx = hexScreenX(col, z, ox);
            const cy = hexScreenY(col, row, z, oy);
            hexPath(ctx, cx, cy, hexS);
            ctx.stroke();
          }
        }

        // Build occupied set
        const occupied = new Set();
        if (props.state && props.state.placedBuildings) {
          props.state.placedBuildings.forEach(b => {
            occupied.add(b.x + ',' + b.y);
          });
        }

        // Layer 3: Buildings
        if (props.state && props.state.placedBuildings) {
          props.state.placedBuildings.forEach(b => {
            if (b.x >= minCol && b.x <= maxCol && b.y >= minRow && b.y <= maxRow) {
              const cx = hexScreenX(b.x, z, ox);
              const cy = hexScreenY(b.x, b.y, z, oy);
              const bSize = HEX_H * z;
              drawBuilding(ctx, b.type, cx - bSize / 2, cy - bSize / 2, bSize, 1);
            }
          });
        }

        // Layer 3b: Placement pulse animations
        for (const anim of placementAnims) {
          if (anim.x >= minCol && anim.x <= maxCol && anim.y >= minRow && anim.y <= maxRow) {
            const progress = (now - anim.start) / anim.duration;
            const cx = hexScreenX(anim.x, z, ox);
            const cy = hexScreenY(anim.x, anim.y, z, oy);
            const alpha = 0.6 * (1 - progress);
            const expand = progress * hexS * 0.3;
            ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
            ctx.lineWidth = 2;
            hexPath(ctx, cx, cy, hexS + expand);
            ctx.stroke();
          }
        }

        // Layer 4: Hover highlight (only on revealed tiles)
        const hover = props.interaction.hoverTile.value;
        if (hover && hover.gx >= minCol && hover.gx <= maxCol && hover.gy >= minRow && hover.gy <= maxRow) {
          if (!revealed || revealed.has(hover.gx + ',' + hover.gy)) {
            const cx = hexScreenX(hover.gx, z, ox);
            const cy = hexScreenY(hover.gx, hover.gy, z, oy);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            hexPath(ctx, cx, cy, hexS);
            ctx.fill();
          }
        }

        // Layer 5: Build ghost (only on revealed tiles)
        const sel = props.interaction.selectedBuilding.value;
        if (sel && hover && hover.gx >= 0 && hover.gx < gw && hover.gy >= 0 && hover.gy < gh) {
          if (!revealed || revealed.has(hover.gx + ',' + hover.gy)) {
            const cx = hexScreenX(hover.gx, z, ox);
            const cy = hexScreenY(hover.gx, hover.gy, z, oy);
            const isOccupied = occupied.has(hover.gx + ',' + hover.gy);

            if (isOccupied) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            } else {
              ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
            }
            hexPath(ctx, cx, cy, hexS);
            ctx.fill();

            const bSize = HEX_H * z;
            drawBuilding(ctx, sel, cx - bSize / 2, cy - bSize / 2, bSize, isOccupied ? 0.3 : 0.6);
          }
        }
      }

      function handleResize() {
        dirty = true;
      }

      onMounted(() => {
        const canvas = canvasRef.value;
        if (canvas) {
          props.camera.centerOn(canvas.clientWidth, canvas.clientHeight);
          dirty = true;
        }
        window.addEventListener('resize', handleResize);
        animId = requestAnimationFrame(render);
      });

      onUnmounted(() => {
        window.removeEventListener('resize', handleResize);
        if (animId) cancelAnimationFrame(animId);
      });

      return { canvasRef };
    },
    template: `
      <canvas ref="canvasRef" class="game-canvas"
        @mousedown.prevent="interaction.onPointerDown($refs.canvasRef, $event)"
        @mousemove.prevent="interaction.onPointerMove($refs.canvasRef, $event)"
        @mouseup.prevent="interaction.onPointerUp($refs.canvasRef, $event, onTileClick)"
        @mouseleave.prevent="interaction.onPointerUp($refs.canvasRef, $event, null)"
        @wheel.prevent="interaction.onWheel($refs.canvasRef, $event)"
        @touchstart.prevent="interaction.onPointerDown($refs.canvasRef, $event)"
        @touchmove.prevent="interaction.onPointerMove($refs.canvasRef, $event)"
        @touchend.prevent="interaction.onPointerUp($refs.canvasRef, $event, onTileClick)"
      ></canvas>
    `
  };

  window.SpaceColony = window.SpaceColony || {};
  window.SpaceColony.GameMap = GameMap;
  window.SpaceColony.drawBuilding = drawBuilding;
})();
