import type { SpatialAccuracy, SpatialCapabilities, SpatialDiagnostics, SpatialPose, SpatialProvider, SpatialStartContext, SpatialTrackingState } from './spatialTypes'

export class VisionSpatialProvider implements SpatialProvider {
  readonly mode = 'vision' as const
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private timer: number | null = null
  private state: SpatialTrackingState = 'CALIBRATING'
  private featureCount = 0
  private matchedFeatureCount = 0
  private previousFeatures: FeaturePoint[] = []
  private sampleCount = 0
  private startedAt = 0
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
    this.startedAt = performance.now()
    this.sample()
    this.publish()
  }

  async stop() {
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = null
    this.video?.pause()
    this.video = null
    this.canvas = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.previousFeatures = []
    this.poseListeners.forEach((listener) => listener(null))
  }

  getPose() { return null }
  getTrackingState() { return this.state }
  getAccuracy(): SpatialAccuracy { return { level: 'low', confidence: this.matchedFeatureCount > 20 ? 0.5 : 0.1, source: 'Monocular visual tracking; metric scale is not calibrated' } }
  getCapabilities(): SpatialCapabilities { return { webxr: false, immersiveAr: false, hitTest: false, depth: false, camera: true, orientation: true, gps: false } }
  subscribePose(listener: (pose: SpatialPose | null) => void) { this.poseListeners.add(listener); return () => this.poseListeners.delete(listener) }
  subscribeDiagnostics(listener: (diagnostics: SpatialDiagnostics) => void) { this.diagnosticsListeners.add(listener); return () => this.diagnosticsListeners.delete(listener) }

  private sample() {
    if (!this.video || !this.canvas) return
    const context = this.canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    const image = context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const currentFeatures = detectFeatures(image.data, image.width, image.height)
    this.matchedFeatureCount = matchFeatures(this.previousFeatures, currentFeatures)
    this.previousFeatures = currentFeatures
    this.featureCount = currentFeatures.length
    this.sampleCount += 1
    this.state = currentFeatures.length > 24 ? 'CALIBRATING' : 'SEARCHING'
    this.publish()
    this.timer = window.setTimeout(() => this.sample(), 100)
  }

  private publish() {
    const elapsed = Math.max(0.001, (performance.now() - this.startedAt) / 1000)
    const diagnostics: SpatialDiagnostics = { provider: 'Vision', mode: this.mode, trackingState: this.state, accuracy: this.getAccuracy(), featureCount: this.featureCount, matchedFeatureCount: this.matchedFeatureCount, visionFps: this.sampleCount / elapsed, scaleStatus: 'CALIBRATING', reason: 'Relative visual features are sampled; metric pose is not claimed.' }
    this.diagnosticsListeners.forEach((listener) => listener(diagnostics))
  }

  getCameraStream() { return this.stream }
}

type FeaturePoint = { x: number; y: number; descriptor: number[] }

function detectFeatures(data: Uint8ClampedArray, width: number, height: number): FeaturePoint[] {
  const points: FeaturePoint[] = []
  for (let y = 2; y < height - 2; y += 4) {
    for (let x = 2; x < width - 2; x += 4) {
      const horizontal = Math.abs(luminance(data, width, x + 2, y) - luminance(data, width, x - 2, y))
      const vertical = Math.abs(luminance(data, width, x, y + 2) - luminance(data, width, x, y - 2))
      if (horizontal * vertical > 900 && points.length < 160) points.push({ x, y, descriptor: descriptorAt(data, width, x, y) })
    }
  }
  return points
}

function matchFeatures(previous: FeaturePoint[], current: FeaturePoint[]) {
  let matches = 0
  for (const source of previous) {
    let best = Number.POSITIVE_INFINITY
    for (const target of current) best = Math.min(best, descriptorDistance(source.descriptor, target.descriptor))
    if (best < 180) matches += 1
  }
  return matches
}

function descriptorAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const values: number[] = []
  for (let offsetY = -2; offsetY <= 2; offsetY += 2) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 2) values.push(luminance(data, width, x + offsetX, y + offsetY))
  }
  return values
}

function descriptorDistance(first: number[], second: number[]) {
  return Math.sqrt(first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0))
}

function luminance(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
}
