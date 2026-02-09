<script setup>
import { RESOURCE_KEYS, COLORS } from '~/utils/constants'

const props = defineProps({
  history: Array,
  expanded: Boolean
})

const emit = defineEmits(['toggle'])

const open = computed({
  get: () => props.expanded,
  set: (val) => { if (!val) emit('toggle') }
})

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

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, w, h)

    const data = props.history || []
    if (data.length < 2) {
      ctx.fillStyle = '#64748b'
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

    ctx.strokeStyle = 'rgba(148,163,184,0.1)'
    ctx.lineWidth = 0.5
    ctx.font = '9px "Courier New", monospace'
    ctx.fillStyle = '#64748b'
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
    ctx.fillStyle = '#64748b'
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
watch(graphCanvas, (canvas) => {
  if (canvas && props.expanded) nextTick(drawGraph)
})
</script>

<template>
  <UModal v-model:open="open" title="Resource Analytics" :ui="{ width: 'sm:max-w-xl' }">
    <template #body>
      <canvas ref="graphCanvas" class="w-full h-[200px] block rounded max-md:h-[120px]"></canvas>
      <div class="flex gap-3 mt-2 text-[0.55rem] uppercase tracking-[0.5px]">
        <span class="font-bold text-amber-400">Energy</span>
        <span class="font-bold text-green-400">Food</span>
        <span class="font-bold text-blue-400">Water</span>
        <span class="font-bold text-orange-400">Minerals</span>
      </div>
    </template>
  </UModal>
</template>
