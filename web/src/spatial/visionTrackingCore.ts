export type FeaturePoint = { x: number; y: number; descriptor: number[]; score: number }
export type CameraIntrinsicsEstimate = { fx: number; fy: number; cx: number; cy: number; quality: 'estimated'; width: number; height: number }
export type VisionFrameResult = {
  features: FeaturePoint[]
  featureCount: number
  matchedFeatureCount: number
  inlierCount: number
  inlierRatio: number
  spatialCoverage: number
  parallaxPx: number
  motion: { x: number; y: number }
  blurScore: number
  exposureMean: number
  frameUsable: boolean
  intrinsics: CameraIntrinsicsEstimate
  processingMs: number
  trackingConfidence: number
}

export function analyzeVisionFrame(data: Uint8ClampedArray, width: number, height: number, previous: FeaturePoint[]): VisionFrameResult {
  const started = performance.now()
  const quality = frameQuality(data, width, height)
  const features = detectFeatures(data, width, height)
  const matches = matchFeatures(previous, features)
  const inliers = ransacTranslation(matches, width, height)
  const motion = inliers.length
    ? { x: inliers.reduce((sum, match) => sum + match.dx, 0) / inliers.length, y: inliers.reduce((sum, match) => sum + match.dy, 0) / inliers.length }
    : { x: 0, y: 0 }
  const spatialCoverage = coverage(inliers, width, height)
  const inlierRatio = matches.length ? inliers.length / matches.length : 0
  const trackingConfidence = Math.min(1, (Math.min(features.length, 100) / 100) * 0.2 + inlierRatio * 0.35 + Math.min(inliers.length, 50) / 50 * 0.3 + spatialCoverage * 0.15) * (quality.frameUsable ? 1 : 0.35)
  return {
    features,
    featureCount: features.length,
    matchedFeatureCount: matches.length,
    inlierCount: inliers.length,
    inlierRatio,
    spatialCoverage,
    parallaxPx: inliers.length ? median(inliers.map((match) => Math.hypot(match.dx, match.dy))) : 0,
    motion,
    blurScore: quality.blurScore,
    exposureMean: quality.exposureMean,
    frameUsable: quality.frameUsable,
    intrinsics: estimateIntrinsics(width, height),
    processingMs: performance.now() - started,
    trackingConfidence,
  }
}

function detectFeatures(data: Uint8ClampedArray, width: number, height: number): FeaturePoint[] {
  const cells = new Map<string, FeaturePoint[]>()
  for (let y = 3; y < height - 3; y += 4) {
    for (let x = 3; x < width - 3; x += 4) {
      const horizontal = Math.abs(luminance(data, width, x + 2, y) - luminance(data, width, x - 2, y))
      const vertical = Math.abs(luminance(data, width, x, y + 2) - luminance(data, width, x, y - 2))
      const score = horizontal * vertical
      if (score <= 900) continue
      const point = { x, y, score, descriptor: descriptorAt(data, width, x, y) }
      const cellKey = `${Math.floor(x / (width / 4))}:${Math.floor(y / (height / 4))}`
      const cell = cells.get(cellKey) ?? []
      cell.push(point)
      cells.set(cellKey, cell)
    }
  }
  return [...cells.values()].flatMap((cell) => cell.sort((a, b) => b.score - a.score).slice(0, 12)).slice(0, 180)
}

type Match = { sourceX: number; sourceY: number; targetX: number; targetY: number; dx: number; dy: number; distance: number }

function matchFeatures(previous: FeaturePoint[], current: FeaturePoint[]) {
  if (previous.length === 0 || current.length === 0) return []
  const forward = previous.map((source) => bestTwo(source.descriptor, current))
  const backward = current.map((target) => bestTwo(target.descriptor, previous))
  return forward.map((candidate, sourceIndex) => {
    if (!candidate || candidate.distance > 150 || candidate.distance / Math.max(1, candidate.secondDistance) > 0.82) return null
    const targetIndex = candidate.index
    const reverse = backward[targetIndex]
    if (!reverse || reverse.index !== sourceIndex) return null
    const source = previous[sourceIndex]
    const target = current[targetIndex]
    return { sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y, dx: target.x - source.x, dy: target.y - source.y, distance: candidate.distance }
  }).filter((match): match is Match => match !== null)
}

function bestTwo(descriptor: number[], candidates: FeaturePoint[]) {
  let bestIndex = -1
  let bestDistance = Number.POSITIVE_INFINITY
  let secondDistance = Number.POSITIVE_INFINITY
  candidates.forEach((candidate, index) => {
    const distance = descriptorDistance(descriptor, candidate.descriptor)
    if (distance < bestDistance) { secondDistance = bestDistance; bestDistance = distance; bestIndex = index } else if (distance < secondDistance) secondDistance = distance
  })
  return bestIndex < 0 ? null : { index: bestIndex, distance: bestDistance, secondDistance }
}

function ransacTranslation(matches: Match[], width: number, height: number) {
  if (matches.length < 6) return []
  let best: Match[] = []
  const iterations = Math.min(80, matches.length * 2)
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const hypothesis = matches[(iteration * 17) % matches.length]
    const inliers = matches.filter((match) => Math.hypot(match.dx - hypothesis.dx, match.dy - hypothesis.dy) <= Math.max(3, width * 0.018))
    if (inliers.length > best.length) best = inliers
  }
  return best.length >= 6 && coverage(best, width, height) >= 0.25 ? best : []
}

function coverage(matches: Match[], width: number, height: number) {
  if (!matches.length) return 0
  const cells = new Set(matches.map((match) => `${Math.floor(match.targetX / (width / 4))}:${Math.floor(match.targetY / (height / 4))}`))
  return cells.size / 16
}

function frameQuality(data: Uint8ClampedArray, width: number, height: number) {
  let sum = 0
  let laplacianEnergy = 0
  let pixels = 0
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const center = luminance(data, width, x, y)
      sum += center
      const laplacian = 4 * center - luminance(data, width, x - 1, y) - luminance(data, width, x + 1, y) - luminance(data, width, x, y - 1) - luminance(data, width, x, y + 1)
      laplacianEnergy += laplacian * laplacian
      pixels += 1
    }
  }
  const exposureMean = sum / Math.max(1, pixels)
  const blurScore = laplacianEnergy / Math.max(1, pixels)
  return { exposureMean, blurScore, frameUsable: blurScore > 25 && exposureMean > 12 && exposureMean < 243 }
}

function estimateIntrinsics(width: number, height: number): CameraIntrinsicsEstimate {
  const focal = Math.max(width, height) * 0.9
  return { fx: focal, fy: focal, cx: width / 2, cy: height / 2, quality: 'estimated', width, height }
}

function descriptorAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const values: number[] = []
  for (let offsetY = -2; offsetY <= 2; offsetY += 2) for (let offsetX = -2; offsetX <= 2; offsetX += 2) values.push(luminance(data, width, x + offsetX, y + offsetY))
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return values.map((value) => value - mean)
}

function descriptorDistance(first: number[], second: number[]) {
  return Math.sqrt(first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0))
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function luminance(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
}
