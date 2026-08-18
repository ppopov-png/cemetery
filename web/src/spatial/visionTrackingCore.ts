export type FeaturePoint = { x: number; y: number; descriptor: number[] }
export type VisionFrameResult = {
  features: FeaturePoint[]
  featureCount: number
  matchedFeatureCount: number
  inlierCount: number
  inlierRatio: number
  motion: { x: number; y: number }
  processingMs: number
}

export function analyzeVisionFrame(data: Uint8ClampedArray, width: number, height: number, previous: FeaturePoint[]): VisionFrameResult {
  const started = performance.now()
  const features = detectFeatures(data, width, height)
  const matches = matchFeatures(previous, features)
  const inliers = robustInliers(matches)
  const motion = inliers.length
    ? { x: inliers.reduce((sum, match) => sum + match.dx, 0) / inliers.length, y: inliers.reduce((sum, match) => sum + match.dy, 0) / inliers.length }
    : { x: 0, y: 0 }
  return { features, featureCount: features.length, matchedFeatureCount: matches.length, inlierCount: inliers.length, inlierRatio: matches.length ? inliers.length / matches.length : 0, motion, processingMs: performance.now() - started }
}

function detectFeatures(data: Uint8ClampedArray, width: number, height: number): FeaturePoint[] {
  const points: FeaturePoint[] = []
  for (let y = 3; y < height - 3; y += 4) {
    for (let x = 3; x < width - 3; x += 4) {
      const horizontal = Math.abs(luminance(data, width, x + 2, y) - luminance(data, width, x - 2, y))
      const vertical = Math.abs(luminance(data, width, x, y + 2) - luminance(data, width, x, y - 2))
      if (horizontal * vertical > 900 && points.length < 180) points.push({ x, y, descriptor: descriptorAt(data, width, x, y) })
    }
  }
  return points
}

function matchFeatures(previous: FeaturePoint[], current: FeaturePoint[]) {
  return previous.map((source) => {
    let best: { target: FeaturePoint; distance: number } | null = null
    for (const target of current) {
      const distance = descriptorDistance(source.descriptor, target.descriptor)
      if (!best || distance < best.distance) best = { target, distance }
    }
    return best && best.distance < 180 ? { dx: best.target.x - source.x, dy: best.target.y - source.y, distance: best.distance } : null
  }).filter((match): match is { dx: number; dy: number; distance: number } => match !== null)
}

function robustInliers(matches: Array<{ dx: number; dy: number; distance: number }>) {
  if (matches.length < 4) return []
  const medianX = median(matches.map((match) => match.dx))
  const medianY = median(matches.map((match) => match.dy))
  return matches.filter((match) => Math.hypot(match.dx - medianX, match.dy - medianY) < 8)
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function descriptorAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const values: number[] = []
  for (let offsetY = -2; offsetY <= 2; offsetY += 2) for (let offsetX = -2; offsetX <= 2; offsetX += 2) values.push(luminance(data, width, x + offsetX, y + offsetY))
  return values
}

function descriptorDistance(first: number[], second: number[]) {
  return Math.sqrt(first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0))
}

function luminance(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
}
