import { getCurrentLocation, type LocationReading } from '../sensors/geolocationService'
import { subscribeToOrientation } from '../sensors/orientationService'
import type { SpatialAccuracy, SpatialCapabilities, SpatialDiagnostics, SpatialPose, SpatialProvider, SpatialStartContext, SpatialTrackingState } from './spatialTypes'

export class SensorSpatialProvider implements SpatialProvider {
  readonly mode = 'sensor-limited' as const
  private state: SpatialTrackingState = 'LIMITED'
  private location: LocationReading | null = null
  private unsubscribeOrientation: (() => void) | null = null
  private readonly poseListeners = new Set<(pose: SpatialPose | null) => void>()
  private readonly diagnosticsListeners = new Set<(diagnostics: SpatialDiagnostics) => void>()

  async start(_context: SpatialStartContext) {
    this.state = 'LIMITED'
    this.location = await getCurrentLocation().catch(() => null)
    this.unsubscribeOrientation = subscribeToOrientation(() => undefined)
    this.publish()
  }

  async stop() {
    this.unsubscribeOrientation?.()
    this.unsubscribeOrientation = null
    this.poseListeners.forEach((listener) => listener(null))
  }

  getPose() { return null }
  getTrackingState() { return this.state }
  getAccuracy(): SpatialAccuracy { return { level: 'low', horizontalMeters: this.location?.accuracy, source: 'GPS and device sensors; no metric spatial pose' } }
  getCapabilities(): SpatialCapabilities { return { webxr: false, immersiveAr: false, hitTest: false, depth: false, camera: true, orientation: true, gps: true } }
  subscribePose(listener: (pose: SpatialPose | null) => void) { this.poseListeners.add(listener); return () => this.poseListeners.delete(listener) }
  subscribeDiagnostics(listener: (diagnostics: SpatialDiagnostics) => void) { this.diagnosticsListeners.add(listener); return () => this.diagnosticsListeners.delete(listener) }

  private publish() {
    const diagnostics: SpatialDiagnostics = { provider: 'Sensors', mode: this.mode, trackingState: this.state, accuracy: this.getAccuracy(), scaleStatus: 'UNSCALED', reason: 'Sensors do not provide reliable local X/Y/Z.' }
    this.diagnosticsListeners.forEach((listener) => listener(diagnostics))
  }
}
