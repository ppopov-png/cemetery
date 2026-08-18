import { openRearCamera, stopCameraStream } from '../camera/cameraService'
import { getCurrentLocation, isGeolocationSupported, type LocationReading } from '../sensors/geolocationService'
import { isOrientationSupported, requestOrientationPermission } from '../sensors/orientationService'
import { SpatialProviderManager } from '../spatial/spatialProviderManager'
import type { SpatialDiagnostics, SpatialProvider } from '../spatial/spatialTypes'
import type { CapabilityStatus, SmartScanCapabilities } from './smartScanTypes'

export type PrepareStep = 'camera' | 'gps' | 'orientation' | 'webxr' | 'ar-tracking'
export type PrepareProgress = { step: PrepareStep; status: CapabilityStatus; message?: string }
export type PreparedSmartScan = {
  capabilities: SmartScanCapabilities
  cameraStream: MediaStream | null
  spatialProvider: SpatialProvider
  spatialDiagnostics: SpatialDiagnostics | null
}

export async function prepareSmartScan(onProgress: (progress: PrepareProgress) => void): Promise<PreparedSmartScan> {
  const capabilities = createInitialCapabilities()
  const manager = new SpatialProviderManager()
  let location: LocationReading | null = null

  onProgress({ step: 'webxr', status: 'checking' })
  let selection
  try {
    selection = await manager.start({ requestCamera: async () => (await openRearCamera()).stream })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'No spatial provider could be started.')
  }

  const provider = selection.provider
  const isXR = provider.mode === 'xr-high' || provider.mode === 'xr-standard'
  capabilities.webxr = isXR ? 'ready' : 'limited'
  capabilities.immersiveAr = isXR ? 'ready' : 'limited'
  capabilities.camera = selection.cameraStream || isXR ? 'ready' : 'unavailable'
  capabilities.spatialMode = isXR ? 'ar' : 'limited'
  capabilities.trackingState = provider.getTrackingState()
  onProgress({ step: 'webxr', status: isXR ? 'ready' : 'limited', message: selection.reason })
  onProgress({ step: 'ar-tracking', status: isXR ? 'ready' : 'limited', message: selection.reason })
  onProgress({ step: 'camera', status: capabilities.camera, message: selection.cameraStream ? 'Camera stream ready.' : isXR ? 'Using provider camera passthrough.' : 'Camera unavailable.' })

  onProgress({ step: 'gps', status: 'checking' })
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

  capabilities.sensorData.location = location
  return { capabilities, cameraStream: selection.cameraStream, spatialProvider: provider, spatialDiagnostics: null }
}

export function createInitialCapabilities(): SmartScanCapabilities {
  return {
    camera: 'checking', gps: 'checking', orientation: 'checking', webxr: 'checking', immersiveAr: 'checking', depth: 'unknown', spatialMode: 'limited',
    trackingState: 'LIMITED', referenceSpaceType: null, xrSessionActive: false, xrPoseActive: false, xrFrames: 0, trackingFrames: 0, lastXRFrameAt: null, webglStatus: 'ERROR', xrCompatibleGL: false, baseLayerActive: false, xrVisibility: 'unknown', xrFrameLoopError: null, xrError: null,
    sensorData: { location: null, orientation: { alpha: null, beta: null, gamma: null }, position: null, distanceFromStart: null },
  }
}

function isPermissionDenied(error: unknown) {
  return error instanceof DOMException && error.name === 'NotAllowedError' || error instanceof Error && error.message.toLowerCase().includes('permission')
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function cleanupPreparedSmartScan(prepared: PreparedSmartScan) {
  await prepared.spatialProvider.stop()
  if (prepared.cameraStream && prepared.spatialProvider.mode === 'sensor-limited') stopCameraStream(prepared.cameraStream)
}
