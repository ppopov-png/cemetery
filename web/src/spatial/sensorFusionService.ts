import type { LocationReading } from '../sensors/geolocationService'
import type { OrientationReading } from '../sensors/orientationService'

export type SensorSnapshot = { location: LocationReading | null; orientation: OrientationReading; timestamp: number }

export class SensorFusionService {
  private snapshot: SensorSnapshot = { location: null, orientation: { alpha: null, beta: null, gamma: null }, timestamp: 0 }
  updateLocation(location: LocationReading | null) { this.snapshot = { ...this.snapshot, location, timestamp: Date.now() } }
  updateOrientation(orientation: OrientationReading) { this.snapshot = { ...this.snapshot, orientation, timestamp: Date.now() } }
  getSnapshot() { return this.snapshot }
  // Intentionally does not synthesize X/Y/Z or run a Kalman filter yet.
}
