import type { Vector3 } from '../smart-scan/smartScanTypes'

export type XRTrackingState = 'STARTING' | 'SEARCHING' | 'ACTIVE' | 'LOST'
export type XRReferenceSpaceType = 'local-floor' | 'local' | null

export type XRTrackingUpdate = {
  position: Vector3
  orientation: { x: number; y: number; z: number; w: number }
  distanceFromStart: number
}

export type XRTrackingDiagnostics = {
  sessionActive: boolean
  referenceSpaceType: XRReferenceSpaceType
  poseActive: boolean
  xrFrames: number
  trackingFrames: number
  lastXRFrameAt: number | null
  webglStatus: 'ACTIVE' | 'ERROR'
  xrCompatibleGL: boolean
  baseLayerActive: boolean
  xrVisibility: XRVisibilityStateName
  state: XRTrackingState
  xrFrameLoopError: string | null
  errorName?: string
  errorMessage?: string
}

export type XRVisibilityStateName = 'visible' | 'visible-blurred' | 'hidden' | 'unknown'
export type XRTrackingController = {
  session: XRSessionLike
  setOnUpdate: (handler: (update: XRTrackingUpdate) => void) => void
  setOnDiagnostics: (handler: (diagnostics: XRTrackingDiagnostics) => void) => void
  stop: () => Promise<void>
}

type XRReferenceSpaceLike = object
type XRViewerPoseLike = {
  transform: {
    position: Vector3
    orientation: { x: number; y: number; z: number; w: number }
  }
}
type XRFrameLike = {
  session: XRSessionLike
  getViewerPose: (referenceSpace: XRReferenceSpaceLike) => XRViewerPoseLike | null
}
type XRRenderStateLike = { baseLayer: XRWebGLLayerLike | null }
type XRSessionLike = EventTarget & {
  visibilityState?: XRVisibilityStateName
  renderState: XRRenderStateLike
  requestReferenceSpace: (type: 'local-floor' | 'local') => Promise<XRReferenceSpaceLike>
  updateRenderState: (state: { baseLayer: XRWebGLLayerLike }) => void
  requestAnimationFrame: (callback: (time: number, frame: XRFrameLike) => void) => number
  cancelAnimationFrame: (handle: number) => void
  end: () => Promise<void>
}
type XRSessionInitLike = {
  optionalFeatures?: string[]
  domOverlay?: { root: HTMLElement }
}
type XRSystemLike = {
  isSessionSupported: (sessionMode: 'immersive-ar') => Promise<boolean>
  requestSession: (sessionMode: 'immersive-ar', options?: XRSessionInitLike) => Promise<XRSessionLike>
}
type XRWebGLLayerLike = { framebuffer: WebGLFramebuffer | null }
type XRWebGLLayerConstructor = new (session: XRSessionLike, context: WebGLRenderingContext | WebGL2RenderingContext) => XRWebGLLayerLike
type XRCompatibleContext = (WebGLRenderingContext | WebGL2RenderingContext) & { makeXRCompatible?: () => Promise<void> }

function getXR() {
  return (navigator as Navigator & { xr?: XRSystemLike }).xr
}

export function isWebXRSupported() {
  return typeof getXR() !== 'undefined'
}

export async function isImmersiveARSupported() {
  const xr = getXR()
  if (!xr) return false
  try {
    return await xr.isSessionSupported('immersive-ar')
  } catch {
    return false
  }
}

