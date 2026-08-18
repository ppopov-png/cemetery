import type { BoundingBox } from '../object-tracking/objectTrackingTypes'

export type ViewSignature = { orientation: { alpha: number | null; beta: number | null; gamma: number | null }; position: { x: number; y: number; z: number } | null; box: BoundingBox }
export type DiversitySample = { signature: ViewSignature; score: number }

export class ViewDiversityEvaluator {
  private samples: DiversitySample[] = []
  reset() { this.samples = [] }
  evaluate(signature: ViewSignature) {
    if (!this.samples.length) return { accepted: true, score: 1 }
    const score = Math.max(...this.samples.map((sample) => diversity(signature, sample.signature)))
    return { accepted: score >= 0.12, score }
  }
  add(signature: ViewSignature, score: number) { this.samples.push({ signature, score }) }
  getCount() { return this.samples.length }
}

function diversity(a: ViewSignature, b: ViewSignature) {
  const orientation = angleDistance(a.orientation, b.orientation) / 180
  const translation = a.position && b.position ? Math.min(1, Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z)) : 0
  const box = Math.min(1, Math.hypot(a.box.x - b.box.x, a.box.y - b.box.y) * 3)
  return Math.min(1, orientation * 0.55 + translation * 0.25 + box * 0.2)
}
function angleDistance(a: ViewSignature['orientation'], b: ViewSignature['orientation']) { return Math.hypot((a.alpha ?? 0) - (b.alpha ?? 0), (a.beta ?? 0) - (b.beta ?? 0), (a.gamma ?? 0) - (b.gamma ?? 0)) }
