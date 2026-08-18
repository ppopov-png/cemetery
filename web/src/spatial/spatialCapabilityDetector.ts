export type SpatialCapabilitiesSnapshot = {
  camera: boolean
  gps: boolean
  orientation: boolean
  motion: boolean
  webxr: boolean
  immersiveAr: boolean
  hitTest: boolean
  domOverlay: boolean
  depth: boolean
  webgl: boolean
  webgl2: boolean
  wasm: boolean
  workers: boolean
  offscreenCanvas: boolean
  webgpu: boolean
}

type XRLike = {
  isSessionSupported: (mode: 'immersive-ar') => Promise<boolean>
}

export async function detectSpatialCapabilities(): Promise<SpatialCapabilitiesSnapshot> {
  const xr = (navigator as Navigator & { xr?: XRLike }).xr
  let immersiveAr = false
  if (xr) immersiveAr = await xr.isSessionSupported('immersive-ar').catch(() => false)

  const canvas = document.createElement('canvas')
  const webgl = Boolean(canvas.getContext('webgl'))
  const webgl2 = Boolean(canvas.getContext('webgl2'))
  return {
    camera: typeof navigator.mediaDevices?.getUserMedia === 'function',
    gps: 'geolocation' in navigator,
    orientation: 'DeviceOrientationEvent' in window,
    motion: 'DeviceMotionEvent' in window,
    webxr: Boolean(xr),
    immersiveAr,
    hitTest: immersiveAr,
    domOverlay: immersiveAr,
    depth: false,
    webgl,
    webgl2,
    wasm: typeof WebAssembly !== 'undefined',
    workers: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    webgpu: 'gpu' in navigator,
  }
}
