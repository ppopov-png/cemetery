import { objectTrackingConfig as config } from './objectTrackingConfig'
import type { BoundingBox, ObjectTrackingResult } from './objectTrackingTypes'

type Point = { x: number; y: number; descriptor: number[] }
type Match = { point: Point; dx: number; dy: number; distance: number }

export class ObjectTracker {
  private initialBox: BoundingBox | null = null
  private box: BoundingBox | null = null
  private points: Point[] = []
  private state: ObjectTrackingResult['state'] = 'INITIALIZING'
  private lostFrames = 0
  private recoveryFrames = 0

  lock(box: BoundingBox, image: ImageData) {
    this.initialBox = clampBox(box)
    this.box = this.initialBox
    this.points = detectPoints(image, this.initialBox)
    this.state = 'INITIALIZING'
    this.lostFrames = 0
    this.recoveryFrames = 0
    return this.result(0, Date.now())
  }

  reset() {
    this.initialBox = null
    this.box = null
    this.points = []
    this.state = 'INITIALIZING'
    this.lostFrames = 0
    this.recoveryFrames = 0
  }

  update(image: ImageData): ObjectTrackingResult {
    if (!this.box || this.points.length === 0) return this.result(0, Date.now())
    const candidates = detectPoints(image, expandBox(this.box))
    const matches = this.points.map((source) => bestMatch(source, candidates)).filter((match): match is Match => Boolean(match))
    const medianX = median(matches.map((match) => match.dx))
    const medianY = median(matches.map((match) => match.dy))
    const inliers = matches.filter((match) => Math.hypot(match.dx - medianX, match.dy - medianY) <= config.inlierDistancePx)
    const confidence = Math.min(1, (inliers.length / Math.max(config.minInliers, this.points.length)) * 0.75 + (matches.length / Math.max(config.minFeatures, this.points.length)) * 0.25)
    const good = inliers.length >= config.minInliers && confidence >= 0.42
    const weak = inliers.length >= config.weakInliers
    if (good) {
      const next = clampBox({ x: this.box.x + medianX / image.width, y: this.box.y + medianY / image.height, width: this.box.width, height: this.box.height })
      this.box = next
      this.points = inliers.map((match) => ({ ...match.point, x: match.point.x, y: match.point.y }))
      this.lostFrames = 0
      this.state = this.recoveryFrames > 0 ? 'RECOVERING' : 'LOCKED'
      this.recoveryFrames = this.state === 'RECOVERING' ? this.recoveryFrames + 1 : 0
      if (this.recoveryFrames >= config.recoveryFrames) { this.state = 'LOCKED'; this.recoveryFrames = 0 }
    } else {
      this.lostFrames += 1
      this.recoveryFrames = 0
      this.state = weak ? 'WEAK' : this.lostFrames > 2 ? 'LOST' : 'RECOVERING'
    }
    return this.result(Math.min(1, confidence), Date.now(), inliers.length)
  }

  getBox() { return this.box }

  private result(confidence: number, timestamp: number, inliers = 0): ObjectTrackingResult {
    return { state: this.state, box: this.state === 'LOST' ? null : this.box, confidence, featureCount: this.points.length, inlierCount: inliers, timestamp }
  }
}

function detectPoints(image: ImageData, roi: BoundingBox): Point[] {
  const points: Array<Point & { score: number }> = []
  const left = Math.max(3, Math.floor(roi.x * image.width))
  const top = Math.max(3, Math.floor(roi.y * image.height))
  const right = Math.min(image.width - 3, Math.ceil((roi.x + roi.width) * image.width))
  const bottom = Math.min(image.height - 3, Math.ceil((roi.y + roi.height) * image.height))
  for (let y = top; y < bottom; y += 5) for (let x = left; x < right; x += 5) {
    const score = Math.abs(luma(image, x + 2, y) - luma(image, x - 2, y)) * Math.abs(luma(image, x, y + 2) - luma(image, x, y - 2))
    if (score > 500) points.push({ x, y, score, descriptor: descriptor(image, x, y) })
  }
  return points.sort((a, b) => b.score - a.score).slice(0, config.maxFeatures)
}

function bestMatch(source: Point, candidates: Point[]): Match | null {
  let best: Point | null = null
  let distance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) { const current = descriptorDistance(source.descriptor, candidate.descriptor); if (current < distance) { distance = current; best = candidate } }
  return best && distance <= config.descriptorThreshold ? { point: best, dx: best.x - source.x, dy: best.y - source.y, distance } : null
}

function descriptor(image: ImageData, x: number, y: number) { const center = luma(image, x, y); return [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => luma(image, x + dx, y + dy) - center)) }
function descriptorDistance(a: number[], b: number[]) { return a.reduce((sum, value, index) => sum + Math.abs(value - (b[index] ?? 0)), 0) / a.length }
function luma(image: ImageData, x: number, y: number) { const i = (y * image.width + x) * 4; return image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114 }
function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0 }
function clampBox(box: BoundingBox): BoundingBox { const x = Math.max(0, Math.min(1 - box.width, box.x)); const y = Math.max(0, Math.min(1 - box.height, box.y)); return { x, y, width: Math.min(1, box.width), height: Math.min(1, box.height) } }
function expandBox(box: BoundingBox): BoundingBox { return clampBox({ x: box.x - box.width * 0.35, y: box.y - box.height * 0.35, width: box.width * 1.7, height: box.height * 1.7 }) }
