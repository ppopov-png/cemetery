export type SpatialMode = 'xr-high' | 'xr-standard' | 'vision' | 'sensor-limited'
export type SpatialTrackingState = 'INITIALIZING' | 'STARTING' | 'ACTIVE' | 'WEAK' | 'SEARCHING' | 'CALIBRATING' | 'LOST' | 'LIMITED'
export type SpatialSource = 'webxr' | 'vision' | 'sensors'
export type PositionMethod = 'webxr-depth' | 'webxr' | 'vision-depth' | 'vision-scaled' | 'vision-unscaled' | 'gps-sensors'

export type SpatialPose = {
  position: { x: number; y: number; z: number }
  orientation: { x: number; y: number; z: number; w: number }
  timestamp: number
  source: SpatialSource
  relativeToOrigin: boolean
  metricScaleAvailable: boolean
}

export type SpatialAccuracy = {
  level: 'high' | 'medium' | 'low' | 'unknown'
  horizontalMeters?: number
  verticalMeters?: number
  confidence?: number
  source: string
}

export type SpatialCapabilities = {
  webxr: boolean
  immersiveAr: boolean
  hitTest: boolean
  depth: boolean
  camera: boolean
  orientation: boolean
  gps: boolean
}

export type SpatialDiagnostics = {
  provider: string
  mode: SpatialMode
  trackingState: SpatialTrackingState
  accuracy: SpatialAccuracy | null
  featureCount?: number
  matchedFeatureCount?: number
  visionFps?: number
  scaleStatus?: 'METRIC' | 'ESTIMATED' | 'CALIBRATING' | 'UNSCALED'
  reason?: string
  inlierRatio?: number
  processingMs?: number
  relativePosition?: { x: number; y: number; z: number }
  xrSessionActive?: boolean
  referenceSpaceType?: 'local-floor' | 'local' | null
  xrPoseActive?: boolean
  xrFrames?: number
  trackingFrames?: number
  lastXRFrameAt?: number | null
  webglStatus?: 'ACTIVE' | 'ERROR'
  xrCompatibleGL?: boolean
  baseLayerActive?: boolean
  xrVisibility?: string
  xrFrameLoopError?: string | null
}

export type SpatialStartContext = {
  cameraStream?: MediaStream | null
  requestCamera: () => Promise<MediaStream>
}

export interface SpatialProvider {
  readonly mode: SpatialMode
  start(context: SpatialStartContext): Promise<void>
  stop(): Promise<void>
  getPose(): SpatialPose | null
  getTrackingState(): SpatialTrackingState
  getAccuracy(): SpatialAccuracy | null
  getCapabilities(): SpatialCapabilities
  subscribePose(listener: (pose: SpatialPose | null) => void): () => void
  subscribeDiagnostics(listener: (diagnostics: SpatialDiagnostics) => void): () => void
}

export type SpatialSample = {
  timestamp: number
  position?: SpatialPose['position']
  orientation?: SpatialPose['orientation']
  method: PositionMethod
  accuracy: SpatialAccuracy
  gps?: { lat: number; lon: number; altitude?: number; accuracy: number }
}
