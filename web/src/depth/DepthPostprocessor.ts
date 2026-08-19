export function normalizeDepth(values: Float32Array): { values: Float32Array; min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value) }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) throw new Error('Depth model returned no usable values.')
  const normalized = new Float32Array(values.length)
  const range = max - min
  for (let i = 0; i < values.length; i += 1) normalized[i] = Number.isFinite(values[i]) ? (values[i] - min) / range : 0
  return { values: normalized, min, max }
}
