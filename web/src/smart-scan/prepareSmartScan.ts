import { openRearCamera, stopCameraStream } from '../camera/cameraService'
import { getCurrentLocation, isGeolocationSupported, type LocationReading } from '../sensors/geolocationService'
import { isOrientationSupported, requestOrientationPermission } from '../sensors/orientationService'
import { isImmersiveARSupported, isWebXRSupported, startXRTracking, type XRTrackingController, type XRTrackingDiagnostics } from '../xr/xrService'
import type { CapabilityStatus, SmartScanCapabilities } from './smartScanTypes'

export type PrepareStep = 'camera' | 'gps' | 'orientation' | 'webxr' | 'ar-tracking'
export type PrepareProgress = { step: PrepareStep; status: CapabilityStatus; message?: string }
export type PreparedSmartScan = {
  capabilities: SmartScanCapabilities
  cameraStream: MediaStream
  xrTracking: XRTrackingController | null
}

export async function prepareSmartScan(
  onProgress: (progress: PrepareProgress) => void,
  onXRDiagnostics?: (diagnostics: XRTrackingDiagnostics) => void,
): Promise<PreparedSmartScan> {
  const capabilities = createInitialCapabilities()
  let cameraStream: MediaStream | null = null
  let xrTracking: XRTrackingController | null = null

  // XR starts first so requestSession remains inside the original Start button gesture.
  onProgress({ step: 'webxr', status: 'checking' })
  if (!isWebXRSupported()) {
    capabilities.webxr = 'limited'
    capabilities.immersiveAr = 'limited'
    onProgress({ step: 'webxr', status: 'limited', message: 'WebXR is not available. Limited mode will be used.' })
    onProgress({ step: 'ar-tracking', status: 'limited', message: 'AR tracking is unavailable.' })
  } else {
    try {
      xrTracking = await startXRTracking(() => undefined, onXRDiagnostics ?? (() => undefined))
      capabilities.webxr = 'ready'
      capabilities.immersiveAr = 'ready'
      onProgress({ step: 'webxr', status: 'ready' })
      onProgress({ step: 'ar-tracking', status: 'ready', message: 'Session and reference space created; waiting for pose.' })
    } catch (error) {
      const immersiveArCapability = await isImmersiveARSupported()
      capabilities.webxr = 'ready'
      capabilities.immersiveAr = immersiveArCapability ? 'ready' : 'limited'
      capabilities.xrError = getXRError(error)
      onProgress({ step: 'webxr', status: immersiveArCapability ? 'ready' : 'limited', message: getXRMessage(error) })
      onProgress({ step: 'ar-tracking', status: 'limited', message: 'AR tracking is unavailable. Smart Scan will use limited mode.' })
    }
  }

  onProgress({ step: 'camera', status: 'checking' })
  try {
    cameraStream = (await openRearCamera()).stream
    capabilities.camera = 'ready'
    onProgress({ step: 'camera', status: 'ready' })
  } catch (error) {
    await xrTracking?.stop()
    const permissionDenied = isPermissionDenied(error)
    capabilities.camera = permissionDenied ? 'permission-denied' : 'unavailable'
    onProgress({
      step: 'camera',
      status: capabilities.camera,
      message: permissionDenied ? 'Camera permission was denied. Allow camera access in Chrome settings.' : getErrorMessage(error, 'The rear camera is unavailable.'),
    })
    throw new Error('Smart Scan cannot start without camera access.')
  }

  onProgress({ step: 'gps', status: 'checking' })
  let location: LocationReading | null = null
  if (!isGeolocationSupported()) {
    capabilities.gps = 'unavailable'
    onProgress({ step: 'gps', status: 'unavailable', message: 'Geolocation is not available.' })
  } else {
    try {
      location = await getCurrentLocation()
      capabilities.gps = 'ready'
      onProgress({ step: 'gps', status: 'ready' })
    } catch (error) {
      capabilities.gps = isPermissionDenied(error) ? 'permission-denied' : 'limited'
      onProgress({ step: 'gps', status: capabilities.gps, message: getErrorMessage(error, 'GPS is unavailable.') })
    }
  }

  onProgress({ step: 'orientation', status: 'checking' })
  if (!isOrientationSupported()) {
    capabilities.orientation = 'unavailable'
    onProgress({ step: 'orientation', status: 'unavailable', message: 'Motion sensors are not available.' })
  } else {
    try {
      const permission = await requestOrientationPermission()
      if (permission === 'denied') throw new Error('Motion sensor permission was denied.')
      capabilities.orientation = 'ready'
      onProgress({ step: 'orientation', status: 'ready' })
    } catch (error) {
      capabilities.orientation = isPermissionDenied(error) ? 'permission-denied' : 'limited'
      onProgress({ step: 'orientation', status: capabilities.orientation, message: getErrorMessage(error, 'Orientation is unavailable.') })
    }
  }

  capabilities.spatialMode = 'limited'
  capabilities.sensorData.location = location
  return { capabilities, cameraStream: cameraStream!, xrTracking }
}

export function createInitialCapabilities(): SmartScanCapabilities {
  return {
    camera: 'checking', gps: 'checking', orientation: 'checking', webxr: 'checking', immersiveAr: 'checking', depth: 'unknown', spatialMode: 'limited',
    trackingState: 'LIMITED', referenceSpaceType: null, xrSessionActive: false, xrPoseActive: false, xrFrames: 0, trackingFrames: 0, xrError: null,
    sensorData: { location: null, orientation: { alpha: null, beta: null, gamma: null }, position: null, distanceFromStart: null },
  }
}

function isPermissionDenied(error: unknown) {
  return error instanceof DOMException && error.name === 'NotAllowedError' || error instanceof Error && error.message.toLowerCase().includes('permission')
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function getXRMessage(error: unknown) {
  if (error instanceof DOMException) return `${error.name}: ${error.message || 'AR session could not start.'}`
  return getErrorMessage(error, 'AR session could not start.')
}

function getXRError(error: unknown) {
  return error instanceof DOMException
    ? { name: error.name, message: error.message || 'AR session could not start.' }
    : { name: 'Error', message: getErrorMessage(error, 'AR session could not start.') }
}

export function cleanupPreparedSmartScan(prepared: PreparedSmartScan) {
  stopCameraStream(prepared.cameraStream)
  void prepared.xrTracking?.stop()
}
