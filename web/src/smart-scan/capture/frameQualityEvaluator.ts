import type { BoundingBox } from '../object-tracking/objectTrackingTypes'
import type { ObjectTrackingResult } from '../object-tracking/objectTrackingTypes'

export type FrameQualityResult = { score: number; sharpness: number; brightness: number; exposureQuality: number; objectVisibility: number; trackingConfidence: number; accepted: boolean; rejectReason?: string }

export function evaluateFrameQuality(image: ImageData, box: BoundingBox | null, tracking: ObjectTrackingResult): FrameQualityResult {
  let brightness = 0
  let contrast = 0
  for (let i = 0; i < image.data.length; i += 16) brightness += image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114
  brightness /= Math.max(1, Math.ceil(image.data.length / 16))
  for (let i = 0; i < image.data.length; i += 64) { const value = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114; contrast += Math.abs(value - brightness) }
  const sharpness = Math.min(1, contrast / Math.max(1, image.data.length / 64) / 80)
  const exposureQuality = brightness < 28 ? brightness / 28 : brightness > 235 ? (255 - brightness) / 20 : 1
  const objectVisibility = box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1 && box.y + box.height <= 1 ? 1 : 0
  const score = Math.max(0, Math.min(1, sharpness * 0.3 + Math.max(0, exposureQuality) * 0.25 + objectVisibility * 0.2 + tracking.confidence * 0.25))
  const rejectReason = brightness < 18 ? 'Too dark' : brightness > 245 ? 'Strong overexposure' : sharpness < 0.18 ? 'Move the phone more slowly' : objectVisibility < 1 ? 'Keep the object in frame' : tracking.state !== 'LOCKED' ? 'Keep the object in the frame' : undefined
  return { score, sharpness, brightness, exposureQuality: Math.max(0, Math.min(1, exposureQuality)), objectVisibility, trackingConfidence: tracking.confidence, accepted: !rejectReason && score >= 0.5 }
}
