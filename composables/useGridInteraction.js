export function useGridInteraction(camera, gridWidth, gridHeight) {
  const hoverTile = ref(null)
  const selectedBuilding = ref(null)
  const selectedColonist = ref(null)
  const DRAG_THRESHOLD = 10

  let pointerDown = false
  let dragStartX = 0
  let dragStartY = 0
  let lastPointerX = 0
  let lastPointerY = 0
  let isDragging = false

  // Pinch state
  let pinchStartDist = 0
  let pinchStartZoom = 1
  let activeTouches = []

  // Long-press state (mobile radial menu)
  let longPressTimer = null
  let longPressFired = false

  function getCanvasCoords(canvas, e) {
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    if (!touch) return { x: 0, y: 0 }
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }
  }

  function getTouchDist(e) {
    if (e.touches.length < 2) return 0
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function getTouchCenter(canvas, e) {
    const rect = canvas.getBoundingClientRect()
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
    return {
      x: cx - rect.left,
      y: cy - rect.top,
    }
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  function onPointerDown(canvas, e, onLongPress) {
    if (e.touches && e.touches.length === 2) {
      pinchStartDist = getTouchDist(e)
      pinchStartZoom = camera.zoom.value
      pointerDown = false // Cancel any pending click from first finger
      cancelLongPress()
      return
    }
    const coords = getCanvasCoords(canvas, e)
    pointerDown = true
    isDragging = false
    longPressFired = false
    dragStartX = coords.x
    dragStartY = coords.y
    lastPointerX = coords.x
    lastPointerY = coords.y

    // Start long-press timer for touch events
    cancelLongPress()
    if (e.touches && e.touches.length === 1 && onLongPress) {
      const touch = e.touches[0]
      const clientX = touch.clientX
      const clientY = touch.clientY
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        longPressFired = true
        const grid = camera.screenToGrid(coords.x, coords.y)
        const gw = gridWidth.value || 32
        const gh = gridHeight.value || 32
        if (grid.gx >= 0 && grid.gx < gw && grid.gy >= 0 && grid.gy < gh) {
          onLongPress(grid.gx, grid.gy, clientX, clientY)
        }
      }, 500)
    }
  }

  function onPointerMove(canvas, e) {
    const coords = getCanvasCoords(canvas, e)

    // Pinch zoom — cancel long-press and click
    if (e.touches && e.touches.length === 2) {
      cancelLongPress()
      pointerDown = false // Prevent click on finger lift
      const dist = getTouchDist(e)
      if (pinchStartDist > 0) {
        const center = getTouchCenter(canvas, e)
        const newZoom = pinchStartZoom * (dist / pinchStartDist)
        const clampedZoom = Math.max(
          camera.MIN_ZOOM,
          Math.min(camera.MAX_ZOOM, newZoom),
        )
        const ratio = clampedZoom / camera.zoom.value
        camera.zoom.value = clampedZoom
        camera.offsetX.value =
          center.x - (center.x - camera.offsetX.value) * ratio
        camera.offsetY.value =
          center.y - (center.y - camera.offsetY.value) * ratio
      }
      return
    }

    // Update hover tile
    const grid = camera.screenToGrid(coords.x, coords.y)
    const gw = gridWidth.value || 32
    const gh = gridHeight.value || 32
    if (grid.gx >= 0 && grid.gx < gw && grid.gy >= 0 && grid.gy < gh) {
      hoverTile.value = { gx: grid.gx, gy: grid.gy }
    } else {
      hoverTile.value = null
    }

    if (pointerDown) {
      const dx = coords.x - lastPointerX
      const dy = coords.y - lastPointerY
      const totalDx = coords.x - dragStartX
      const totalDy = coords.y - dragStartY

      if (
        !isDragging &&
        (Math.abs(totalDx) > DRAG_THRESHOLD ||
          Math.abs(totalDy) > DRAG_THRESHOLD)
      ) {
        isDragging = true
        cancelLongPress()
      }

      if (isDragging) {
        camera.pan(dx, dy)
      }

      lastPointerX = coords.x
      lastPointerY = coords.y
    }
  }

  function onPointerUp(canvas, e, onTileClick) {
    cancelLongPress()
    if (e.touches) {
      if (e.touches.length < 2) {
        pinchStartDist = 0
      }
    }
    if (!pointerDown) return
    pointerDown = false

    if (!isDragging && !longPressFired) {
      const grid = camera.screenToGrid(dragStartX, dragStartY)
      const gw = gridWidth.value || 32
      const gh = gridHeight.value || 32
      if (grid.gx >= 0 && grid.gx < gw && grid.gy >= 0 && grid.gy < gh) {
        if (onTileClick) onTileClick(grid.gx, grid.gy, dragStartX, dragStartY)
      }
    }
    isDragging = false
    longPressFired = false
  }

  function onWheel(canvas, e) {
    e.preventDefault()
    const coords = getCanvasCoords(canvas, e)
    camera.zoomAt(coords.x, coords.y, e.deltaY)
  }

  function selectBuilding(type) {
    selectedBuilding.value = type
    selectedColonist.value = null
  }

  function selectColonist(id) {
    selectedColonist.value = id
    selectedBuilding.value = null
  }

  function clearColonistSelection() {
    selectedColonist.value = null
  }

  function clearSelection() {
    selectedBuilding.value = null
    selectedColonist.value = null
  }

  return {
    hoverTile,
    selectedBuilding,
    selectedColonist,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    selectBuilding,
    selectColonist,
    clearColonistSelection,
    clearSelection,
  }
}
