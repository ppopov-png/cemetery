export const DEPTH_MODEL_PATH = 'models/depth/depth-anything-v2-small.onnx'
export const DEPTH_INPUT_SIZE = 518

export function depthModelUrl(): string {
  return new URL(DEPTH_MODEL_PATH, new URL(import.meta.env.BASE_URL, window.location.origin)).toString()
}
