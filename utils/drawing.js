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
  RECYCLING_CENTER: { fill: '#84cc16', accent: '#a3e635' },
  REPAIR_STATION: { fill: '#ef4444', accent: '#f87171' },
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

      const hue = baseHue + (n2 - 0.5) * 10
      const sat = baseSat + (n1 - 0.5) * 15
      const light = baseLight + (combined - 0.5) * 12
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

export function getTileRocks(gw, gh) {
  if (tileRocksCache && tileRocksCache.w === gw && tileRocksCache.h === gh)
    return tileRocksCache.data
  const data = []
  for (let i = 0; i < gw * gh; i++) {
    const r = Math.random()
    if (r < 0.08) {
      data.push({
        type: 'rock_large',
        ox: Math.random() * 0.4 + 0.1,
        oy: Math.random() * 0.4 + 0.1,
        size: 0.2 + Math.random() * 0.15,
        color: '#9e8a6a',
      })
    } else if (r < 0.22) {
      const pebbles = []
      const count = 1 + Math.floor(Math.random() * 3)
      for (let p = 0; p < count; p++) {
        pebbles.push({
          ox: Math.random() * 0.7 + 0.1,
          oy: Math.random() * 0.7 + 0.1,
          size: 0.04 + Math.random() * 0.06,
        })
      }
      data.push({ type: 'pebbles', pebbles, color: '#a08e70' })
    } else if (r < 0.28) {
      data.push({
        type: 'crater',
        ox: 0.25 + Math.random() * 0.3,
        oy: 0.25 + Math.random() * 0.3,
        size: 0.15 + Math.random() * 0.15,
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

  // Draw deposit indicators
  if (tile.deposit) {
    switch (tile.deposit.id) {
      case 'MINERAL_VEIN': {
        // Orange sparkle dots
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 + 0.5
          const dist = r * 0.4
          const px = cx + Math.cos(angle) * dist
          const py = cy + Math.sin(angle) * dist
          const alpha = 0.4 + 0.4 * Math.sin(tick * 0.003 + i * 1.5)
          ctx.fillStyle = `rgba(251, 146, 60, ${alpha})`
          ctx.beginPath()
          ctx.arc(px, py, hexS * 0.04, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      }
      case 'ICE_DEPOSIT': {
        // Blue-white radial glow + crystal shapes
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.7)
        grad.addColorStop(0, 'rgba(147, 197, 253, 0.2)')
        grad.addColorStop(1, 'rgba(147, 197, 253, 0)')
        ctx.fillStyle = grad
        hexPath(ctx, cx, cy, hexS)
        ctx.fill()
        // Small crystal shapes
        for (let i = 0; i < 2; i++) {
          const angle = i * Math.PI + tick * 0.0005
          const dist = r * 0.3
          const px = cx + Math.cos(angle) * dist
          const py = cy + Math.sin(angle) * dist
          ctx.save()
          ctx.translate(px, py)
          ctx.rotate(angle)
          ctx.fillStyle = 'rgba(219, 234, 254, 0.5)'
          ctx.fillRect(-hexS * 0.03, -hexS * 0.03, hexS * 0.06, hexS * 0.06)
          ctx.restore()
        }
        break
      }
      case 'GEOTHERMAL_VENT': {
        // Orange-red glow at center
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.6)
        grad.addColorStop(0, 'rgba(255, 100, 0, 0.25)')
        grad.addColorStop(1, 'rgba(255, 100, 0, 0)')
        ctx.fillStyle = grad
        hexPath(ctx, cx, cy, hexS)
        ctx.fill()
        // Rising heat wave lines
        ctx.strokeStyle = 'rgba(255, 150, 50, 0.3)'
        ctx.lineWidth = 0.8
        for (let i = 0; i < 2; i++) {
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
        // Purple shimmer dots
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2 + 1.0
          const dist = r * 0.35
          const px = cx + Math.cos(angle) * dist
          const py = cy + Math.sin(angle) * dist
          const alpha = 0.3 + 0.3 * Math.sin(tick * 0.002 + i * 2.0)
          ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`
          ctx.beginPath()
          ctx.arc(px, py, hexS * 0.035, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      }
    }
  }

  // Draw hazard indicators
  if (tile.hazard) {
    switch (tile.hazard.id) {
      case 'RADIATION': {
        // Pulsing yellow-green concentric rings
        const pulseRadius = ((tick * 0.004) % 1.0) * r * 0.8
        const alpha = 0.3 * (1 - pulseRadius / (r * 0.8))
        ctx.strokeStyle = `rgba(163, 230, 53, ${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2)
        ctx.stroke()
        // Static warning dot at center
        ctx.fillStyle = 'rgba(163, 230, 53, 0.4)'
        ctx.beginPath()
        ctx.arc(cx, cy, hexS * 0.04, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'UNSTABLE': {
        // Static dark crack lines from center
        ctx.strokeStyle = 'rgba(80, 60, 40, 0.6)'
        ctx.lineWidth = 0.8
        const angles = [0.3, 2.5, 4.5]
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
        break
      }
      case 'TOXIC_VENT': {
        // Green wisps drifting upward
        for (let i = 0; i < 3; i++) {
          const baseX = cx + (i - 1) * r * 0.25
          const yOff = (tick * 0.015 + i * 20) % 30
          const py = cy + r * 0.3 - yOff * hexS * 0.015
          const alpha = 0.25 * (1 - yOff / 30)
          ctx.fillStyle = `rgba(74, 222, 128, ${alpha})`
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
 * Draw an HP bar below a building on the map.
 */
export function drawHPBar(ctx, cx, cy, hexS, hp, maxHp) {
  const pct = Math.max(0, Math.min(1, hp / maxHp))
  if (pct >= 0.99) return // Don't show bar at full HP
  const barW = hexS * 0.9
  const barH = hexS * 0.12
  const barX = cx - barW / 2
  const barY = cy + hexS * 0.45
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(barX, barY, barW, barH)
  // Fill — green > yellow > red
  let color
  if (pct > 0.6) color = '#22c55e'
  else if (pct > 0.3) color = '#eab308'
  else color = '#ef4444'
  ctx.fillStyle = color
  ctx.fillRect(barX, barY, barW * pct, barH)
  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 0.5
  ctx.strokeRect(barX, barY, barW, barH)
}

// Distinct building shapes — center-relative drawing
export function drawBuilding(ctx, type, x, y, size, alpha) {
  const colors = BUILDING_COLORS[type] || { fill: '#888', accent: '#aaa' }
  ctx.globalAlpha = alpha
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size * 0.4

  switch (type) {
    case 'SOLAR_PANEL': {
      const pw = r * 1.8
      const ph = r * 1.1
      ctx.fillStyle = colors.fill
      ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph)
      ctx.strokeStyle = colors.accent
      ctx.lineWidth = 0.8
      for (let i = 1; i < 3; i++) {
        const gx = cx - pw / 2 + (pw / 3) * i
        ctx.beginPath()
        ctx.moveTo(gx, cy - ph / 2)
        ctx.lineTo(gx, cy + ph / 2)
        ctx.stroke()
      }
      const midY = cy
      ctx.beginPath()
      ctx.moveTo(cx - pw / 2, midY)
      ctx.lineTo(cx + pw / 2, midY)
      ctx.stroke()
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(
        cx + pw / 2 - r * 0.3,
        cy - ph / 2 - r * 0.2,
        r * 0.18,
        0,
        Math.PI * 2,
      )
      ctx.fill()
      break
    }
    case 'HYDROPONIC_FARM': {
      ctx.fillStyle = colors.fill
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * 1.1, r * 0.75, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = colors.accent
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(cx, cy + r * 0.1, r * 0.6, Math.PI * 1.1, Math.PI * 1.9)
      ctx.stroke()
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.moveTo(cx, cy - r * 0.35)
      ctx.quadraticCurveTo(cx + r * 0.4, cy - r * 0.1, cx, cy + r * 0.25)
      ctx.quadraticCurveTo(cx - r * 0.4, cy - r * 0.1, cx, cy - r * 0.35)
      ctx.fill()
      break
    }
    case 'WATER_EXTRACTOR': {
      ctx.strokeStyle = colors.fill
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.moveTo(cx, cy - r * 0.35)
      ctx.quadraticCurveTo(cx + r * 0.25, cy, cx, cy + r * 0.3)
      ctx.quadraticCurveTo(cx - r * 0.25, cy, cx, cy - r * 0.35)
      ctx.fill()
      break
    }
    case 'MINE': {
      ctx.fillStyle = colors.fill
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r * 0.8, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r * 0.8, cy)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = colors.accent
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.35, cy - r * 0.35)
      ctx.lineTo(cx + r * 0.35, cy + r * 0.35)
      ctx.moveTo(cx + r * 0.35, cy - r * 0.35)
      ctx.lineTo(cx - r * 0.1, cy + r * 0.1)
      ctx.stroke()
      break
    }
    case 'HABITAT': {
      const baseW = r * 1.4
      const baseH = r * 0.45
      ctx.fillStyle = colors.fill
      ctx.fillRect(cx - baseW / 2, cy, baseW, baseH)
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.7, Math.PI, 0)
      ctx.fill()
      ctx.strokeStyle = colors.accent
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy - r * 0.1, r * 0.25, Math.PI * 1.2, Math.PI * 1.8)
      ctx.stroke()
      ctx.fillStyle = colors.accent
      ctx.fillRect(cx - r * 0.1, cy, r * 0.2, baseH * 0.8)
      break
    }
    case 'OXYGEN_GENERATOR': {
      // Cylindrical tank with O2 bubbles
      ctx.fillStyle = colors.fill
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * 0.55, r * 0.9, 0, 0, Math.PI * 2)
      ctx.fill()
      // Tank bands
      ctx.strokeStyle = colors.accent
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.55, cy - r * 0.25)
      ctx.lineTo(cx + r * 0.55, cy - r * 0.25)
      ctx.moveTo(cx - r * 0.55, cy + r * 0.25)
      ctx.lineTo(cx + r * 0.55, cy + r * 0.25)
      ctx.stroke()
      // O2 bubbles
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx - r * 0.15, cy - r * 0.05, r * 0.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + r * 0.15, cy + r * 0.15, r * 0.08, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'RTG': {
      // Nuclear symbol — hexagonal casing with radiation trefoil
      ctx.fillStyle = colors.fill
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 6 + (Math.PI / 3) * i
        const vx = cx + r * 0.8 * Math.cos(angle)
        const vy = cy + r * 0.8 * Math.sin(angle)
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
      ctx.fill()
      // Inner glow circle
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2)
      ctx.fill()
      // Three blades (trefoil)
      ctx.fillStyle = colors.fill
      for (let i = 0; i < 3; i++) {
        const angle = ((Math.PI * 2) / 3) * i - Math.PI / 2
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.55, angle - 0.35, angle + 0.35)
        ctx.lineTo(cx, cy)
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'RECYCLING_CENTER': {
      // Circular arrows (recycling symbol) around center
      ctx.fillStyle = colors.fill
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2)
      ctx.fill()
      // Three curved arrows
      ctx.strokeStyle = colors.accent
      ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) {
        const startA = ((Math.PI * 2) / 3) * i
        const endA = startA + Math.PI * 0.5
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.45, startA, endA)
        ctx.stroke()
        // Arrow tip
        const tipX = cx + r * 0.45 * Math.cos(endA)
        const tipY = cy + r * 0.45 * Math.sin(endA)
        ctx.fillStyle = colors.accent
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(
          tipX + r * 0.15 * Math.cos(endA - 0.8),
          tipY + r * 0.15 * Math.sin(endA - 0.8),
        )
        ctx.lineTo(
          tipX + r * 0.15 * Math.cos(endA + 0.8),
          tipY + r * 0.15 * Math.sin(endA + 0.8),
        )
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'REPAIR_STATION': {
      // Wrench/gear shape
      ctx.fillStyle = colors.fill
      // Gear body
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
      // Gear teeth
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i
        const tx = cx + r * 0.65 * Math.cos(angle)
        const ty = cy + r * 0.65 * Math.sin(angle)
        ctx.fillRect(tx - r * 0.1, ty - r * 0.1, r * 0.2, r * 0.2)
      }
      // Center hole
      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2)
      ctx.fill()
      // Cross
      ctx.strokeStyle = colors.fill
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.12, cy)
      ctx.lineTo(cx + r * 0.12, cy)
      ctx.moveTo(cx, cy - r * 0.12)
      ctx.lineTo(cx, cy + r * 0.12)
      ctx.stroke()
      break
    }
    default: {
      ctx.fillStyle = colors.fill
      ctx.fillRect(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7)
    }
  }
  ctx.globalAlpha = 1
}
