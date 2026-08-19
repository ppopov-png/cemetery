import type { DepthFrame, PointCloudData } from './depthTypes'

export function depthToPointCloud(frame: DepthFrame, source: CanvasImageSource, step = 4): PointCloudData {
  const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height
  const context = canvas.getContext('2d'); if (!context) throw new Error('Point cloud canvas is unavailable.')
  context.drawImage(source, 0, 0, frame.width, frame.height)
  const pixels = context.getImageData(0, 0, frame.width, frame.height).data
  const count = Math.ceil(frame.width / step) * Math.ceil(frame.height / step)
  const positions = new Float32Array(count * 3); const colors = new Float32Array(count * 3); let cursor = 0
  for (let y = 0; y < frame.height; y += step) for (let x = 0; x < frame.width; x += step) {
    const i = y * frame.width + x; const z = 1.25 - frame.values[i] * 1.15
    positions[cursor * 3] = (x / frame.width - 0.5) * 1.5; positions[cursor * 3 + 1] = -(y / frame.height - 0.5) * 1.5; positions[cursor * 3 + 2] = z
    colors[cursor * 3] = pixels[i * 4] / 255; colors[cursor * 3 + 1] = pixels[i * 4 + 1] / 255; colors[cursor * 3 + 2] = pixels[i * 4 + 2] / 255; cursor += 1
  }
  return { positions, colors, count: cursor, width: Math.ceil(frame.width / step), height: Math.ceil(frame.height / step), step }
}
