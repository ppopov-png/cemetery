import { DEPTH_INPUT_SIZE } from './DepthModelManifest'

export function imageToTensor(source: CanvasImageSource): { data: Float32Array; width: number; height: number } {
  const canvas = document.createElement('canvas')
  canvas.width = DEPTH_INPUT_SIZE
  canvas.height = DEPTH_INPUT_SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Depth preprocessing canvas is unavailable.')
  context.drawImage(source, 0, 0, DEPTH_INPUT_SIZE, DEPTH_INPUT_SIZE)
  const pixels = context.getImageData(0, 0, DEPTH_INPUT_SIZE, DEPTH_INPUT_SIZE).data
  const tensor = new Float32Array(3 * DEPTH_INPUT_SIZE * DEPTH_INPUT_SIZE)
  const mean = [0.485, 0.456, 0.406]
  const std = [0.229, 0.224, 0.225]
  const plane = DEPTH_INPUT_SIZE * DEPTH_INPUT_SIZE
  for (let i = 0; i < plane; i += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      tensor[channel * plane + i] = (pixels[i * 4 + channel] / 255 - mean[channel]) / std[channel]
    }
  }
  return { data: tensor, width: DEPTH_INPUT_SIZE, height: DEPTH_INPUT_SIZE }
}
