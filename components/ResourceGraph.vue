<script setup>
import { RESOURCE_KEYS, COLORS } from '~/utils/constants'

const props = defineProps({
  history: Array,
  expanded: Boolean
})

const emit = defineEmits(['toggle'])

const graphCanvas = ref(null)

function niceScale(maxVal) {
  if (maxVal <= 0) return { yMax: 10, step: 5 }
  const rough = maxVal * 1.15
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const residual = rough / mag
  let nice
  if (residual <= 1.5) nice = 1.5 * mag
  else if (residual <= 2) nice = 2 * mag
  else if (residual <= 3) nice = 3 * mag
  else if (residual <= 5) nice = 5 * mag
  else if (residual <= 7.5) nice = 7.5 * mag
  else nice = 10 * mag
  const step = nice / 5
  return { yMax: nice, step: Math.max(1, Math.round(step)) }
}

function drawGraph() {
  const canvas = graphCanvas.value
  if (!canvas || !props.expanded) return

  nextTick(() => {
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight

    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#f7f4ef'
    ctx.fillRect(0, 0, w, h)

    const data = props.history || []
    if (data.length < 2) {
      ctx.fillStyle = '#8a7e6b'
      ctx.font = '11px "Courier New", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for data...', w / 2, h / 2)
      return
    }

    let dataMax = 0
    for (let i = 0; i < data.length; i++) {
      for (const key of RESOURCE_KEYS) {
        const v = data[i][key] || 0
        if (v > dataMax) dataMax = v
      }
    }
    const { yMax, step } = niceScale(dataMax)

    const padL = 32
    const padR = 8
    const padT = 8
    const padB = 18
    const plotW = w - padL - padR
    const plotH = h - padT - padB

    ctx.strokeStyle = 'rgba(0,0,0,0.07)'
    ctx.lineWidth = 0.5
    ctx.font = '9px "Courier New", monospace'
    ctx.fillStyle = '#8a7e6b'
    ctx.textAlign = 'right'
    for (let v = step; v < yMax; v += step) {
      const y = padT + plotH - (v / yMax) * plotH
      ctx.beginPath()
      ctx.moveTo(padL, y)
      ctx.lineTo(w - padR, y)
      ctx.stroke()
      ctx.fillText(Math.round(v), padL - 4, y + 3)
    }

    const zeroY = padT + plotH
    ctx.beginPath()
    ctx.moveTo(padL, zeroY)
    ctx.lineTo(w - padR, zeroY)
    ctx.stroke()
    ctx.fillText('0', padL - 4, zeroY + 3)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#8a7e6b'
    const xStep = Math.max(1, Math.floor(data.length / 6))
    for (let i = 0; i < data.length; i += xStep) {
      const x = padL + (i / (data.length - 1)) * plotW
      ctx.fillText('T' + data[i].tick, x, h - 3)
    }
    if (data.length > 1) {
      const lastX = padL + plotW
      ctx.fillText('T' + data[data.length - 1].tick, lastX, h - 3)
    }

    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (const key of RESOURCE_KEYS) {
      ctx.strokeStyle = COLORS[key]
      ctx.beginPath()
      for (let i = 0; i < data.length; i++) {
        const x = padL + (i / (data.length - 1)) * plotW
        const val = Math.max(0, Math.min(yMax, data[i][key] || 0))
        const y = padT + plotH - (val / yMax) * plotH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    const lastIdx = data.length - 1
    for (const key of RESOURCE_KEYS) {
      const x = padL + plotW
      const val = Math.max(0, Math.min(yMax, data[lastIdx][key] || 0))
      const y = padT + plotH - (val / yMax) * plotH
      ctx.fillStyle = COLORS[key]
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

watch(() => props.history && props.history.length, drawGraph)
watch(() => props.expanded, (val) => {
  if (val) nextTick(drawGraph)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="expanded" class="graph-modal-backdrop" @click="emit('toggle')">
      <div class="graph-modal" @click.stop>
        <div class="graph-modal-header">
          <span>Resource Analytics</span>
          <button class="btn" @click="emit('toggle')">Close</button>
        </div>
        <canvas ref="graphCanvas" class="resource-graph-canvas"></canvas>
        <div class="graph-legend">
          <span class="legend-item energy">Energy</span>
          <span class="legend-item food">Food</span>
          <span class="legend-item water">Water</span>
          <span class="legend-item minerals">Minerals</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.graph-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.graph-modal {
  background: var(--surface);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  width: 90%;
  max-width: 600px;
  padding: 16px;
}
.graph-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.graph-modal-header span {
  font-size: .8rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-bright);
}
.resource-graph-canvas {
  width: 100%;
  height: 200px;
  display: block;
  border-radius: 4px;
}
.graph-legend {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: .55rem;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.legend-item { font-weight: bold }
.legend-item.energy { color: var(--energy) }
.legend-item.food { color: var(--food) }
.legend-item.water { color: var(--water) }
.legend-item.minerals { color: var(--minerals) }

@media (max-width: 768px) {
  .resource-graph-canvas { height: 120px }
}
</style>
