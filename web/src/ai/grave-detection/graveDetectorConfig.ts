export const graveDetectorConfig = {
  manifestUrl: '/models/grave-detector/manifest.json',
  modelUrl: '/models/grave-detector/grave-detector.onnx',
  inferenceIntervalMs: 333,
  maxDetections: 20,
} as const
