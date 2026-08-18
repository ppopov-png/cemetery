import type { SpatialSample } from '../../spatial/spatialTypes'
import type { SpatialMode } from '../smartScanTypes'
import type { BoundingBox } from '../object-tracking/objectTrackingTypes'
import type { FrameQualityResult } from './frameQualityEvaluator'
import type { ViewSignature } from './viewDiversityEvaluator'

export type RelativeView = 'CENTER' | 'LEFT' | 'RIGHT' | 'HIGH' | 'LOW' | 'OTHER'
export type CapturedFrame = { id: string; timestamp: number; image: Blob; width: number; height: number; quality: FrameQualityResult; objectBox: BoundingBox; objectTrackingConfidence: number; spatialSample?: SpatialSample; relativeView?: RelativeView; viewSignature?: ViewSignature }
export type ScanSession = { id: string; startedAt: number; completedAt?: number; spatialMode: SpatialMode; frames: CapturedFrame[]; candidateFrames: number; acceptedFrames: number; rejectedFrames: number; lastRejectReason?: string; viewDiversityScore?: number; status: 'active' | 'complete' | 'cancelled' | 'failed'; selectedObject?: { initialBox: BoundingBox; currentBox?: BoundingBox } }
