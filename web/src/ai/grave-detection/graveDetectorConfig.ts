export const graveDetectorConfig = {
  manifestPath: 'models/grave-detector/manifest.json',
  modelPath: 'models/grave-detector/grave-detector.onnx',
  inferenceIntervalMs: 333,
  maxDetections: 20,
} as const
