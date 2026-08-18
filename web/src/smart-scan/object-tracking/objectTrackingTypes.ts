export type BoundingBox = { x: number; y: number; width: number; height: number }

export type ObjectTrackingState = 'INITIALIZING' | 'LOCKED' | 'WEAK' | 'LOST' | 'RECOVERING'

export type ObjectTrackingResult = {
  state: ObjectTrackingState
  box: BoundingBox | null
  confidence: number
  featureCount: number
  inlierCount: number
  timestamp: number
}

export type TrackingFrame = { image: ImageData; box: BoundingBox | null }
