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
  state: XRTrackingState
  errorName?: string
  errorMessage?: string
}

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
  getViewerPose: (referenceSpace: XRReferenceSpaceLike) => XRViewerPoseLike | null
}
type XRSessionLike = EventTarget & {
  requestReferenceSpace: (type: 'local-floor' | 'local') => Promise<XRReferenceSpaceLike>
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
  let state: XRTrackingState = 'STARTING'

  const publish = (poseActive: boolean) => {
    diagnosticsHandler({ sessionActive: !stopped, referenceSpaceType, poseActive, xrFrames, trackingFrames, state })
  }

  const frame = (_time: number, xrFrame: XRFrameLike) => {
    if (stopped) return
    xrFrames += 1
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
    frameHandle = session.requestAnimationFrame(frame)
  }

  session.addEventListener('end', () => {
    if (stopped) return
    stopped = true
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
      session.cancelAnimationFrame(frameHandle)
      await session.end().catch(() => undefined)
    },
  }
}

async function requestARSession(xr: XRSystemLike) {
  const options: XRSessionInitLike = {
    optionalFeatures: ['local-floor', 'dom-overlay', 'hit-test'],
    ...(document.body ? { domOverlay: { root: document.body } } : {}),
  }
  try {
    return await xr.requestSession('immersive-ar', options)
  } catch (firstError) {
    try {
      return await xr.requestSession('immersive-ar', { optionalFeatures: ['local-floor', 'hit-test'] })
    } catch {
      throw firstError
    }
  }
}
