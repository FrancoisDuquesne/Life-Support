import { HEX_SIZE, HEX_W, HEX_H, HORIZ, VERT } from '~/utils/constants'

export function useCamera(gridWidth, gridHeight) {
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 2.0

  const offsetX = ref(0)
  const offsetY = ref(0)
  const zoom = ref(1.0)

  function centerOn(canvasWidth, canvasHeight) {
    const gw = gridWidth.value || 32
    const gh = gridHeight.value || 32
    const z = zoom.value
    const centerCol = Math.floor(gw / 2)
    const centerRow = Math.floor(gh / 2)
    const hexCX = centerCol * HORIZ + HEX_W / 2
    const hexCY = centerRow * VERT + (centerCol & 1) * (VERT / 2) + HEX_H / 2
    offsetX.value = canvasWidth / 2 - hexCX * z
    offsetY.value = canvasHeight / 2 - hexCY * z
  }

  function gridToScreen(gx, gy) {
    const z = zoom.value
    const sx = gx * HORIZ * z + (HEX_W / 2) * z + offsetX.value
    const sy = gy * VERT * z + (gx & 1) * (VERT / 2) * z + (HEX_H / 2) * z + offsetY.value
    return { sx, sy }
  }

  function screenToGrid(sx, sy) {
    const z = zoom.value
    const wx = (sx - offsetX.value) / z - HEX_W / 2
    const wy = (sy - offsetY.value) / z - HEX_H / 2

    const q = (2 / 3 * wx) / HEX_SIZE
    const r = (-1 / 3 * wx + Math.sqrt(3) / 3 * wy) / HEX_SIZE
    const s = -q - r

    let rq = Math.round(q)
    let rr = Math.round(r)
    let rs = Math.round(s)
    const dq = Math.abs(rq - q)
    const dr = Math.abs(rr - r)
    const ds = Math.abs(rs - s)
    if (dq > dr && dq > ds) {
      rq = -rr - rs
    } else if (dr > ds) {
      rr = -rq - rs
    }

    const col = rq
    const row = rr + Math.floor((rq - (rq & 1)) / 2)
    return { gx: col, gy: row }
  }

  function pan(dx, dy) {
    offsetX.value += dx
    offsetY.value += dy
  }

  function zoomAt(screenX, screenY, delta) {
    const oldZoom = zoom.value
    const factor = delta > 0 ? 0.9 : 1.1
    zoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.value * factor))

    const ratio = zoom.value / oldZoom
    offsetX.value = screenX - (screenX - offsetX.value) * ratio
    offsetY.value = screenY - (screenY - offsetY.value) * ratio
  }

  return {
    offsetX,
    offsetY,
    zoom,
    centerOn,
    screenToGrid,
    gridToScreen,
    pan,
    zoomAt,
    HEX_SIZE,
    HEX_W,
    HEX_H,
    HORIZ,
    VERT,
    MIN_ZOOM,
    MAX_ZOOM
  }
}
