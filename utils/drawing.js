import { HEX_SIZE, HEX_W, HEX_H, HORIZ, VERT } from '~/utils/constants'

// Building colors
export const BUILDING_COLORS = {
  SOLAR_PANEL: { fill: '#f59e0b', accent: '#fbbf24' },
  HYDROPONIC_FARM: { fill: '#22c55e', accent: '#4ade80' },
  WATER_EXTRACTOR: { fill: '#3b82f6', accent: '#60a5fa' },
  MINE: { fill: '#f97316', accent: '#fb923c' },
  HABITAT: { fill: '#94a3b8', accent: '#cbd5e1' },
  OXYGEN_GENERATOR: { fill: '#06b6d4', accent: '#22d3ee' },
  RTG: { fill: '#a855f7', accent: '#c084fc' },
  PIPELINE: { fill: '#94a3b8', accent: '#e2e8f0' },
  MDV_LANDING_SITE: { fill: '#64748b', accent: '#e2e8f0' },
  RESEARCH_LAB: { fill: '#ec4899', accent: '#f472b6' },
  DEFENSE_TURRET: { fill: '#dc2626', accent: '#f87171' },
  RADAR_STATION: { fill: '#eab308', accent: '#facc15' },
}

// Pre-generated caches
let tileColorsCache = null
let tileRocksCache = null

export function valueNoise(x, y, seed, scale) {
  const sx = x / scale
  const sy = y / scale
  const ix = Math.floor(sx)
  const iy = Math.floor(sy)
  const fx = sx - ix
  const fy = sy - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263 + seed) | 0
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff
  }
  const v00 = hash(ix, iy)
  const v10 = hash(ix + 1, iy)
  const v01 = hash(ix, iy + 1)
  const v11 = hash(ix + 1, iy + 1)
  const top = v00 + (v10 - v00) * ux
  const bot = v01 + (v11 - v01) * ux
  return top + (bot - top) * uy
}

/**
 * Generate tile colors — terrain-aware. Uses terrain type base HSL with noise perturbation.
 */
export function getTileColors(gw, gh, terrainMap) {
  const cacheKey = terrainMap ? 'terrain' : 'default'
  if (
    tileColorsCache &&
    tileColorsCache.w === gw &&
    tileColorsCache.h === gh &&
    tileColorsCache.key === cacheKey
  )
    return tileColorsCache.data
  const data = new Array(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const n1 = valueNoise(x, y, 42, 6)
      const n2 = valueNoise(x, y, 137, 3)
      const n3 = valueNoise(x, y, 251, 1.2)
      const combined = n1 * 0.5 + n2 * 0.3 + n3 * 0.2

      // Use terrain type's base colors if available
      let baseHue = 28,
        baseSat = 30,
        baseLight = 58
      if (terrainMap && terrainMap[y * gw + x]) {
        const t = terrainMap[y * gw + x].terrain
        baseHue = t.hue
        baseSat = t.sat
        baseLight = t.light
      }

      const hue = baseHue + (n2 - 0.5) * 14
      const sat = baseSat + (n1 - 0.5) * 22
      const light = baseLight + (combined - 0.5) * 18
      data[y * gw + x] =
        'hsl(' +
        hue.toFixed(0) +
        ',' +
        sat.toFixed(0) +
        '%,' +
        light.toFixed(0) +
        '%)'
    }
  }
  tileColorsCache = { w: gw, h: gh, key: cacheKey, data }
  return data
}

/**
 * Clear tile caches (call on reset/new game).
 */
export function clearDrawingCaches() {
  tileColorsCache = null
  tileRocksCache = null
}

function tileHash(idx, salt) {
  let h = (idx * 374761393 + salt * 668265263 + 42) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff
}

export function getTileRocks(gw, gh) {
  if (tileRocksCache && tileRocksCache.w === gw && tileRocksCache.h === gh)
    return tileRocksCache.data
  const data = []
  for (let i = 0; i < gw * gh; i++) {
    const r = tileHash(i, 0)
    if (r < 0.08) {
      data.push({
        type: 'rock_large',
        ox: tileHash(i, 1) * 0.4 + 0.1,
        oy: tileHash(i, 2) * 0.4 + 0.1,
        size: 0.2 + tileHash(i, 3) * 0.15,
        color: '#9e8a6a',
      })
    } else if (r < 0.22) {
      const pebbles = []
      const count = 1 + Math.floor(tileHash(i, 4) * 3)
      for (let p = 0; p < count; p++) {
        pebbles.push({
          ox: tileHash(i, 5 + p * 3) * 0.7 + 0.1,
          oy: tileHash(i, 6 + p * 3) * 0.7 + 0.1,
          size: 0.04 + tileHash(i, 7 + p * 3) * 0.06,
        })
      }
      data.push({ type: 'pebbles', pebbles, color: '#a08e70' })
    } else if (r < 0.28) {
      data.push({
        type: 'crater',
        ox: 0.25 + tileHash(i, 14) * 0.3,
        oy: 0.25 + tileHash(i, 15) * 0.3,
        size: 0.15 + tileHash(i, 16) * 0.15,
      })
    } else {
      data.push(null)
    }
  }
  tileRocksCache = { w: gw, h: gh, data }
  return data
}

// Hex center in screen space
export function hexScreenX(col, z, ox) {
  return col * HORIZ * z + (HEX_W / 2) * z + ox
}

export function hexScreenY(col, row, z, oy) {
  return row * VERT * z + (col & 1) * (VERT / 2) * z + (HEX_H / 2) * z + oy
}

