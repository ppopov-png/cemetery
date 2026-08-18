import type { LocationReading } from '../sensors/geolocationService'
import type { OrientationReading } from '../sensors/orientationService'

export type CapabilityStatus = 'checking' | 'ready' | 'limited' | 'unavailable' | 'permission-denied'
export type SpatialMode = 'ar' | 'limited'
export type SpatialTrackingState = 'STARTING' | 'SEARCHING' | 'ACTIVE' | 'LOST' | 'LIMITED'

export type Vector3 = { x: number; y: number; z: number }

export type SmartScanSensorData = {
  location: LocationReading | null
  orientation: OrientationReading
  position: Vector3 | null
  distanceFromStart: number | null
}

export type SmartScanCapabilities = {
  camera: CapabilityStatus
  gps: CapabilityStatus
  orientation: CapabilityStatus
  webxr: CapabilityStatus
  immersiveAr: CapabilityStatus
  depth: 'unknown'
  spatialMode: SpatialMode
  trackingState: SpatialTrackingState
  referenceSpaceType: 'local-floor' | 'local' | null
  xrSessionActive: boolean
  xrPoseActive: boolean
  xrFrames: number
  trackingFrames: number
  xrError: { name: string; message: string } | null
  sensorData: SmartScanSensorData
}
