import { ScaleEstimator } from './scaleEstimator'
import { loadOpenCVForVision } from './opencvLoader'
import type { SpatialAccuracy, SpatialCapabilities, SpatialDiagnostics, SpatialPose, SpatialProvider, SpatialStartContext, SpatialTrackingState } from './spatialTypes'
import { analyzeVisionFrame, type FeaturePoint, type VisionFrameResult } from './visionTrackingCore'

export class VisionSpatialProvider implements SpatialProvider {
  readonly mode = 'vision' as const
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private context: CanvasRenderingContext2D | null = null
  private worker: Worker | null = null
  private previousFeatures: FeaturePoint[] = []
  private timer: number | null = null
  private paused = false
  private processing = false
  private state: SpatialTrackingState = 'INITIALIZING'
  private pose: SpatialPose | null = null
  private relativePosition = { x: 0, y: 0, z: 0 }
  private latest: VisionFrameResult = { features: [], featureCount: 0, matchedFeatureCount: 0, inlierCount: 0, inlierRatio: 0, motion: { x: 0, y: 0 }, processingMs: 0 }
  private sampleCount = 0
  private startedAt = 0
  private readonly scaleEstimator = new ScaleEstimator()
  private readonly poseListeners = new Set<(pose: SpatialPose | null) => void>()
  private readonly diagnosticsListeners = new Set<(diagnostics: SpatialDiagnostics) => void>()

  async start(context: SpatialStartContext) {
    this.stream = context.cameraStream ?? await context.requestCamera()
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.srcObject = this.stream
    await this.video.play()
    this.canvas = document.createElement('canvas')
    this.canvas.width = 320
    this.canvas.height = 240
    this.context = this.canvas.getContext('2d', { willReadFrequently: true })
    if (!this.context) throw new Error('Vision canvas context could not be created.')
    this.worker = this.createWorker()
    void loadOpenCVForVision()
    this.startedAt = performance.now()
    document.addEventListener('visibilitychange', this.handleVisibility)
    window.addEventListener('pagehide', this.handlePageHide)
    window.addEventListener('pageshow', this.handlePageShow)
    this.scheduleSample()
    this.publish()
  }

  async stop() {
    this.clearTimer()
    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('pagehide', this.handlePageHide)
    window.removeEventListener('pageshow', this.handlePageShow)
    this.worker?.terminate()
    this.worker = null
    this.previousFeatures = []
    this.video?.pause()
    this.video = null
    this.canvas = null
    this.context = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.pose = null
    this.poseListeners.forEach((listener) => listener(null))
  }

  resetVisionOrigin() {
    this.relativePosition = { x: 0, y: 0, z: 0 }
    this.pose = null
    this.latest = { features: [], featureCount: 0, matchedFeatureCount: 0, inlierCount: 0, inlierRatio: 0, motion: { x: 0, y: 0 }, processingMs: 0 }
    this.state = 'INITIALIZING'
    this.publish()
    this.scheduleSample()
  }

  getPose() { return this.pose }
  getTrackingState() { return this.state }
  getAccuracy(): SpatialAccuracy { return { level: this.latest.inlierRatio > 0.35 ? 'medium' : 'low', confidence: this.latest.inlierRatio, source: 'Monocular visual tracking; metric scale is not calibrated' } }
  getCapabilities(): SpatialCapabilities { return { webxr: false, immersiveAr: false, hitTest: false, depth: false, camera: true, orientation: true, gps: false } }
  subscribePose(listener: (pose: SpatialPose | null) => void) { this.poseListeners.add(listener); return () => this.poseListeners.delete(listener) }
  subscribeDiagnostics(listener: (diagnostics: SpatialDiagnostics) => void) { this.diagnosticsListeners.add(listener); return () => this.diagnosticsListeners.delete(listener) }
  getCameraStream() { return this.stream }

  private createWorker() {
    try {
      const worker = new Worker(new URL('./visionTracking.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<VisionFrameResult>) => this.handleResult(event.data)
      worker.onerror = () => { worker.terminate(); this.worker = null; this.state = 'LOST'; this.publish(); this.scheduleSample() }
      return worker
    } catch {
      return null
    }
  }

  private scheduleSample() {
    this.clearTimer()
    if (!this.paused) this.timer = window.setTimeout(() => this.sample(), 100)
  }

  private sample() {
    if (this.paused || this.processing || !this.video || !this.canvas || !this.context) return
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) { this.scheduleSample(); return }
    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    const image = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    this.processing = true
    if (this.worker) {
      this.worker.postMessage({ image }, [image.data.buffer])
    } else {
      this.processing = false
      const result = analyzeVisionFrame(image.data, image.width, image.height, this.previousFeatures)
      this.previousFeatures = result.features
      this.handleResult(result)
    }
  }

  private handleResult(result: VisionFrameResult) {
    this.processing = false
    this.latest = result
    this.sampleCount += 1
    const enoughFeatures = result.featureCount >= 8
    const enoughInliers = result.inlierCount >= 6 && result.inlierRatio >= 0.25
    this.state = enoughFeatures && enoughInliers ? 'ACTIVE' : enoughFeatures ? 'WEAK' : 'LOST'
    if (this.state === 'ACTIVE') {
      this.relativePosition = { x: this.relativePosition.x - result.motion.x / 320, y: this.relativePosition.y - result.motion.y / 320, z: this.relativePosition.z }
      this.pose = { position: this.relativePosition, orientation: { x: 0, y: 0, z: 0, w: 1 }, timestamp: Date.now(), source: 'vision', relativeToOrigin: true, metricScaleAvailable: false }
      this.poseListeners.forEach((listener) => listener(this.pose))
    } else {
      this.poseListeners.forEach((listener) => listener(null))
    }
    this.publish()
    this.scheduleSample()
  }

  private publish() {
    const elapsed = Math.max(0.001, (performance.now() - this.startedAt) / 1000)
    this.diagnosticsListeners.forEach((listener) => listener({
      provider: 'Vision', mode: this.mode, trackingState: this.state, accuracy: this.getAccuracy(), featureCount: this.latest.featureCount, matchedFeatureCount: this.latest.matchedFeatureCount, inlierRatio: this.latest.inlierRatio, processingMs: this.latest.processingMs, visionFps: this.sampleCount / elapsed, scaleStatus: this.scaleEstimator.getStatus() === 'UNSCALED' ? 'UNSCALED' : this.scaleEstimator.getStatus(), relativePosition: this.relativePosition, reason: this.state === 'LOST' ? 'Looking for visual features…' : 'Relative visual trajectory; metric scale is unavailable.',
    }))
  }

  private clearTimer() { if (this.timer !== null) window.clearTimeout(this.timer); this.timer = null }
  private handleVisibility = () => { this.paused = document.visibilityState === 'hidden'; if (this.paused) this.clearTimer(); else this.scheduleSample() }
  private handlePageHide = () => { this.paused = true; this.clearTimer() }
  private handlePageShow = () => { this.paused = false; this.scheduleSample() }
}
