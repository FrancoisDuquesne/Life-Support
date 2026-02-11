<script setup>
import { HEX_SIZE, HEX_W, HEX_H, HORIZ, VERT } from '~/utils/constants'
import { hexNeighbors } from '~/utils/hex'
import {
  getTileColors,
  getTileRocks,
  hexScreenX,
  hexScreenY,
  hexPath,
  drawRocks,
  drawBuilding,
  drawHPBar,
  drawTerrainOverlay,
  drawEventOverlay,
} from '~/utils/drawing'
import { getFootprintCellsForType } from '~/utils/gameEngine'

const props = defineProps({
  camera: Object,
  interaction: Object,
  state: Object,
  gridWidth: Number,
  gridHeight: Number,
  onTileClick: Function,
  onContextMenu: Function,
  revealedTiles: Object,
  terrainMap: Array,
  activeEvents: Array,
})

const canvasRef = ref(null)
let animId = null
let dirty = true
let lastPlacedCount = 0

const placementAnims = []

function getFootprintRenderMetrics(cells, z, ox, oy, hexS) {
  const centers = cells.map((cell) => ({
    x: hexScreenX(cell.x, z, ox),
    y: hexScreenY(cell.x, cell.y, z, oy),
  }))
  const count = Math.max(1, centers.length)
  const cx = centers.reduce((sum, p) => sum + p.x, 0) / count
  const cy = centers.reduce((sum, p) => sum + p.y, 0) / count
  const minCx = Math.min(...centers.map((p) => p.x))
  const maxCx = Math.max(...centers.map((p) => p.x))
  const minCy = Math.min(...centers.map((p) => p.y))
  const maxCy = Math.max(...centers.map((p) => p.y))
  const footprintW = maxCx - minCx + hexS * 1.7
  const footprintH = maxCy - minCy + hexS * 1.7
  const iconSize = Math.max(
    HEX_H * z * 0.95,
    Math.min(footprintW, footprintH) * (cells.length > 1 ? 0.92 : 0.8),
  )
  const hpAnchorCy = maxCy
  return { cx, cy, iconSize, hpAnchorCy }
}

function drawBuildingFootprint(ctx, visibleCells, z, ox, oy, hexS, type) {
  const isLandingSite = type === 'MDV_LANDING_SITE'
  ctx.fillStyle = isLandingSite
    ? 'rgba(226, 232, 240, 0.20)'
    : 'rgba(248, 250, 252, 0.08)'
  ctx.strokeStyle = isLandingSite
    ? 'rgba(248, 250, 252, 0.55)'
    : 'rgba(248, 250, 252, 0.38)'
  ctx.lineWidth = isLandingSite ? 1.5 : 1.1
  for (const cell of visibleCells) {
    const ccx = hexScreenX(cell.x, z, ox)
    const ccy = hexScreenY(cell.x, cell.y, z, oy)
    hexPath(ctx, ccx, ccy, hexS * (isLandingSite ? 0.9 : 0.84))
    ctx.fill()
    ctx.stroke()
  }
}

