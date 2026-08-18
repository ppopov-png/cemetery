import type { DetectionResult } from './graveDetectionTypes'

export class TargetSelector {
  private selectedId: string | null = null
  private selectedBox: DetectionResult['box'] | null = null
  private selectedClassId: number | null = null
  select(detections: DetectionResult[], frameWidth = 1, frameHeight = 1) {
    if (this.selectedBox && this.selectedClassId != null) { const persistent = detections.filter((detection) => detection.classId === this.selectedClassId && iou(detection.box, this.selectedBox!) >= 0.25).sort((a, b) => b.confidence - a.confidence)[0]; if (persistent) { this.selectedId = persistent.id; this.selectedBox = persistent.box; return persistent } }
    const target = [...detections].sort((a, b) => score(b, frameWidth, frameHeight) - score(a, frameWidth, frameHeight))[0] ?? null
    if (target) { this.selectedId = target.id; this.selectedBox = target.box; this.selectedClassId = target.classId }
    return target
  }
  reset() { this.selectedId = null; this.selectedBox = null; this.selectedClassId = null }
  getSelectedId() { return this.selectedId }
}
function score(detection: DetectionResult, width: number, height: number) { const centerDistance = Math.hypot(detection.box.x + detection.box.width / 2 - 0.5, detection.box.y + detection.box.height / 2 - 0.5); return detection.confidence * 0.65 + Math.min(1, detection.box.width * detection.box.height * width * height / 0.2) * 0.2 + (1 - Math.min(1, centerDistance * 1.4)) * 0.15 }
function iou(a: DetectionResult['box'], b: DetectionResult['box']) { const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)); const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); const intersection = x * y; return intersection / Math.max(0.000001, a.width * a.height + b.width * b.height - intersection) }
