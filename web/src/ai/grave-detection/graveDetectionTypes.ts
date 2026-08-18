import type * as ort from 'onnxruntime-web'

export type BoundingBox = { x: number; y: number; width: number; height: number }
export type DetectionResult = { id: string; classId: number; className: string; confidence: number; box: BoundingBox; timestamp: number }
export type DetectorBackend = 'webgpu' | 'wasm'
export type ModelStatus = 'NOT_LOADED' | 'LOADING' | 'READY' | 'ERROR' | 'MODEL_MISSING'
export type GraveDetectorManifest = { name: string; version: string; inputWidth: number; inputHeight: number; classes: string[]; confidenceThreshold: number; iouThreshold: number; outputFormat?: 'yolo-v8-detection' | 'yolo-v5-detection'; normalize?: boolean }
export type DetectorDiagnostics = { backend: DetectorBackend | null; modelStatus: ModelStatus; inferenceMs: number; detectorFps: number; detections: number; error?: string }
export type OrtSession = ort.InferenceSession
