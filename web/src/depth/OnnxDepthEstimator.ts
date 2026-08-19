import * as ort from 'onnxruntime-web'
import { depthModelUrl, DEPTH_INPUT_SIZE } from './DepthModelManifest'
import { imageToTensor } from './DepthPreprocessor'
import { normalizeDepth } from './DepthPostprocessor'
import type { DepthBackend, DepthFrame } from './depthTypes'

export class OnnxDepthEstimator {
  private session: ort.InferenceSession | null = null
  private backend: DepthBackend = 'wasm'

  async load(): Promise<void> {
    ort.env.wasm.wasmPaths = new URL('ort/', new URL(import.meta.env.BASE_URL, window.location.origin)).toString()
    const gpu = 'gpu' in navigator && await (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu?.requestAdapter()
    this.backend = gpu ? 'webgpu' : 'wasm'
    if (!gpu) ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2)
    this.session = await ort.InferenceSession.create(depthModelUrl(), gpu ? { executionProviders: ['webgpu', 'wasm'] } : { executionProviders: ['wasm'] })
  }

  getBackend(): DepthBackend { return this.backend }
  isLoaded(): boolean { return this.session !== null }

  async estimate(source: CanvasImageSource): Promise<DepthFrame> {
    if (!this.session) throw new Error('Depth model is not loaded.')
    const prepared = imageToTensor(source)
    const start = performance.now()
    const inputName = this.session.inputNames[0]
    const outputs = await this.session.run({ [inputName]: new ort.Tensor('float32', prepared.data, [1, 3, DEPTH_INPUT_SIZE, DEPTH_INPUT_SIZE]) })
    const output = outputs[this.session.outputNames[0]]
    if (!output || !(output.data instanceof Float32Array)) throw new Error('Depth model output format is unsupported.')
    const normalized = normalizeDepth(output.data)
    return { ...normalized, width: DEPTH_INPUT_SIZE, height: DEPTH_INPUT_SIZE, backend: this.backend, inferenceMs: performance.now() - start }
  }
}
