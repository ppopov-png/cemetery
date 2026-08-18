import type { Vector3 } from '../smart-scan/smartScanTypes'

type XRSessionType = 'immersive-ar'

export type XRTrackingController = {
  session: XRSessionLike
  setOnUpdate: (handler: (update: XRTrackingUpdate) => void) => void
  stop: () => Promise<void>
}

export type XRTrackingUpdate = {
  position: Vector3
  distanceFromStart: number
}

type XRReferenceSpaceLike = object

type XRViewerPoseLike = {
  transform: {
    position: Vector3
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

type XRSystemLike = {
  isSessionSupported: (sessionMode: XRSessionType) => Promise<boolean>
  requestSession: (sessionMode: XRSessionType, options?: { optionalFeatures?: string[] }) => Promise<XRSessionLike>
}

export function isWebXRSupported() {
  return typeof (navigator as Navigator & { xr?: XRSystemLike }).xr !== 'undefined'
}

export async function isImmersiveARSupported() {
  const xr = (navigator as Navigator & { xr?: XRSystemLike }).xr
  if (!xr) return false

  try {
    return await xr.isSessionSupported('immersive-ar')
  } catch {
    return false
  }
}

export async function startXRTracking(onUpdate: (update: XRTrackingUpdate) => void): Promise<XRTrackingController> {
  const xr = (navigator as Navigator & { xr?: XRSystemLike }).xr
  if (!xr) throw new Error('WebXR is not supported by this browser.')

  const session = await xr.requestSession('immersive-ar', {
    optionalFeatures: ['local-floor', 'local'],
  })

  let referenceSpace: XRReferenceSpaceLike
  try {
    referenceSpace = await session.requestReferenceSpace('local-floor')
  } catch {
    referenceSpace = await session.requestReferenceSpace('local')
  }

  let origin: Vector3 | null = null
  let updateHandler = onUpdate
  let frameHandle = 0
  let stopped = false

  const frame = (_time: number, xrFrame: XRFrameLike) => {
    if (stopped) return
    const pose = xrFrame.getViewerPose(referenceSpace)
    if (pose) {
      const position = pose.transform.position
      origin ??= { x: position.x, y: position.y, z: position.z }
      const relativePosition = {
        x: position.x - origin.x,
        y: position.y - origin.y,
        z: position.z - origin.z,
      }
      updateHandler({
        position: relativePosition,
        distanceFromStart: Math.sqrt(
          relativePosition.x ** 2 + relativePosition.y ** 2 + relativePosition.z ** 2,
        ),
      })
    }
    frameHandle = session.requestAnimationFrame(frame)
  }

  frameHandle = session.requestAnimationFrame(frame)

  return {
    session,
    setOnUpdate: (handler) => { updateHandler = handler },
    stop: async () => {
      if (stopped) return
      stopped = true
      session.cancelAnimationFrame(frameHandle)
      await session.end().catch(() => undefined)
    },
  }
}
