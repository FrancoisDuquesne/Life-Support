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
} from '~/utils/drawing'

const props = defineProps({
  camera: Object,
  interaction: Object,
  state: Object,
  gridWidth: Number,
  gridHeight: Number,
  onTileClick: Function,
  revealedTiles: Object,
})

const canvasRef = ref(null)
let animId = null
let dirty = true
let lastPlacedCount = 0

const placementAnims = []

function drawUndiscoveredBackdrop(ctx, w, h, now) {
  const base = ctx.createLinearGradient(0, 0, 0, h)
  base.addColorStop(0, '#6f3f2f')
  base.addColorStop(0.55, '#8c4f37')
  base.addColorStop(1, '#4e2f24')
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
      c: 'rgba(234, 179, 118, 0.20)',
    },
    {
      x: w * (0.72 + Math.cos(t * 1.1) * 0.03),
      y: h * 0.58,
      r: Math.max(w, h) * 0.28,
      c: 'rgba(191, 95, 55, 0.18)',
    },
    {
      x: w * (0.46 + Math.sin(t * 0.8) * 0.02),
      y: h * 0.82,
      r: Math.max(w, h) * 0.22,
      c: 'rgba(237, 137, 54, 0.14)',
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

  const colors = getTileColors(gw, gh)
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
          ctx.fillStyle = 'rgba(84, 45, 32, 0.50)'
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
      occupied.add(b.x + ',' + b.y)
    })
  }

  // Layer 3: Buildings
  if (props.state && props.state.placedBuildings) {
    props.state.placedBuildings.forEach((b) => {
      if (b.x >= minCol && b.x <= maxCol && b.y >= minRow && b.y <= maxRow) {
        const cx = hexScreenX(b.x, z, ox)
        const cy = hexScreenY(b.x, b.y, z, oy)
        const bSize = HEX_H * z
        drawBuilding(ctx, b.type, cx - bSize / 2, cy - bSize / 2, bSize, 1)
        drawHPBar(ctx, cx, cy, hexS, b.hp ?? 100, b.maxHp ?? 100)
      }
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
      const cx = hexScreenX(hover.gx, z, ox)
      const cy = hexScreenY(hover.gx, hover.gy, z, oy)
      const isOccupied = occupied.has(hover.gx + ',' + hover.gy)

      if (isOccupied) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'
      } else {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.15)'
      }
      hexPath(ctx, cx, cy, hexS)
      ctx.fill()

      const bSize = HEX_H * z
      drawBuilding(
        ctx,
        sel,
        cx - bSize / 2,
        cy - bSize / 2,
        bSize,
        isOccupied ? 0.3 : 0.6,
      )
    }
  }
}

function handleResize() {
  dirty = true
}

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
    @mousedown.prevent="interaction.onPointerDown(canvasRef, $event)"
    @mousemove.prevent="interaction.onPointerMove(canvasRef, $event)"
    @mouseup.prevent="interaction.onPointerUp(canvasRef, $event, onTileClick)"
    @mouseleave.prevent="interaction.onPointerUp(canvasRef, $event, null)"
    @wheel.prevent="interaction.onWheel(canvasRef, $event)"
    @touchstart.prevent="interaction.onPointerDown(canvasRef, $event)"
    @touchmove.prevent="interaction.onPointerMove(canvasRef, $event)"
    @touchend.prevent="interaction.onPointerUp(canvasRef, $event, onTileClick)"
  ></canvas>
</template>

<style scoped>
.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: crosshair;
}
</style>
