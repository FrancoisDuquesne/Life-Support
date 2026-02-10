const COMPACT_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function toNumber(value) {
  return Number(value || 0)
}

export function formatCompact(value) {
  return COMPACT_FORMATTER.format(toNumber(value))
}

export function formatFixed(value, digits = 1) {
  return toNumber(value).toFixed(digits)
}

export function formatSignedFixed(value, digits = 1) {
  const n = toNumber(value)
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`
}

export function roundTo(value, digits = 1) {
  const n = toNumber(value)
  const p = Math.pow(10, digits)
  return Math.round(n * p) / p
}

export function clampPercent(value) {
  return Math.max(0, Math.min(100, toNumber(value)))
}

export function worstDeficit(cost, resources) {
  if (!cost || !resources) return null
  let key = ''
  let deficit = 0
  for (const k in cost) {
    const d = toNumber(cost[k]) - toNumber(resources[k])
    if (d > deficit) {
      deficit = d
      key = k
    }
  }
  if (deficit <= 0 || !key) return null
  return { key, deficit }
}