// Draw a flat-top hexagon path centered at (cx, cy) with given size (center-to-vertex)
export function hexPath(ctx, cx, cy, size) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    const vx = cx + size * Math.cos(angle)
    const vy = cy + size * Math.sin(angle)
    if (i === 0) ctx.moveTo(vx, vy)
    else ctx.lineTo(vx, vy)
  }
  ctx.closePath()
}

// Rocks/decorations drawn relative to hex center
export function drawRocks(ctx, rock, cx, cy, hexS) {
  if (!rock) return
  const inR = hexS * 0.6
  switch (rock.type) {
    case 'rock_large': {
      const rx = cx + (rock.ox - 0.5) * inR * 2
      const ry = cy + (rock.oy - 0.5) * inR * 2
      const rs = rock.size * hexS
      ctx.fillStyle = rock.color
      ctx.beginPath()
      ctx.moveTo(rx, ry - rs * 0.3)
      ctx.lineTo(rx + rs * 0.5, ry - rs * 0.1)
      ctx.lineTo(rx + rs * 0.4, ry + rs * 0.3)
      ctx.lineTo(rx - rs * 0.3, ry + rs * 0.35)
      ctx.lineTo(rx - rs * 0.45, ry)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#b8a080'
      ctx.lineWidth = 0.5
      ctx.stroke()
      break
    }
    case 'pebbles': {
      ctx.fillStyle = rock.color
      for (const p of rock.pebbles) {
        const px = cx + (p.ox - 0.5) * inR * 2
        const py = cy + (p.oy - 0.5) * inR * 2
        const ps = p.size * hexS
        ctx.beginPath()
        ctx.arc(px, py, ps, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'crater': {
      const crx = cx + (rock.ox - 0.5) * inR * 2
      const cry = cy + (rock.oy - 0.5) * inR * 2
      const cr = rock.size * hexS
      ctx.strokeStyle = 'rgba(120, 100, 70, 0.4)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(crx, cry, cr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.beginPath()
      ctx.arc(crx + cr * 0.1, cry + cr * 0.1, cr * 0.7, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
}

/**
 * Draw terrain deposit/hazard overlays on a hex tile.
 */
export function drawTerrainOverlay(ctx, tile, cx, cy, hexS, tick) {
  const r = hexS * 0.5

  function tintHex(colorA, colorB, alpha = 0.3) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.9)
    grad.addColorStop(0, colorA)
    grad.addColorStop(1, colorB)
    ctx.fillStyle = grad
    hexPath(ctx, cx, cy, hexS)
    ctx.fill()
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
    ctx.lineWidth = Math.max(0.8, hexS * 0.045)
    hexPath(ctx, cx, cy, hexS * 0.93)
    ctx.stroke()
  }

  // Draw deposit indicators
  if (tile.deposit) {
    switch (tile.deposit.id) {
      case 'MINERAL_VEIN': {
        tintHex('rgba(251, 146, 60, 0.24)', 'rgba(251, 146, 60, 0.02)', 0.34)
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2 - Math.PI / 2
          const dist = r * 0.34
          const px = cx + Math.cos(angle) * dist
          const py = cy + Math.sin(angle) * dist
          const alpha = 0.72 + 0.2 * Math.sin(tick * 0.003 + i * 1.7)
          ctx.fillStyle = `rgba(255, 184, 82, ${alpha})`
          ctx.beginPath()
          ctx.arc(px, py, hexS * 0.085, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'rgba(138, 79, 20, 0.8)'
          ctx.lineWidth = Math.max(0.8, hexS * 0.03)
          ctx.stroke()
        }
        break
      }
      case 'ICE_DEPOSIT': {
        tintHex('rgba(125, 211, 252, 0.22)', 'rgba(125, 211, 252, 0.02)', 0.38)
        const spoke = hexS * 0.22
        ctx.strokeStyle = 'rgba(219, 234, 254, 0.92)'
        ctx.lineWidth = Math.max(1, hexS * 0.04)
        for (let i = 0; i < 6; i++) {
          const a = i * (Math.PI / 3) + tick * 0.00015
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(a) * spoke, cy + Math.sin(a) * spoke)
          ctx.stroke()
        }
        ctx.fillStyle = 'rgba(186, 230, 253, 0.95)'
        ctx.beginPath()
        ctx.arc(cx, cy, hexS * 0.06, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'GEOTHERMAL_VENT': {
        tintHex('rgba(249, 115, 22, 0.23)', 'rgba(249, 115, 22, 0.03)', 0.34)
        ctx.fillStyle = 'rgba(255, 181, 97, 0.9)'
        ctx.beginPath()
        ctx.moveTo(cx, cy - hexS * 0.2)
        ctx.lineTo(cx + hexS * 0.14, cy + hexS * 0.1)
        ctx.lineTo(cx - hexS * 0.14, cy + hexS * 0.1)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(120, 53, 15, 0.8)'
        ctx.lineWidth = Math.max(0.8, hexS * 0.03)
        ctx.stroke()
        ctx.strokeStyle = 'rgba(255, 214, 170, 0.72)'
        ctx.lineWidth = Math.max(0.7, hexS * 0.03)
        for (let i = 0; i < 3; i++) {
          const baseX = cx + (i - 0.5) * r * 0.4
          const yOff = ((tick * 0.02 + i * 30) % 20) - 10
          ctx.beginPath()
          ctx.moveTo(baseX, cy + r * 0.2 - yOff * hexS * 0.02)
          ctx.quadraticCurveTo(
            baseX + hexS * 0.05,
            cy - yOff * hexS * 0.02,
            baseX,
            cy - r * 0.2 - yOff * hexS * 0.02,
          )
          ctx.stroke()
        }
        break
      }
      case 'RARE_EARTH': {
        tintHex('rgba(192, 132, 252, 0.2)', 'rgba(192, 132, 252, 0.03)', 0.38)
        const d = hexS * 0.2
        ctx.fillStyle = 'rgba(233, 213, 255, 0.94)'
        ctx.beginPath()
        ctx.moveTo(cx, cy - d)
        ctx.lineTo(cx + d * 0.78, cy)
        ctx.lineTo(cx, cy + d)
        ctx.lineTo(cx - d * 0.78, cy)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(126, 34, 206, 0.85)'
        ctx.lineWidth = Math.max(0.8, hexS * 0.03)
        ctx.stroke()
        break
      }
    }
  }

  // Draw hazard indicators
  if (tile.hazard) {
    switch (tile.hazard.id) {
      case 'RADIATION': {
        tintHex('rgba(163, 230, 53, 0.24)', 'rgba(163, 230, 53, 0.02)', 0.45)
        const pulseRadius = ((tick * 0.004) % 1.0) * r * 0.8
        const alpha = 0.62 * (1 - pulseRadius / (r * 0.8))
        ctx.strokeStyle = `rgba(190, 242, 100, ${alpha})`
        ctx.lineWidth = Math.max(1, hexS * 0.05)
        ctx.beginPath()
        ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = 'rgba(101, 163, 13, 0.92)'
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + i * ((Math.PI * 2) / 3)
          ctx.beginPath()
          ctx.arc(cx, cy, hexS * 0.2, a - 0.42, a + 0.42)
          ctx.lineTo(cx, cy)
          ctx.closePath()
          ctx.fill()
        }
        ctx.fillStyle = 'rgba(217, 249, 157, 0.95)'
        ctx.beginPath()
        ctx.arc(cx, cy, hexS * 0.06, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'UNSTABLE': {
        tintHex('rgba(120, 113, 108, 0.26)', 'rgba(120, 113, 108, 0.03)', 0.3)
        ctx.strokeStyle = 'rgba(41, 37, 36, 0.85)'
        ctx.lineWidth = Math.max(0.9, hexS * 0.04)
        const angles = [0.2, 1.8, 3.0, 4.5]
        for (const a of angles) {
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          const endX = cx + Math.cos(a) * r * 0.6
          const endY = cy + Math.sin(a) * r * 0.6
          const midX = (cx + endX) / 2 + Math.sin(a) * r * 0.1
          const midY = (cy + endY) / 2 - Math.cos(a) * r * 0.1
          ctx.quadraticCurveTo(midX, midY, endX, endY)
          ctx.stroke()
        }
        ctx.fillStyle = 'rgba(245, 158, 11, 0.95)'
        ctx.beginPath()
        ctx.moveTo(cx, cy - hexS * 0.16)
        ctx.lineTo(cx + hexS * 0.11, cy + hexS * 0.12)
        ctx.lineTo(cx - hexS * 0.11, cy + hexS * 0.12)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'TOXIC_VENT': {
        tintHex('rgba(74, 222, 128, 0.22)', 'rgba(74, 222, 128, 0.02)', 0.4)
        for (let i = 0; i < 3; i++) {
          const baseX = cx + (i - 1) * r * 0.25
          const yOff = (tick * 0.015 + i * 20) % 30
          const py = cy + r * 0.3 - yOff * hexS * 0.015
          const alpha = 0.42 * (1 - yOff / 30)
          ctx.fillStyle = `rgba(134, 239, 172, ${alpha})`
          ctx.beginPath()
          ctx.arc(
            baseX,
            py,
            hexS * 0.03 + (yOff / 30) * hexS * 0.02,
            0,
            Math.PI * 2,
          )
          ctx.fill()
        }
        ctx.strokeStyle = 'rgba(20, 83, 45, 0.9)'
        ctx.lineWidth = Math.max(0.8, hexS * 0.035)
        ctx.beginPath()
        ctx.arc(cx, cy + hexS * 0.07, hexS * 0.12, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
    }
  }

  // Draw anomaly indicators
  if (tile.anomaly) {
    const pulseA = 0.5 + 0.3 * Math.sin(tick * 0.005)
    switch (tile.anomaly.id) {
      case 'SIGNAL_SOURCE': {
        // Pulsing cyan ring
        ctx.strokeStyle = `rgba(34, 211, 238, ${pulseA})`
        ctx.lineWidth = Math.max(1, hexS * 0.06)
        ctx.beginPath()
        ctx.arc(cx, cy, hexS * 0.3, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = `rgba(34, 211, 238, ${pulseA * 0.6})`
        ctx.beginPath()
        ctx.arc(cx, cy, hexS * 0.08, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'CRASH_SITE': {
        // Orange X mark
        const d = hexS * 0.22
        ctx.strokeStyle = `rgba(251, 146, 60, ${0.6 + pulseA * 0.3})`
        ctx.lineWidth = Math.max(1.2, hexS * 0.06)
        ctx.beginPath()
        ctx.moveTo(cx - d, cy - d)
        ctx.lineTo(cx + d, cy + d)
        ctx.moveTo(cx + d, cy - d)
        ctx.lineTo(cx - d, cy + d)
        ctx.stroke()
        break
      }
      case 'GEOLOGICAL_FEATURE': {
        // Purple diamond
        const d = hexS * 0.2
        ctx.fillStyle = `rgba(192, 132, 252, ${0.5 + pulseA * 0.3})`
        ctx.beginPath()
        ctx.moveTo(cx, cy - d)
        ctx.lineTo(cx + d * 0.7, cy)
        ctx.lineTo(cx, cy + d)
        ctx.lineTo(cx - d * 0.7, cy)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = `rgba(126, 34, 206, ${0.6 + pulseA * 0.2})`
        ctx.lineWidth = Math.max(0.8, hexS * 0.03)
        ctx.stroke()
        break
      }
    }
  }
}

/**
 * Draw full-screen weather event overlays.
 */
export function drawEventOverlay(ctx, eventType, canvasW, canvasH, tick) {
  switch (eventType) {
    case 'DUST_STORM': {
      // Tinted overlay
      ctx.fillStyle = 'rgba(180, 120, 40, 0.1)'
      ctx.fillRect(0, 0, canvasW, canvasH)
      // Blowing particle dots
      ctx.fillStyle = 'rgba(200, 150, 80, 0.3)'
      for (let i = 0; i < 20; i++) {
        const baseX = ((i * 137 + tick * 0.5) % (canvasW + 40)) - 20
        const baseY = (i * 251 + i * i * 7) % canvasH
        const wobble = Math.sin(tick * 0.01 + i) * 5
        ctx.beginPath()
        ctx.arc(baseX, baseY + wobble, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'METEOR_STRIKE': {
      for (let i = 0; i < 8; i++) {
        const t = (tick * 0.015 + i * 17) % 1
        const startX = ((i * 211) % (canvasW + 120)) - 60
        const startY = ((i * 97) % (canvasH * 0.5)) - 120
        const x = startX + t * 220
        const y = startY + t * 220

        const tail = ctx.createLinearGradient(x - 20, y - 20, x, y)
        tail.addColorStop(0, 'rgba(251, 191, 36, 0)')
        tail.addColorStop(1, 'rgba(251, 191, 36, 0.45)')
        ctx.strokeStyle = tail
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x - 26, y - 26)
        ctx.lineTo(x, y)
        ctx.stroke()

        ctx.fillStyle = 'rgba(255, 237, 213, 0.85)'
        ctx.beginPath()
        ctx.arc(x, y, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'SOLAR_FLARE': {
      // Yellow-white vignette at edges
      const grad = ctx.createRadialGradient(
        canvasW / 2,
        canvasH / 2,
        Math.min(canvasW, canvasH) * 0.3,
        canvasW / 2,
        canvasH / 2,
        Math.max(canvasW, canvasH) * 0.7,
      )
      const pulse = 0.06 + 0.03 * Math.sin(tick * 0.005)
      grad.addColorStop(0, 'rgba(255, 200, 50, 0)')
      grad.addColorStop(1, `rgba(255, 200, 50, ${pulse})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvasW, canvasH)
      break
    }
  }
}

/**
 * Draw a "disabled" indicator over a building (equipment failure).
 */
export function drawDisabledBuilding(ctx, cx, cy, hexS) {
  const r = hexS * 0.3
  // Red X
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - r, cy - r)
  ctx.lineTo(cx + r, cy + r)
  ctx.moveTo(cx + r, cy - r)
  ctx.lineTo(cx - r, cy + r)
  ctx.stroke()
}

/**
 * Draw level-based visual decorations around a building.
 * Called after the main building shape, before ctx.restore().
 */
function drawLevelDecorations(ctx, cx, cy, r, level, colors) {
  if (level <= 1) return

  if (level >= 2) {
    // Level 2: Subtle glow ring (accent color, 35% opacity)
    ctx.strokeStyle = colors.accent
    ctx.globalAlpha = 0.35
    ctx.lineWidth = Math.max(1.2, r * 0.08)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  if (level >= 3) {
    // Level 3: Four small detail modules at diagonal corners
    const modDist = r * 1.0
    const modSize = r * 0.14
    ctx.fillStyle = '#ecf2f9'
    ctx.strokeStyle = '#8fa2b6'
    ctx.lineWidth = 0.8
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (Math.PI / 2) * i
      const mx = cx + Math.cos(a) * modDist
      const my = cy + Math.sin(a) * modDist
      ctx.fillRect(mx - modSize, my - modSize, modSize * 2, modSize * 2)
      ctx.strokeRect(mx - modSize, my - modSize, modSize * 2, modSize * 2)
    }
  }

  if (level >= 4) {
    // Level 4: Enhanced outer glow ring (fill color, 45% opacity, thicker)
    ctx.strokeStyle = colors.fill
    ctx.globalAlpha = 0.45
    ctx.lineWidth = Math.max(2, r * 0.12)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  if (level >= 5) {
    // Level 5: Radial gradient halo + 6 orbiting accent dots
    const haloR = r * 1.35
    const grad = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, haloR)
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)')
    grad.addColorStop(0.5, colors.accent + '33')
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = colors.accent
    ctx.globalAlpha = 0.7
    const dotR = r * 0.08
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i
      const dx = cx + Math.cos(a) * r * 1.3
      const dy = cy + Math.sin(a) * r * 1.3
      ctx.beginPath()
      ctx.arc(dx, dy, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

// Distinct building shapes — center-relative drawing
export function drawBuilding(
  ctx,
  type,
  x,
  y,
  size,
  alpha,
  rotation = 0,
  level = 1,
) {
  const colors = BUILDING_COLORS[type] || { fill: '#888', accent: '#aaa' }
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size * 0.4

  ctx.save()
  ctx.globalAlpha = alpha
  if (rotation) {
    ctx.translate(cx, cy)
    ctx.rotate(rotation)
    ctx.translate(-cx, -cy)
  }

  const hull = '#ecf2f9'
  const hullShadow = '#d7e0ea'
  const hullLine = '#8fa2b6'

  function drawHullPanel(px, py, w, h) {
    ctx.fillStyle = hull
    ctx.fillRect(px, py, w, h)
    ctx.strokeStyle = hullLine
    ctx.lineWidth = 1
    ctx.strokeRect(px, py, w, h)
    ctx.fillStyle = hullShadow
    ctx.fillRect(px, py + h * 0.62, w, h * 0.38)
  }

  switch (type) {
    case 'SOLAR_PANEL': {
      const w = r * 1.95
      const h = r * 1.2
      const px = cx - w / 2
      const py = cy - h / 2
      ctx.fillStyle = '#dbe4ee'
      ctx.fillRect(px - r * 0.06, py - r * 0.06, w + r * 0.12, h + r * 0.12)
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 1
      ctx.strokeRect(px - r * 0.06, py - r * 0.06, w + r * 0.12, h + r * 0.12)

      ctx.fillStyle = '#1e2f4f'
      ctx.fillRect(px, py, w, h)
      ctx.strokeStyle = '#9ac3ff'
      ctx.lineWidth = 0.9
      for (let i = 1; i < 5; i++) {
        const gx = px + (w / 5) * i
        ctx.beginPath()
        ctx.moveTo(gx, py)
        ctx.lineTo(gx, py + h)
        ctx.stroke()
      }
      for (let i = 1; i < 3; i++) {
        const gy = py + (h / 3) * i
        ctx.beginPath()
        ctx.moveTo(px, gy)
        ctx.lineTo(px + w, gy)
        ctx.stroke()
      }
      ctx.fillStyle = hullLine
      ctx.fillRect(cx - r * 0.08, py + h, r * 0.16, r * 0.34)
      break
    }

    case 'HYDROPONIC_FARM': {
      const domeR = r * 0.98
      ctx.fillStyle = 'rgba(210, 236, 255, 0.72)'
      ctx.beginPath()
      ctx.arc(cx, cy, domeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#b7d7f8'
      ctx.lineWidth = 1.1
      ctx.stroke()

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, domeR * 0.86, 0, Math.PI * 2)
      ctx.clip()
      ctx.strokeStyle = '#22c55e'
      ctx.lineWidth = 1.2
      for (let i = -2; i <= 2; i++) {
        const y = cy + i * r * 0.22
        ctx.beginPath()
        ctx.moveTo(cx - r * 0.72, y)
        ctx.lineTo(cx + r * 0.72, y)
        ctx.stroke()
      }
      ctx.restore()
      break
    }

    case 'WATER_EXTRACTOR': {
      const bodyR = r * 0.86
      ctx.fillStyle = hull
      ctx.beginPath()
      ctx.arc(cx, cy, bodyR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 1.2
      ctx.stroke()

      ctx.fillStyle = '#dbeafe'
      ctx.beginPath()
      ctx.arc(cx, cy, bodyR * 0.58, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#60a5fa'
      ctx.beginPath()
      ctx.arc(cx, cy, bodyR * 0.24, 0, Math.PI * 2)
      ctx.fill()
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * ((Math.PI * 2) / 3)
        ctx.beginPath()
        ctx.arc(
          cx + Math.cos(a) * bodyR * 0.66,
          cy + Math.sin(a) * bodyR * 0.66,
          bodyR * 0.18,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      break
    }

    case 'MINE': {
      // Compact version of the footprint design: hex pod + cylinder with drill + connector
      const off = r * 0.52
      const hexPodR = r * 0.72
      const hexInnerR = hexPodR * 0.64
      const cylR = r * 0.5
      const cylInnerR = cylR * 0.62

      // Connector beam between modules
      ctx.strokeStyle = hull
      ctx.lineWidth = Math.max(2.4, r * 0.18)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - off, cy)
      ctx.lineTo(cx + off, cy)
      ctx.stroke()

      // Left hex pod
      ctx.fillStyle = hull
      hexPath(ctx, cx - off, cy, hexPodR)
      ctx.fill()
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 1.1
      ctx.stroke()
      ctx.fillStyle = '#d8e2ed'
      hexPath(ctx, cx - off, cy, hexInnerR)
      ctx.fill()
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx - off, cy, hexPodR * 0.3, 0, Math.PI * 2)
      ctx.fill()

      // Right cylinder module
      ctx.fillStyle = hull
      ctx.beginPath()
      ctx.arc(cx + off, cy, cylR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 1.1
      ctx.stroke()
      ctx.fillStyle = '#d8e2ed'
      ctx.beginPath()
      ctx.arc(cx + off, cy, cylInnerR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx + off, cy, cylR * 0.3, 0, Math.PI * 2)
      ctx.fill()

      // Drill square on cylinder
      const drillSize = cylR * 0.56
      ctx.fillStyle = '#475569'
      ctx.fillRect(
        cx + off - drillSize / 2,
        cy - drillSize / 2,
        drillSize,
        drillSize,
      )
      break
    }

    case 'HABITAT': {
      const w = r * 2.05
      const h = r * 1.45
      const px = cx - w / 2
      const py = cy - h / 2
      drawHullPanel(px, py, w, h)

      ctx.strokeStyle = '#b6c6d8'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const sx = px + (w / 4) * i
        ctx.beginPath()
        ctx.moveTo(sx, py + r * 0.08)
        ctx.lineTo(sx, py + h - r * 0.08)
        ctx.stroke()
      }
      ctx.fillStyle = colors.accent
      for (let i = 0; i < 3; i++) {
        const wx = px + w * 0.2 + i * w * 0.22
        ctx.fillRect(wx, py + h * 0.3, w * 0.12, h * 0.2)
      }
      break
    }

    case 'OXYGEN_GENERATOR': {
      // Vertical tank with exhaust vents at top
      const tankW = r * 0.8
      const tankH = r * 1.6
      const tankX = cx - tankW / 2
      const tankY = cy - tankH / 2
      const tankR = tankW * 0.4

      // Tank body (rounded rectangle)
      ctx.fillStyle = hull
      ctx.beginPath()
      ctx.moveTo(tankX + tankR, tankY)
      ctx.lineTo(tankX + tankW - tankR, tankY)
      ctx.arc(tankX + tankW - tankR, tankY + tankR, tankR, -Math.PI / 2, 0)
      ctx.lineTo(tankX + tankW, tankY + tankH - tankR)
      ctx.arc(
        tankX + tankW - tankR,
        tankY + tankH - tankR,
        tankR,
        0,
        Math.PI / 2,
      )
      ctx.lineTo(tankX + tankR, tankY + tankH)
      ctx.arc(tankX + tankR, tankY + tankH - tankR, tankR, Math.PI / 2, Math.PI)
      ctx.lineTo(tankX, tankY + tankR)
      ctx.arc(tankX + tankR, tankY + tankR, tankR, Math.PI, -Math.PI / 2)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 1.1
      ctx.stroke()

      // Cyan accent core (inner tank)
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx, cy + r * 0.1, r * 0.28, 0, Math.PI * 2)
      ctx.fill()

      // Three small vent circles at top
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = hullShadow
        ctx.beginPath()
        ctx.arc(cx + i * r * 0.3, tankY + r * 0.18, r * 0.12, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = hullLine
        ctx.lineWidth = 0.8
        ctx.stroke()
        ctx.fillStyle = colors.accent
        ctx.beginPath()
        ctx.arc(cx + i * r * 0.3, tankY + r * 0.18, r * 0.05, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'RTG': {
      ctx.fillStyle = hullShadow
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (Math.PI / 3) * i
        const vx = cx + r * 0.98 * Math.cos(a)
        const vy = cy + r * 0.98 * Math.sin(a)
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = hullLine
      ctx.stroke()

      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#374151'
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * ((Math.PI * 2) / 3)
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.56, a - 0.34, a + 0.34)
        ctx.lineTo(cx, cy)
        ctx.closePath()
        ctx.fill()
      }
      break
    }

    case 'PIPELINE': {
      const nodeR = r * 0.52
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(cx, cy, nodeR, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = Math.max(1.2, r * 0.09)
      ctx.beginPath()
      ctx.arc(cx, cy, nodeR, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = '#1e293b'
      ctx.beginPath()
      ctx.arc(cx, cy, nodeR * 0.46, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case 'RESEARCH_LAB': {
      // Pink dome with antenna
      const domeR = r * 0.92
      ctx.fillStyle = '#fce7f3'
      ctx.beginPath()
      ctx.arc(cx, cy + r * 0.08, domeR, Math.PI, 0)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#db2777'
      ctx.lineWidth = 1.2
      ctx.stroke()
      // Dome base
      ctx.fillStyle = hull
      ctx.fillRect(cx - domeR, cy + r * 0.08, domeR * 2, r * 0.28)
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 1
      ctx.strokeRect(cx - domeR, cy + r * 0.08, domeR * 2, r * 0.28)
      // Inner window
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx, cy - r * 0.1, domeR * 0.35, 0, Math.PI * 2)
      ctx.fill()
      // Antenna
      ctx.strokeStyle = '#be185d'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx + r * 0.3, cy - domeR * 0.6)
      ctx.lineTo(cx + r * 0.3, cy - domeR * 1.1)
      ctx.stroke()
      ctx.fillStyle = '#f472b6'
      ctx.beginPath()
      ctx.arc(cx + r * 0.3, cy - domeR * 1.1, r * 0.1, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case 'DEFENSE_TURRET': {
      // Octagonal base with turret barrel
      const baseR = r * 0.82
      ctx.fillStyle = hullShadow
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i - Math.PI / 8
        const vx = cx + baseR * Math.cos(a)
        const vy = cy + baseR * Math.sin(a)
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 1.2
      ctx.stroke()
      // Turret center
      ctx.fillStyle = '#991b1b'
      ctx.beginPath()
      ctx.arc(cx, cy, baseR * 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#7f1d1d'
      ctx.lineWidth = 1
      ctx.stroke()
      // Barrel
      ctx.fillStyle = '#475569'
      ctx.fillRect(cx - r * 0.08, cy - baseR * 0.95, r * 0.16, baseR * 0.6)
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 0.8
      ctx.strokeRect(cx - r * 0.08, cy - baseR * 0.95, r * 0.16, baseR * 0.6)
      // Red dot
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx, cy, baseR * 0.15, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case 'RADAR_STATION': {
      // Base pedestal + dish (yellow palette)
      const baseW = r * 0.5
      const baseH = r * 0.7
      ctx.fillStyle = hull
      ctx.fillRect(cx - baseW / 2, cy, baseW, baseH)
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 1
      ctx.strokeRect(cx - baseW / 2, cy, baseW, baseH)
      // Dish (parabolic arc)
      ctx.fillStyle = '#fef9c3'
      ctx.beginPath()
      ctx.ellipse(cx, cy - r * 0.05, r * 0.85, r * 0.5, 0, Math.PI + 0.3, -0.3)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 1.2
      ctx.stroke()
      // Feed horn (small circle at focus)
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx, cy - r * 0.35, r * 0.12, 0, Math.PI * 2)
      ctx.fill()
      // Support struts
      ctx.strokeStyle = hullLine
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.4, cy + r * 0.15)
      ctx.lineTo(cx, cy - r * 0.35)
      ctx.lineTo(cx + r * 0.4, cy + r * 0.15)
      ctx.stroke()
      break
    }

    case 'MDV_LANDING_SITE': {
      const bodyR = r * 0.78
      const legInner = bodyR * 0.92
      const legOuter = bodyR * 1.45
      const padR = r * 0.16

      // Central hull (seen from above) with slight faceting.
      ctx.fillStyle = '#dce5ef'
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * (Math.PI / 3)
        const vx = cx + bodyR * Math.cos(a)
        const vy = cy + bodyR * Math.sin(a)
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#93a7bd'
      ctx.lineWidth = Math.max(1.2, r * 0.09)
      ctx.stroke()

      // Upper hull ring.
      ctx.fillStyle = '#e7eef6'
      ctx.beginPath()
      ctx.arc(cx, cy, bodyR * 0.58, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#a7b8cb'
      ctx.lineWidth = Math.max(0.9, r * 0.06)
      ctx.stroke()

      // Six landing legs and pads.
      ctx.strokeStyle = '#8fa2b6'
      ctx.lineWidth = Math.max(1.2, r * 0.11)
      ctx.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * (Math.PI / 3)
        const sx = cx + legInner * Math.cos(a)
        const sy = cy + legInner * Math.sin(a)
        const ex = cx + legOuter * Math.cos(a)
        const ey = cy + legOuter * Math.sin(a)
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.stroke()

        ctx.fillStyle = '#d9e3ee'
        ctx.beginPath()
        ctx.arc(ex, ey, padR, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#8fa2b6'
        ctx.lineWidth = Math.max(0.8, r * 0.05)
        ctx.stroke()
        ctx.strokeStyle = '#8fa2b6'
        ctx.lineWidth = Math.max(1.2, r * 0.11)
      }

      // Side hatch (door) on one side.
      const doorA = Math.PI / 5
      const doorX = cx + bodyR * 0.42 * Math.cos(doorA)
      const doorY = cy + bodyR * 0.42 * Math.sin(doorA)
      ctx.save()
      ctx.translate(doorX, doorY)
      ctx.rotate(doorA)
      ctx.fillStyle = '#9eb2c7'
      ctx.fillRect(-r * 0.12, -r * 0.09, r * 0.24, r * 0.18)
      ctx.strokeStyle = '#7e93a8'
      ctx.lineWidth = Math.max(0.7, r * 0.045)
      ctx.strokeRect(-r * 0.12, -r * 0.09, r * 0.24, r * 0.18)
      ctx.restore()

      // Opposite porthole windows.
      const winBase = doorA + Math.PI
      ctx.fillStyle = '#b9d6f5'
      for (let i = -1; i <= 1; i++) {
        const wa = winBase + i * 0.24
        const wx = cx + bodyR * 0.44 * Math.cos(wa)
        const wy = cy + bodyR * 0.44 * Math.sin(wa)
        ctx.beginPath()
        ctx.arc(wx, wy, r * 0.065, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#7e93a8'
        ctx.lineWidth = Math.max(0.55, r * 0.035)
        ctx.stroke()
      }

      // Core cap.
      ctx.fillStyle = '#c1d5ea'
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    default: {
      drawHullPanel(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7)
    }
  }
  drawLevelDecorations(ctx, cx, cy, r, level, colors)
  ctx.restore()
}

// Draw buildings that span multiple tiles using per-tile modules.
export function drawFootprintBuilding(
  ctx,
  type,
  cells,
  z,
  ox,
  oy,
  hexS,
  alpha,
  level = 1,
) {
  if (!cells || cells.length <= 1) return false
  const colors = BUILDING_COLORS[type] || { fill: '#888', accent: '#aaa' }
  const centers = cells.map((cell) => ({
    x: hexScreenX(cell.x, z, ox),
    y: hexScreenY(cell.x, cell.y, z, oy),
  }))
  const cx = centers.reduce((sum, p) => sum + p.x, 0) / centers.length
  const cy = centers.reduce((sum, p) => sum + p.y, 0) / centers.length
  const podR = hexS * 0.33

  ctx.save()
  ctx.globalAlpha = alpha

  if (type === 'MINE') {
    // Mining facility: one large hex module + one smaller cylinder module.
    const primary = centers[0]
    const secondary = centers[1] || centers[0]
    const vx = secondary.x - primary.x
    const vy = secondary.y - primary.y
    const len = Math.hypot(vx, vy) || 1
    const nx = vx / len
    const ny = vy / len
    const hexPodR = hexS * 0.72
    const hexInnerR = hexPodR * 0.64
    const cylR = hexS * 0.5
    const cylInnerR = cylR * 0.62

    // Bright connector between both modules.
    ctx.strokeStyle = '#ecf2f9'
    ctx.lineWidth = Math.max(2.8, hexS * 0.18)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(primary.x, primary.y)
    ctx.lineTo(secondary.x, secondary.y)
    ctx.stroke()

    // Large hex module on primary tile.
    ctx.fillStyle = '#ecf2f9'
    hexPath(ctx, primary.x, primary.y, hexPodR)
    ctx.fill()
    ctx.strokeStyle = '#8fa2b6'
    ctx.lineWidth = Math.max(1.1, hexS * 0.045)
    ctx.stroke()
    ctx.fillStyle = '#d8e2ed'
    hexPath(ctx, primary.x, primary.y, hexInnerR)
    ctx.fill()
    ctx.fillStyle = colors.accent
    ctx.beginPath()
    ctx.arc(primary.x, primary.y, hexPodR * 0.3, 0, Math.PI * 2)
    ctx.fill()

    // Smaller cylinder module on secondary tile.
    ctx.fillStyle = '#ecf2f9'
    ctx.beginPath()
    ctx.arc(secondary.x, secondary.y, cylR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#8fa2b6'
    ctx.lineWidth = Math.max(1, hexS * 0.04)
    ctx.stroke()
    ctx.fillStyle = '#d8e2ed'
    ctx.beginPath()
    ctx.arc(secondary.x, secondary.y, cylInnerR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = colors.accent
    ctx.beginPath()
    ctx.arc(secondary.x, secondary.y, cylR * 0.3, 0, Math.PI * 2)
    ctx.fill()

    // Dark square centered on top of the cylinder module.
    const drillSize = cylR * 0.56
    ctx.fillStyle = '#475569'
    ctx.fillRect(
      secondary.x - drillSize / 2,
      secondary.y - drillSize / 2,
      drillSize,
      drillSize,
    )

    drawLevelDecorations(ctx, cx, cy, hexS * 0.4, level, colors)
    ctx.restore()
    return true
  }

  if (type === 'HABITAT') {
    ctx.strokeStyle = '#c5d3e3'
    ctx.lineWidth = Math.max(2, hexS * 0.09)
    for (let i = 1; i < centers.length; i++) {
      ctx.beginPath()
      ctx.moveTo(centers[0].x, centers[0].y)
      ctx.lineTo(centers[i].x, centers[i].y)
      ctx.stroke()
    }
    for (const c of centers) {
      ctx.fillStyle = '#ecf2f9'
      ctx.fillRect(c.x - podR * 0.9, c.y - podR * 0.46, podR * 1.8, podR * 0.92)
      ctx.beginPath()
      ctx.ellipse(
        c.x,
        c.y - podR * 0.46,
        podR * 0.9,
        podR * 0.28,
        0,
        Math.PI,
        0,
      )
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(
        c.x,
        c.y + podR * 0.46,
        podR * 0.9,
        podR * 0.28,
        0,
        0,
        Math.PI,
      )
      ctx.fill()
      ctx.strokeStyle = '#8fa2b6'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = colors.accent
      ctx.fillRect(
        c.x - podR * 0.25,
        c.y - podR * 0.12,
        podR * 0.5,
        podR * 0.24,
      )
    }
    drawLevelDecorations(ctx, cx, cy, hexS * 0.4, level, colors)
    ctx.restore()
    return true
  }

  if (type === 'MDV_LANDING_SITE') {
    for (const c of centers) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)'
      ctx.beginPath()
      ctx.arc(c.x, c.y, podR * 0.62, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = Math.max(2, hexS * 0.08)
    ctx.beginPath()
    for (let i = 0; i < centers.length; i++) {
      const c = centers[i]
      if (i === 0) ctx.moveTo(c.x, c.y)
      else ctx.lineTo(c.x, c.y)
    }
    ctx.stroke()

    ctx.fillStyle = '#ecf2f9'
    ctx.beginPath()
    ctx.moveTo(cx, cy - podR * 1.2)
    ctx.lineTo(cx + podR * 0.65, cy + podR * 0.55)
    ctx.lineTo(cx - podR * 0.65, cy + podR * 0.55)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#8fa2b6'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = '#cbe2fb'
    ctx.beginPath()
    ctx.arc(cx, cy - podR * 0.75, podR * 0.24, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return true
  }

  ctx.restore()
  return false
}

/**
 * Draw an alien entity on the map at a given screen position.
 */
export function drawAlienEntity(ctx, type, cx, cy, hexS, alpha, tick) {
  ctx.save()
  ctx.globalAlpha = alpha

  switch (type) {
    case 'SCOUT_PROBE': {
      // Small glowing orb
      const pulse = 0.6 + 0.4 * Math.sin(tick * 0.008)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, hexS * 0.4)
      grad.addColorStop(0, `rgba(168, 85, 247, ${pulse})`)
      grad.addColorStop(0.6, `rgba(168, 85, 247, ${pulse * 0.3})`)
      grad.addColorStop(1, 'rgba(168, 85, 247, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, hexS * 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(233, 213, 255, ${0.7 + 0.3 * pulse})`
      ctx.beginPath()
      ctx.arc(cx, cy, hexS * 0.12, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'RAIDER_PARTY': {
      // Cluster of red dots
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + tick * 0.003
        const dist = hexS * (0.15 + 0.1 * Math.sin(tick * 0.005 + i * 1.2))
        const dx = cx + Math.cos(angle) * dist
        const dy = cy + Math.sin(angle) * dist
        ctx.fillStyle = `rgba(239, 68, 68, ${0.6 + 0.3 * Math.sin(tick * 0.006 + i)})`
        ctx.beginPath()
        ctx.arc(dx, dy, hexS * 0.08, 0, Math.PI * 2)
        ctx.fill()
      }
      // Central marker
      ctx.fillStyle = 'rgba(254, 202, 202, 0.9)'
      ctx.beginPath()
      ctx.arc(cx, cy, hexS * 0.06, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'SIEGE': {
      // Large red formation
      const formR = hexS * 0.5
      const pulse = 0.4 + 0.2 * Math.sin(tick * 0.004)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, formR)
      grad.addColorStop(0, `rgba(239, 68, 68, ${pulse})`)
      grad.addColorStop(0.5, `rgba(185, 28, 28, ${pulse * 0.6})`)
      grad.addColorStop(1, 'rgba(127, 29, 29, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, formR, 0, Math.PI * 2)
      ctx.fill()
      // Inner ring
      ctx.strokeStyle = `rgba(252, 165, 165, ${0.5 + 0.3 * Math.sin(tick * 0.006)})`
      ctx.lineWidth = Math.max(1, hexS * 0.04)
      ctx.beginPath()
      ctx.arc(cx, cy, hexS * 0.25, 0, Math.PI * 2)
      ctx.stroke()
      // Center dot
      ctx.fillStyle = 'rgba(254, 226, 226, 0.95)'
      ctx.beginPath()
      ctx.arc(cx, cy, hexS * 0.08, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }

  ctx.restore()
}