export async function startXRTracking(
  onUpdate: (update: XRTrackingUpdate) => void,
  onDiagnostics: (diagnostics: XRTrackingDiagnostics) => void,
): Promise<XRTrackingController> {
  const xr = getXR()
  if (!xr) throw new Error('WebXR is not supported by this browser.')

  const session = await requestARSession(xr)
  let canvas: HTMLCanvasElement | null = null
  let gl: XRCompatibleContext | null = null
  try {
    canvas = createXRCanvas()
    gl = getXRCompatibleContext(canvas)
    if (!gl) throw new Error('WebGL context could not be created.')
    if (typeof gl.makeXRCompatible === 'function') await gl.makeXRCompatible()

    const XRWebGLLayer = getXRWebGLLayerConstructor()
    if (!XRWebGLLayer) throw new Error('XRWebGLLayer is not available in this browser.')
    const baseLayer = new XRWebGLLayer(session, gl)
    session.updateRenderState({ baseLayer })
    if (session.renderState.baseLayer === null) throw new Error('XRWebGLLayer was not attached to the XR session.')
    gl.clearColor(0, 0, 0, 0)
  } catch (error) {
    await session.end().catch(() => undefined)
    throw error
  }

  let referenceSpace: XRReferenceSpaceLike
  let referenceSpaceType: XRReferenceSpaceType = null
  try {
    referenceSpace = await session.requestReferenceSpace('local-floor')
    referenceSpaceType = 'local-floor'
  } catch {
    referenceSpace = await session.requestReferenceSpace('local')
    referenceSpaceType = 'local'
  }

  let updateHandler = onUpdate
  let diagnosticsHandler = onDiagnostics
  let origin: Vector3 | null = null
  let frameHandle = 0
  let stopped = false
  let lastPoseAt = 0
  let xrFrames = 0
  let trackingFrames = 0
  let lastXRFrameAt: number | null = null
  let state: XRTrackingState = 'STARTING'
  let frameLoopError: string | null = null
  let frameWatchdog: number | null = window.setTimeout(() => {
    if (xrFrames === 0 && !stopped) {
      frameLoopError = 'XR session active but frame loop is not running.'
      publish(false)
    }
  }, 2000)

  const publish = (poseActive: boolean) => {
    diagnosticsHandler({
      sessionActive: !stopped,
      referenceSpaceType,
      poseActive,
      xrFrames,
      trackingFrames,
      lastXRFrameAt,
      webglStatus: 'ACTIVE',
      xrCompatibleGL: true,
      baseLayerActive: session.renderState.baseLayer !== null,
      xrVisibility: session.visibilityState ?? 'unknown',
      state,
      xrFrameLoopError: frameLoopError,
    })
  }

  const onVisibilityChange = () => publish(state === 'ACTIVE')
  document.addEventListener('visibilitychange', onVisibilityChange)
  session.addEventListener('visibilitychange', onVisibilityChange)

  const frame = (_time: number, xrFrame: XRFrameLike) => {
    if (stopped) return
    if (frameWatchdog !== null) {
      window.clearTimeout(frameWatchdog)
      frameWatchdog = null
    }
    xrFrames += 1
    lastXRFrameAt = Date.now()
    const pose = xrFrame.getViewerPose(referenceSpace)
    if (!pose) {
      if (state === 'STARTING' || Date.now() - lastPoseAt > 500) state = 'SEARCHING'
      publish(false)
    } else {
      trackingFrames += 1
      lastPoseAt = Date.now()
      state = 'ACTIVE'
      const current = pose.transform.position
      origin ??= { x: current.x, y: current.y, z: current.z }
      const position = { x: current.x - origin.x, y: current.y - origin.y, z: current.z - origin.z }
      updateHandler({
        position,
        orientation: pose.transform.orientation,
        distanceFromStart: Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2),
      })
      publish(true)
    }

    if (gl && session.renderState.baseLayer?.framebuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    }
    if (!stopped) frameHandle = xrFrame.session.requestAnimationFrame(frame)
  }

  session.addEventListener('end', () => {
    if (stopped) return
    stopped = true
    if (frameWatchdog !== null) window.clearTimeout(frameWatchdog)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    session.removeEventListener('visibilitychange', onVisibilityChange)
    state = 'LOST'
    publish(false)
  })
  publish(false)
  frameHandle = session.requestAnimationFrame(frame)

  return {
    session,
    setOnUpdate: (handler) => { updateHandler = handler },
    setOnDiagnostics: (handler) => { diagnosticsHandler = handler; publish(state === 'ACTIVE') },
    stop: async () => {
      if (stopped) return
      stopped = true
      if (frameWatchdog !== null) window.clearTimeout(frameWatchdog)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      session.removeEventListener('visibilitychange', onVisibilityChange)
      session.cancelAnimationFrame(frameHandle)
      await session.end().catch(() => undefined)
    },
  }
}

function createXRCanvas() {
  const existing = document.getElementById('xr-canvas')
  if (existing instanceof HTMLCanvasElement) return existing
  const canvas = document.createElement('canvas')
  canvas.id = 'xr-canvas'
  canvas.width = 1
  canvas.height = 1
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.position = 'fixed'
  canvas.style.width = '1px'
  canvas.style.height = '1px'
  canvas.style.opacity = '0'
  canvas.style.pointerEvents = 'none'
  document.body.appendChild(canvas)
  return canvas
}

function getXRCompatibleContext(canvas: HTMLCanvasElement) {
  return (canvas.getContext('webgl', { alpha: true, antialias: true }) ?? canvas.getContext('webgl2', { alpha: true, antialias: true })) as XRCompatibleContext | null
}

function getXRWebGLLayerConstructor() {
  return (window as Window & { XRWebGLLayer?: XRWebGLLayerConstructor }).XRWebGLLayer
}

async function requestARSession(xr: XRSystemLike) {
  const options: XRSessionInitLike = {
    optionalFeatures: ['local-floor', 'local', 'dom-overlay', 'hit-test'],
    ...(document.body ? { domOverlay: { root: document.body } } : {}),
  }
  try {
    return await xr.requestSession('immersive-ar', options)
  } catch (firstError) {
    try {
      return await xr.requestSession('immersive-ar', { optionalFeatures: ['local-floor', 'local', 'hit-test'] })
    } catch {
      throw firstError
    }
  }
}
