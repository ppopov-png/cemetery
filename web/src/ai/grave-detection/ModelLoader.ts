import { graveDetectorConfig } from './graveDetectorConfig'
import type { DetectorBackend, GraveDetectorManifest, ModelStatus, OrtSession } from './graveDetectionTypes'

export class ModelLoader {
  private session: OrtSession | null = null
  private manifest: GraveDetectorManifest | null = null
  private backend: DetectorBackend | null = null
  private status: ModelStatus = 'NOT_LOADED'
  private loadPromise: Promise<void> | null = null
  private error: string | undefined
  private runtime: typeof import('onnxruntime-web') | null = null

  async load() {
    if (this.status === 'READY') return
    if (this.loadPromise) return this.loadPromise
    this.status = 'LOADING'
    this.loadPromise = this.loadInternal().catch((error) => { this.status = error instanceof ModelMissingError ? 'MODEL_MISSING' : 'ERROR'; this.error = getErrorMessage(error); throw error }).finally(() => { this.loadPromise = null })
    return this.loadPromise
  }

  async unload() { this.session?.release(); this.session = null; this.manifest = null; this.backend = null; this.runtime = null; this.status = 'NOT_LOADED' }
  getSession() { return this.session }
  getManifest() { return this.manifest }
  getBackend() { return this.backend }
  getStatus() { return this.status }
  getError() { return this.error }
  async getRuntime() { return this.runtime ??= await import('onnxruntime-web') }

  private async loadInternal() {
    const manifestUrl = assetUrl(graveDetectorConfig.manifestPath)
    const manifestResponse = await fetch(manifestUrl, { cache: 'force-cache' })
    if (manifestResponse.status === 404) throw new ModelMissingError('Grave detector manifest is missing.')
    if (!manifestResponse.ok) throw new Error(`Could not load detector manifest (${manifestResponse.status}).`)
    this.manifest = await manifestResponse.json() as GraveDetectorManifest
    const modelUrl = assetUrl(graveDetectorConfig.modelPath)
    const modelResponse = await fetch(modelUrl, { method: 'HEAD', cache: 'force-cache' })
    if (modelResponse.status === 404) throw new ModelMissingError('Grave detector ONNX model is missing.')
    if (!modelResponse.ok) throw new Error(`Could not access detector model (${modelResponse.status}).`)
    const webgpu = await isUsableWebGPU()
    const ort = await this.getRuntime()
    this.backend = webgpu ? 'webgpu' : 'wasm'
    try {
      this.session = await ort.InferenceSession.create(modelUrl, { executionProviders: webgpu ? ['webgpu'] : ['wasm'], graphOptimizationLevel: 'all' })
    } catch (error) {
      if (webgpu) { this.backend = 'wasm'; this.session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }) } else throw error
    }
    this.status = 'READY'
  }
}

export class ModelMissingError extends Error { readonly code = 'MODEL_MISSING'; constructor(message: string) { super(message); this.name = 'ModelMissingError' } }

async function isUsableWebGPU() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  if (!gpu) return false
  try { return Boolean(await gpu.requestAdapter()) } catch { return false }
}
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : 'Detector model could not be loaded.' }
function assetUrl(path: string) { return new URL(path, new URL(import.meta.env.BASE_URL, window.location.origin)).toString() }
