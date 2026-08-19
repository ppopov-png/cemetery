export type DepthBackend = 'webgpu' | 'wasm'

export type DepthFrame = {
  width: number
  height: number
  values: Float32Array
  min: number
  max: number
  backend: DepthBackend
  inferenceMs: number
}

export type PointCloudData = {
  positions: Float32Array
  colors: Float32Array
  count: number
  width: number
  height: number
  step: number
}