function drawUndiscoveredBackdrop(ctx, w, h, now) {
  const base = ctx.createLinearGradient(0, 0, 0, h)
  base.addColorStop(0, '#050506')
  base.addColorStop(0.5, '#0b0a0d')
  base.addColorStop(1, '#120d0f')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.filter = 'blur(30px)'
  const t = now * 0.00008
  const blobs = [
    {
      x: w * (0.2 + Math.sin(t) * 0.03),
      y: h * 0.3,
      r: Math.max(w, h) * 0.24,
      c: 'rgba(120, 84, 72, 0.10)',
    },
    {
      x: w * (0.72 + Math.cos(t * 1.1) * 0.03),
      y: h * 0.58,
      r: Math.max(w, h) * 0.28,
      c: 'rgba(87, 50, 44, 0.08)',
    },
    {
      x: w * (0.46 + Math.sin(t * 0.8) * 0.02),
      y: h * 0.82,
      r: Math.max(w, h) * 0.22,
      c: 'rgba(96, 64, 58, 0.07)',
    },
  ]
  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
    g.addColorStop(0, b.c)
    g.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function markDirty() {
  dirty = true
}

watch(
  () => props.state,
  () => {
    if (props.state && props.state.placedBuildings) {
      const newCount = props.state.placedBuildings.length
      if (newCount > lastPlacedCount) {
        for (let i = lastPlacedCount; i < newCount; i++) {
          const b = props.state.placedBuildings[i]
          placementAnims.push({
            x: b.x,
            y: b.y,
            start: performance.now(),
            duration: 600,
          })
        }
        lastPlacedCount = newCount
      }
    }
    markDirty()
  },
  { deep: true },
)

watch(() => props.interaction.hoverTile.value, markDirty)
watch(() => props.interaction.selectedBuilding.value, markDirty)
watch(() => props.camera.offsetX.value, markDirty)
watch(() => props.camera.offsetY.value, markDirty)
watch(() => props.camera.zoom.value, markDirty)
watch(() => props.revealedTiles, markDirty)

// Re-center when grid dimensions change (after config loads)
watch(
  () => [props.gridWidth, props.gridHeight],
  () => {
    const canvas = canvasRef.value
    if (canvas && props.gridWidth && props.gridHeight) {
      props.camera.centerOn(canvas.clientWidth, canvas.clientHeight)
      markDirty()
    }
  },
)

function render() {
  animId = requestAnimationFrame(render)

  const now = performance.now()
  let animRunning = false
  for (let i = placementAnims.length - 1; i >= 0; i--) {
    if (now - placementAnims[i].start > placementAnims[i].duration) {
      placementAnims.splice(i, 1)
    } else {
      animRunning = true
    }
  }
  if (animRunning) dirty = true

  if (!dirty) return
  dirty = false

  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const cam = props.camera
  const gw = props.gridWidth || 32
  const gh = props.gridHeight || 32
  const z = cam.zoom.value
  const ox = cam.offsetX.value
  const oy = cam.offsetY.value
  const hexS = HEX_SIZE * z

  // Retina scaling
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
  } else {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // Mars-like undiscovered backdrop
  drawUndiscoveredBackdrop(ctx, w, h, now)

  // Frustum culling
  const minCol = Math.max(0, Math.floor((-ox - HEX_W * z) / (HORIZ * z)))
  const maxCol = Math.min(gw - 1, Math.ceil((w - ox + HEX_W * z) / (HORIZ * z)))
  const minRow = Math.max(0, Math.floor((-oy - HEX_H * z) / (VERT * z)))
  const maxRow = Math.min(gh - 1, Math.ceil((h - oy + HEX_H * z) / (VERT * z)))

  const colors = getTileColors(gw, gh, props.terrainMap)
  const rocks = getTileRocks(gw, gh)
  const revealed = props.revealedTiles

  // Layer 1: Ground hex tiles (only revealed)
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (revealed && !revealed.has(col + ',' + row)) continue
      const cx = hexScreenX(col, z, ox)
      const cy = hexScreenY(col, row, z, oy)
      ctx.fillStyle = colors[row * gw + col]
      hexPath(ctx, cx, cy, hexS)
      ctx.fill()
    }
  }

  // Layer 1b: Terrain rocks (only revealed)
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (revealed && !revealed.has(col + ',' + row)) continue
      const rock = rocks[row * gw + col]
      if (rock) {
        const cx = hexScreenX(col, z, ox)
        const cy = hexScreenY(col, row, z, oy)
        drawRocks(ctx, rock, cx, cy, hexS)
      }
    }
  }

  // Layer 1c: Fog frontier — unrevealed tiles adjacent to revealed tiles
  if (revealed && revealed.size > 0) {
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (revealed.has(col + ',' + row)) continue
        const neighbors = hexNeighbors(col, row)
        let adjacentToRevealed = false
        for (const [nc, nr] of neighbors) {
          if (
            nc >= 0 &&
            nc < gw &&
            nr >= 0 &&
            nr < gh &&
            revealed.has(nc + ',' + nr)
          ) {
            adjacentToRevealed = true
            break
          }
        }
        if (adjacentToRevealed) {
          const cx = hexScreenX(col, z, ox)
          const cy = hexScreenY(col, row, z, oy)
          ctx.fillStyle = 'rgba(20, 16, 19, 0.78)'
          hexPath(ctx, cx, cy, hexS)
          ctx.fill()
        }
      }
    }
  }

  // Layer 2: Grid lines (only revealed)
  ctx.strokeStyle = 'rgba(139, 92, 42, 0.2)'
  ctx.lineWidth = 0.5
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (revealed && !revealed.has(col + ',' + row)) continue
      const cx = hexScreenX(col, z, ox)
      const cy = hexScreenY(col, row, z, oy)
      hexPath(ctx, cx, cy, hexS)
      ctx.stroke()
    }
  }

  // Build occupied set
  const occupied = new Set()
  if (props.state && props.state.placedBuildings) {
    props.state.placedBuildings.forEach((b) => {
      const cells =
        b.cells && b.cells.length > 0 ? b.cells : [{ x: b.x, y: b.y }]
      cells.forEach((cell) => occupied.add(cell.x + ',' + cell.y))
    })
  }

  // Layer 2b: Terrain overlays (deposits/hazards)
  if (props.terrainMap) {
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (revealed && !revealed.has(col + ',' + row)) continue
        const tile = props.terrainMap[row * gw + col]
        if (!tile || (!tile.deposit && !tile.hazard)) continue
        const cx = hexScreenX(col, z, ox)
        const cy = hexScreenY(col, row, z, oy)
        drawTerrainOverlay(ctx, tile, cx, cy, hexS, now)
      }
    }
  }

  // Layer 3: Buildings
  if (props.state && props.state.placedBuildings) {
    props.state.placedBuildings.forEach((b) => {
      const cells =
        b.cells && b.cells.length > 0 ? b.cells : [{ x: b.x, y: b.y }]
      const visibleCells = cells.filter(
        (cell) =>
          cell.x >= minCol &&
          cell.x <= maxCol &&
          cell.y >= minRow &&
          cell.y <= maxRow &&
          (!revealed || revealed.has(cell.x + ',' + cell.y)),
      )
      if (visibleCells.length === 0) return
      if (cells.length > 1) {
        drawBuildingFootprint(ctx, visibleCells, z, ox, oy, hexS, b.type)
      }
      const metrics = getFootprintRenderMetrics(cells, z, ox, oy, hexS)
      drawBuilding(
        ctx,
        b.type,
        metrics.cx - metrics.iconSize / 2,
        metrics.cy - metrics.iconSize / 2,
        metrics.iconSize,
        1,
      )
      drawHPBar(
        ctx,
        metrics.cx,
        metrics.hpAnchorCy,
        hexS,
        b.hp ?? 100,
        b.maxHp ?? 100,
      )
    })
  }

  // Layer 3b: Placement pulse animations
  for (const anim of placementAnims) {
    if (
      anim.x >= minCol &&
      anim.x <= maxCol &&
      anim.y >= minRow &&
      anim.y <= maxRow
    ) {
      const progress = (now - anim.start) / anim.duration
      const cx = hexScreenX(anim.x, z, ox)
      const cy = hexScreenY(anim.x, anim.y, z, oy)
      const alpha = 0.6 * (1 - progress)
      const expand = progress * hexS * 0.3
      ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')'
      ctx.lineWidth = 2
      hexPath(ctx, cx, cy, hexS + expand)
      ctx.stroke()
    }
  }

  // Layer 4: Hover highlight (only on revealed tiles)
  const hover = props.interaction.hoverTile.value
  if (
    hover &&
    hover.gx >= minCol &&
    hover.gx <= maxCol &&
    hover.gy >= minRow &&
    hover.gy <= maxRow
  ) {
    if (!revealed || revealed.has(hover.gx + ',' + hover.gy)) {
      const cx = hexScreenX(hover.gx, z, ox)
      const cy = hexScreenY(hover.gx, hover.gy, z, oy)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      hexPath(ctx, cx, cy, hexS)
      ctx.fill()
    }
  }

  // Layer 5: Build ghost (only on revealed tiles)
  const sel = props.interaction.selectedBuilding.value
  if (
    sel &&
    hover &&
    hover.gx >= 0 &&
    hover.gx < gw &&
    hover.gy >= 0 &&
    hover.gy < gh
  ) {
    if (!revealed || revealed.has(hover.gx + ',' + hover.gy)) {
      const footprint = getFootprintCellsForType(sel, hover.gx, hover.gy)
      const invalidCell = footprint.find(
        (cell) =>
          cell.x < 0 ||
          cell.x >= gw ||
          cell.y < 0 ||
          cell.y >= gh ||
          occupied.has(cell.x + ',' + cell.y),
      )
      const isOccupied = !!invalidCell

      for (const cell of footprint) {
        if (cell.x < 0 || cell.x >= gw || cell.y < 0 || cell.y >= gh) continue
        const cx = hexScreenX(cell.x, z, ox)
        const cy = hexScreenY(cell.x, cell.y, z, oy)
        ctx.fillStyle = isOccupied
          ? 'rgba(239, 68, 68, 0.3)'
          : 'rgba(34, 197, 94, 0.15)'
        hexPath(ctx, cx, cy, hexS)
        ctx.fill()
      }

      const visibleFootprint = footprint.filter(
        (cell) =>
          cell.x >= minCol &&
          cell.x <= maxCol &&
          cell.y >= minRow &&
          cell.y <= maxRow &&
          (!revealed || revealed.has(cell.x + ',' + cell.y)),
      )
      if (footprint.length > 1 && visibleFootprint.length > 0) {
        drawBuildingFootprint(ctx, visibleFootprint, z, ox, oy, hexS, sel)
      }
      const metrics = getFootprintRenderMetrics(footprint, z, ox, oy, hexS)
      drawBuilding(
        ctx,
        sel,
        metrics.cx - metrics.iconSize / 2,
        metrics.cy - metrics.iconSize / 2,
        metrics.iconSize,
        isOccupied ? 0.3 : 0.6,
      )
    }
  }

  // Layer 6: active event overlays
  if (props.activeEvents && props.activeEvents.length > 0) {
    for (const event of props.activeEvents) {
      drawEventOverlay(ctx, event.type, w, h, now)
    }
  }
}

