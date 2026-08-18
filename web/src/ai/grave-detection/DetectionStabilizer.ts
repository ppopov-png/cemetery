import type { DetectionResult } from './graveDetectionTypes'

export type StableDetection = DetectionResult & { confirmations: number; iou: number }

export class DetectionStabilizer {
  private history: DetectionResult[][] = []
  private stable: StableDetection | null = null
  constructor(private readonly requiredConfirmations = 3, private readonly historySize = 4, private readonly iouThreshold = 0.45, private readonly confidenceThreshold = 0.55) {}
  update(detections: DetectionResult[]) {
    this.history.push(detections); if (this.history.length > this.historySize) this.history.shift()
    const candidate = detections.filter((detection) => detection.className === 'grave_object' && detection.confidence >= this.confidenceThreshold).sort((a, b) => b.confidence - a.confidence)[0]
    if (!candidate) { this.stable = null; return null }
    const confirmations = this.history.filter((items) => items.some((item) => item.classId === candidate.classId && iou(item.box, candidate.box) >= this.iouThreshold && item.confidence >= this.confidenceThreshold)).length
    this.stable = confirmations >= this.requiredConfirmations ? { ...candidate, confirmations, iou: confirmations > 1 ? 1 : 0 } : null
    return this.stable
  }
  reset() { this.history = []; this.stable = null }
  getStable() { return this.stable }
}
function iou(a: DetectionResult['box'], b: DetectionResult['box']) { const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)); const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); const intersection = x * y; return intersection / Math.max(0.000001, a.width * a.height + b.width * b.height - intersection) }
