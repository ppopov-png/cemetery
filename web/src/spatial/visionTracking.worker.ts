import { analyzeVisionFrame, type FeaturePoint } from './visionTrackingCore'

let previous: FeaturePoint[] = []
self.onmessage = (event: MessageEvent<{ image: ImageData }>) => {
  const result = analyzeVisionFrame(event.data.image.data, event.data.image.width, event.data.image.height, previous)
  previous = result.features
  self.postMessage({ ...result, features: undefined })
}
