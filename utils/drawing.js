import { HEX_SIZE, HEX_W, HEX_H, HORIZ, VERT } from '~/utils/constants'

// Building colors
export const BUILDING_COLORS = {
  SOLAR_PANEL:     { fill: '#f59e0b', accent: '#fbbf24' },
  HYDROPONIC_FARM: { fill: '#22c55e', accent: '#4ade80' },
  WATER_EXTRACTOR: { fill: '#3b82f6', accent: '#60a5fa' },
  MINE:            { fill: '#f97316', accent: '#fb923c' },
  HABITAT:         { fill: '#94a3b8', accent: '#cbd5e1' }
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

export function getTileColors(gw, gh) {
  if (tileColorsCache && tileColorsCache.w === gw && tileColorsCache.h === gh) return tileColorsCache.data
  const data = new Array(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const n1 = valueNoise(x, y, 42, 6)
      const n2 = valueNoise(x, y, 137, 3)
      const n3 = valueNoise(x, y, 251, 1.2)
      const combined = n1 * 0.5 + n2 * 0.3 + n3 * 0.2
      const hue = 28 + (n2 - 0.5) * 10
      const sat = 30 + (n1 - 0.5) * 15
      const light = 58 + (combined - 0.5) * 18
      data[y * gw + x] = 'hsl(' + hue.toFixed(0) + ',' + sat.toFixed(0) + '%,' + light.toFixed(0) + '%)'
    }
  }
  tileColorsCache = { w: gw, h: gh, data }
  return data
}

export function getTileRocks(gw, gh) {
  if (tileRocksCache && tileRocksCache.w === gw && tileRocksCache.h === gh) return tileRocksCache.data
  const data = []
  for (let i = 0; i < gw * gh; i++) {
    const r = Math.random()
    if (r < 0.08) {
      data.push({ type: 'rock_large', ox: Math.random() * 0.4 + 0.1, oy: Math.random() * 0.4 + 0.1,
                   size: 0.2 + Math.random() * 0.15, color: '#9e8a6a' })
    } else if (r < 0.22) {
      const pebbles = []
      const count = 1 + Math.floor(Math.random() * 3)
      for (let p = 0; p < count; p++) {
        pebbles.push({
          ox: Math.random() * 0.7 + 0.1,
          oy: Math.random() * 0.7 + 0.1,
          size: 0.04 + Math.random() * 0.06
        })
      }
      data.push({ type: 'pebbles', pebbles, color: '#a08e70' })
    } else if (r < 0.28) {
      data.push({ type: 'crater', ox: 0.25 + Math.random() * 0.3, oy: 0.25 + Math.random() * 0.3,
                   size: 0.15 + Math.random() * 0.15 })
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
    const angle = Math.PI / 180 * (60 * i)
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
      ctx.arc(cx + pw / 2 - r * 0.3, cy - ph / 2 - r * 0.2, r * 0.18, 0, Math.PI * 2)
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
    default: {
      ctx.fillStyle = colors.fill
      ctx.fillRect(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7)
    }
  }
  ctx.globalAlpha = 1
}
