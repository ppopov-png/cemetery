import type { SpatialSample } from '../../spatial/spatialTypes'
import type { SpatialMode } from '../smartScanTypes'
import type { BoundingBox } from '../object-tracking/objectTrackingTypes'
import type { FrameQualityResult } from './frameQualityEvaluator'
import type { ViewSignature } from './viewDiversityEvaluator'

export type RelativeView = 'CENTER' | 'LEFT' | 'RIGHT' | 'HIGH' | 'LOW' | 'OTHER'
export type CapturedFrame = { id: string; timestamp: number; image: Blob; width: number; height: number; graveBox: BoundingBox; detectorConfidence: number; trackerConfidence: number; quality: FrameQualityResult; spatialSample?: SpatialSample; relativeView?: RelativeView; ocrCandidateScore?: number; viewSignature?: ViewSignature }
export type ScanLifecycleStatus = 'SCANNING' | 'CAPTURE_COMPLETE' | 'LOCAL_OCR_PENDING' | 'LOCAL_OCR_COMPLETE' | 'SYNC_PENDING' | 'SERVER_OCR_PROCESSING' | 'SERVER_OCR_COMPLETE' | 'REVIEW_REQUIRED' | 'COMPLETE'
export type ScanSession = { id: string; startedAt: number; completedAt?: number; spatialMode: SpatialMode; frames: CapturedFrame[]; candidateFrames: number; acceptedFrames: number; rejectedFrames: number; lastRejectReason?: string; viewDiversityScore?: number; detectorModelVersion?: string; lifecycle?: ScanLifecycleStatus; status: 'active' | 'complete' | 'cancelled' | 'failed'; selectedObject?: { initialBox: BoundingBox; currentBox?: BoundingBox } }
