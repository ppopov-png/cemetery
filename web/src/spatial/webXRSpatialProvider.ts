import { startXRTracking, type XRTrackingController, type XRTrackingDiagnostics } from '../xr/xrService'
import type { SpatialAccuracy, SpatialCapabilities, SpatialDiagnostics, SpatialPose, SpatialProvider, SpatialStartContext, SpatialTrackingState } from './spatialTypes'

export class WebXRSpatialProvider implements SpatialProvider {
  readonly mode = 'xr-standard' as const
  private controller: XRTrackingController | null = null
  private pose: SpatialPose | null = null
  private state: SpatialTrackingState = 'STARTING'
  private readonly poseListeners = new Set<(pose: SpatialPose | null) => void>()
  private readonly diagnosticsListeners = new Set<(diagnostics: SpatialDiagnostics) => void>()

  async start(_context: SpatialStartContext) {
    this.controller = await startXRTracking((update) => {
      this.state = 'ACTIVE'
      this.pose = { position: update.position, orientation: update.orientation, timestamp: Date.now(), source: 'webxr', relativeToOrigin: true, metricScaleAvailable: true }
      this.poseListeners.forEach((listener) => listener(this.pose))
    }, (diagnostics) => this.handleDiagnostics(diagnostics))
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = this.subscribePose((pose) => { if (pose) { unsubscribe(); resolve() } })
      window.setTimeout(() => { unsubscribe(); reject(new Error('WebXR session produced no viewer pose.')) }, 2500)
    }).catch(async (error) => { await this.stop(); throw error })
  }

  async stop() { await this.controller?.stop(); this.controller = null; this.pose = null; this.state = 'LOST'; this.poseListeners.forEach((listener) => listener(null)) }
  getPose() { return this.pose }
  getTrackingState() { return this.state }
  getAccuracy(): SpatialAccuracy { return { level: 'high', confidence: 1, source: 'WebXR viewer pose' } }
  getCapabilities(): SpatialCapabilities { return { webxr: true, immersiveAr: true, hitTest: true, depth: false, camera: true, orientation: true, gps: true } }
  subscribePose(listener: (pose: SpatialPose | null) => void) { this.poseListeners.add(listener); return () => this.poseListeners.delete(listener) }
  subscribeDiagnostics(listener: (diagnostics: SpatialDiagnostics) => void) { this.diagnosticsListeners.add(listener); return () => this.diagnosticsListeners.delete(listener) }

  private handleDiagnostics(diagnostics: XRTrackingDiagnostics) {
    this.state = diagnostics.state === 'ACTIVE' ? 'ACTIVE' : diagnostics.state === 'SEARCHING' ? 'SEARCHING' : diagnostics.state === 'LOST' ? 'LOST' : 'STARTING'
    const data: SpatialDiagnostics = {
      provider: 'WebXR', mode: this.mode, trackingState: this.state, accuracy: this.getAccuracy(), scaleStatus: 'METRIC', reason: diagnostics.xrFrameLoopError ?? undefined,
      xrSessionActive: diagnostics.sessionActive, referenceSpaceType: diagnostics.referenceSpaceType, xrPoseActive: diagnostics.poseActive, xrFrames: diagnostics.xrFrames, trackingFrames: diagnostics.trackingFrames, lastXRFrameAt: diagnostics.lastXRFrameAt,
      webglStatus: diagnostics.webglStatus, xrCompatibleGL: diagnostics.xrCompatibleGL, baseLayerActive: diagnostics.baseLayerActive, xrVisibility: diagnostics.xrVisibility, xrFrameLoopError: diagnostics.xrFrameLoopError,
    }
    this.diagnosticsListeners.forEach((listener) => listener(data))
  }
}
