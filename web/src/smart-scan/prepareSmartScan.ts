import { openRearCamera, stopCameraStream } from '../camera/cameraService'
import { getCurrentLocation, isGeolocationSupported, type LocationReading } from '../sensors/geolocationService'
import { isOrientationSupported, requestOrientationPermission } from '../sensors/orientationService'
import { isImmersiveARSupported, isWebXRSupported, startXRTracking, type XRTrackingController } from '../xr/xrService'
import type { CapabilityStatus, SmartScanCapabilities } from './smartScanTypes'

export type PrepareStep = 'camera' | 'gps' | 'orientation' | 'webxr' | 'ar-tracking'
export type PrepareProgress = {
  step: PrepareStep
  status: CapabilityStatus
  message?: string
}

export type PreparedSmartScan = {
  capabilities: SmartScanCapabilities
  cameraStream: MediaStream
  xrTracking: XRTrackingController | null
}

export async function prepareSmartScan(onProgress: (progress: PrepareProgress) => void): Promise<PreparedSmartScan> {
  const capabilities = createInitialCapabilities()
  let cameraStream: MediaStream
  let xrTracking: XRTrackingController | null = null

  onProgress({ step: 'camera', status: 'checking' })
  try {
    cameraStream = (await openRearCamera()).stream
    capabilities.camera = 'ready'
    onProgress({ step: 'camera', status: 'ready' })
  } catch (error) {
    const permissionDenied = isPermissionDenied(error)
    capabilities.camera = permissionDenied ? 'permission-denied' : 'unavailable'
    onProgress({
      step: 'camera',
      status: capabilities.camera,
      message: permissionDenied
        ? 'Camera permission was denied. Allow camera access in Chrome settings.'
        : getErrorMessage(error, 'The rear camera is unavailable.'),
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

  onProgress({ step: 'webxr', status: 'checking' })
  if (!isWebXRSupported()) {
    capabilities.webxr = 'limited'
    capabilities.immersiveAr = 'limited'
    onProgress({ step: 'webxr', status: 'limited', message: 'WebXR is not available. Limited mode will be used.' })
  } else {
    capabilities.webxr = 'ready'
    const immersiveAr = await isImmersiveARSupported()
    capabilities.immersiveAr = immersiveAr ? 'ready' : 'limited'
    onProgress({ step: 'webxr', status: 'ready' })
    if (!immersiveAr) onProgress({ step: 'ar-tracking', status: 'limited', message: 'Immersive AR is not supported.' })
  }

  if (capabilities.immersiveAr === 'ready') {
    onProgress({ step: 'ar-tracking', status: 'checking' })
    try {
      xrTracking = await startXRTracking(() => undefined)
      onProgress({ step: 'ar-tracking', status: 'ready' })
    } catch (error) {
      capabilities.immersiveAr = 'limited'
      onProgress({ step: 'ar-tracking', status: 'limited', message: getErrorMessage(error, 'AR tracking could not start.') })
    }
  }

  capabilities.spatialMode = xrTracking ? 'ar' : 'limited'
  capabilities.sensorData.location = location
  return { capabilities, cameraStream, xrTracking }
}

export function createInitialCapabilities(): SmartScanCapabilities {
  return {
    camera: 'checking',
    gps: 'checking',
    orientation: 'checking',
    webxr: 'checking',
    immersiveAr: 'checking',
    depth: 'unknown',
    spatialMode: 'limited',
    sensorData: {
      location: null,
      orientation: { alpha: null, beta: null, gamma: null },
      position: null,
      distanceFromStart: null,
    },
  }
}

function isPermissionDenied(error: unknown) {
  return error instanceof DOMException && error.name === 'NotAllowedError'
    || error instanceof Error && error.message.toLowerCase().includes('permission')
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function cleanupPreparedSmartScan(prepared: PreparedSmartScan) {
  stopCameraStream(prepared.cameraStream)
  void prepared.xrTracking?.stop()
}