function handleContextMenu(e) {
  e.preventDefault()
  e.stopPropagation()

  const canvas = canvasRef.value
  if (!canvas || !props.onContextMenu) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const grid = props.camera.screenToGrid(x, y)
  const gw = props.gridWidth || 32
  const gh = props.gridHeight || 32
  if (grid.gx < 0 || grid.gx >= gw || grid.gy < 0 || grid.gy >= gh) return

  // Pass grid coords + screen coords for menu positioning
  props.onContextMenu(grid.gx, grid.gy, e.clientX, e.clientY)
}

function handleResize() {
  dirty = true
}

const canvasCursor = computed(() => {
  const hover = props.interaction?.hoverTile.value
  if (!hover) return 'crosshair'

  const gw = props.gridWidth || 32
  const gh = props.gridHeight || 32
  if (hover.gx < 0 || hover.gx >= gw || hover.gy < 0 || hover.gy >= gh)
    return 'crosshair'

  // Check if tile is revealed
  if (props.revealedTiles && !props.revealedTiles.has(hover.gx + ',' + hover.gy))
    return 'crosshair'

  // Check if there's a building at this tile
  const placed = (props.state && props.state.placedBuildings) || []
  const building = placed.find((b) =>
    b.cells && b.cells.length > 0
      ? b.cells.some((cell) => cell.x === hover.gx && cell.y === hover.gy)
      : b.x === hover.gx && b.y === hover.gy,
  )

  return building ? 'pointer' : 'crosshair'
})

onMounted(() => {
  const canvas = canvasRef.value
  if (canvas) {
    props.camera.centerOn(canvas.clientWidth, canvas.clientHeight)
    dirty = true
  }
  window.addEventListener('resize', handleResize)
  animId = requestAnimationFrame(render)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (animId) cancelAnimationFrame(animId)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="game-canvas"
    :style="{ cursor: canvasCursor }"
    @mousedown.prevent="interaction.onPointerDown(canvasRef, $event)"
    @mousemove.prevent="interaction.onPointerMove(canvasRef, $event)"
    @mouseup.prevent="interaction.onPointerUp(canvasRef, $event, onTileClick)"
    @mouseleave.prevent="interaction.onPointerUp(canvasRef, $event, null)"
    @wheel.prevent="interaction.onWheel(canvasRef, $event)"
    @touchstart.prevent="interaction.onPointerDown(canvasRef, $event)"
    @touchmove.prevent="interaction.onPointerMove(canvasRef, $event)"
    @touchend.prevent="interaction.onPointerUp(canvasRef, $event, onTileClick)"
    @contextmenu.prevent="handleContextMenu"
  ></canvas>
</template>

<style scoped>
.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
</style>
