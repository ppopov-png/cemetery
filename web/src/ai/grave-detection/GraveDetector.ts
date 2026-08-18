import { ModelLoader } from './ModelLoader'
import type { DetectionResult, DetectorDiagnostics, GraveDetectorManifest, ModelStatus } from './graveDetectionTypes'
import type * as ort from 'onnxruntime-web'

export type GraveDetectorInput = { image: ImageData; timestamp?: number }

export class GraveDetector {
  readonly loader = new ModelLoader()
  private inferenceTimes: number[] = []
  async load() { return this.loader.load() }
  async unload() { return this.loader.unload() }
  getStatus(): ModelStatus { return this.loader.getStatus() }
  getManifest(): GraveDetectorManifest | null { return this.loader.getManifest() }
  getDiagnostics(detections = 0): DetectorDiagnostics { const ms = this.inferenceTimes.at(-1) ?? 0; return { backend: this.loader.getBackend(), modelStatus: this.loader.getStatus(), inferenceMs: ms, detectorFps: this.inferenceTimes.length ? 1000 / (this.inferenceTimes.reduce((a, b) => a + b, 0) / this.inferenceTimes.length) : 0, detections, error: this.loader.getError() } }

  async detect(input: GraveDetectorInput): Promise<DetectionResult[]> {
    const session = this.loader.getSession(); const manifest = this.loader.getManifest(); if (!session || !manifest) throw new Error('Detector model is not ready.')
    const runtime = await this.loader.getRuntime(); const started = performance.now(); const tensorInput = preprocess(input.image, manifest, runtime); const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: tensorInput }; const output = await session.run(feeds); const result = decodeDetections(output, manifest, input.timestamp ?? Date.now()); this.inferenceTimes.push(performance.now() - started); if (this.inferenceTimes.length > 30) this.inferenceTimes.shift(); return result
  }
}

function preprocess(image: ImageData, manifest: GraveDetectorManifest, runtime: typeof import('onnxruntime-web')) {
  const size = manifest.inputWidth; const data = new Float32Array(3 * size * size); const scale = Math.min(size / image.width, size / image.height); const offsetX = (size - image.width * scale) / 2; const offsetY = (size - image.height * scale) / 2
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const sx = Math.floor((x - offsetX) / scale); const sy = Math.floor((y - offsetY) / scale); const source = sx >= 0 && sy >= 0 && sx < image.width && sy < image.height ? (sy * image.width + sx) * 4 : -1; const r = source >= 0 ? image.data[source] : 114; const g = source >= 0 ? image.data[source + 1] : 114; const b = source >= 0 ? image.data[source + 2] : 114; const divisor = manifest.normalize === false ? 1 : 255; const index = y * size + x; data[index] = r / divisor; data[size * size + index] = g / divisor; data[size * size * 2 + index] = b / divisor }
  return new runtime.Tensor('float32', data, [1, 3, size, size])
}

function decodeDetections(output: Record<string, ort.Tensor>, manifest: GraveDetectorManifest, timestamp: number): DetectionResult[] { const tensor = output[Object.keys(output)[0]]; if (!tensor || !(tensor.data instanceof Float32Array || tensor.data instanceof Float64Array)) return []; const values = tensor.data as Float32Array; const dimensions = tensor.dims; const rows = dimensions.at(-2) ?? 0; const columns = dimensions.at(-1) ?? 0; const detections: DetectionResult[] = []; if (manifest.outputFormat === 'yolo-v5-detection' && columns >= 6) for (let row = 0; row < rows; row++) { const offset = row * columns; const confidence = values[offset + 4]; const classId = argmax(values, offset + 5, columns - 5); const score = confidence * values[offset + 5 + classId]; if (score >= manifest.confidenceThreshold) detections.push(toDetection(values[offset], values[offset + 1], values[offset + 2], values[offset + 3], score, classId, manifest, timestamp)) } else if (columns >= 6) for (let row = 0; row < rows; row++) { const offset = row * columns; const classId = argmax(values, offset + 4, columns - 4); const score = values[offset + 4 + classId]; if (score >= manifest.confidenceThreshold) detections.push(toDetection(values[offset], values[offset + 1], values[offset + 2], values[offset + 3], score, classId, manifest, timestamp)) } return nonMaximumSuppression(detections, manifest.iouThreshold).slice(0, 20) }
function toDetection(cx: number, cy: number, width: number, height: number, confidence: number, classId: number, manifest: GraveDetectorManifest, timestamp: number): DetectionResult { return { id: `${timestamp}-${classId}-${Math.round(cx * 10000)}`, classId, className: manifest.classes[classId] ?? `class_${classId}`, confidence, box: { x: Math.max(0, cx - width / 2), y: Math.max(0, cy - height / 2), width: Math.min(width, 1), height: Math.min(height, 1) }, timestamp } }
function argmax(values: Float32Array | Float64Array, offset: number, length: number) { let index = 0; for (let i = 1; i < length; i++) if (values[offset + i] > values[offset + index]) index = i; return index }
function nonMaximumSuppression(detections: DetectionResult[], threshold: number) { return [...detections].sort((a, b) => b.confidence - a.confidence).filter((candidate, index, all) => !all.slice(0, index).some((kept) => kept.classId === candidate.classId && iou(kept.box, candidate.box) > threshold)) }
function iou(a: DetectionResult['box'], b: DetectionResult['box']) { const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)); const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); const intersection = x * y; return intersection / Math.max(0.000001, a.width * a.height + b.width * b.height - intersection) }
