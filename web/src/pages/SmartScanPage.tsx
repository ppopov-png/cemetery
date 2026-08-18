import { useEffect, useRef, useState } from 'react'
import { stopCameraStream } from '../camera/cameraService'
import { subscribeToOrientation, type OrientationReading } from '../sensors/orientationService'
import type { PreparedSmartScan } from '../smart-scan/prepareSmartScan'
import type { SpatialDiagnostics } from '../spatial/spatialTypes'
import type { SmartScanCapabilities, Vector3 } from '../smart-scan/smartScanTypes'

type SmartScanPageProps = {
  prepared: PreparedSmartScan
  onExit: () => void
}

export function SmartScanPage({ prepared, onExit }: SmartScanPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [capabilities, setCapabilities] = useState<SmartScanCapabilities>(prepared.capabilities)
  const [orientation, setOrientation] = useState<OrientationReading>(prepared.capabilities.sensorData.orientation)
  const [position, setPosition] = useState<Vector3 | null>(null)
  const [distance, setDistance] = useState<number | null>(null)
  const [spatialDiagnostics, setSpatialDiagnostics] = useState<SpatialDiagnostics | null>(prepared.spatialDiagnostics)

  useEffect(() => {
    const video = videoRef.current
    if (video && prepared.cameraStream) {
      video.srcObject = prepared.cameraStream
      void video.play().catch(() => undefined)
    }

    const unsubscribeOrientation = subscribeToOrientation(setOrientation)
    const initialPose = prepared.spatialProvider.getPose()
    if (initialPose) {
      setPosition(initialPose.position)
      setDistance(Math.sqrt(initialPose.position.x ** 2 + initialPose.position.y ** 2 + initialPose.position.z ** 2))
    }
    const unsubscribePose = prepared.spatialProvider.subscribePose((pose) => {
      setPosition(pose?.position ?? null)
      setDistance(pose ? Math.sqrt(pose.position.x ** 2 + pose.position.y ** 2 + pose.position.z ** 2) : null)
    })
    const unsubscribeDiagnostics = prepared.spatialProvider.subscribeDiagnostics((diagnostics) => updateSpatialDiagnostics(diagnostics))

    return () => {
      unsubscribeOrientation()
      unsubscribePose()
      unsubscribeDiagnostics()
      if (video) video.srcObject = null
      void prepared.spatialProvider.stop()
      if (prepared.cameraStream && prepared.spatialProvider.mode === 'sensor-limited') stopCameraStream(prepared.cameraStream)
    }
  }, [prepared])

  const updateSpatialDiagnostics = (diagnostics: SpatialDiagnostics) => {
    setSpatialDiagnostics(diagnostics)
    setCapabilities((current) => ({
      ...current,
      trackingState: diagnostics.trackingState,
      spatialMode: diagnostics.mode.startsWith('xr-') && diagnostics.trackingState === 'ACTIVE' ? 'ar' : 'limited',
      referenceSpaceType: diagnostics.referenceSpaceType ?? null,
      xrSessionActive: diagnostics.xrSessionActive ?? false,
      xrPoseActive: diagnostics.xrPoseActive ?? false,
      xrFrames: diagnostics.xrFrames ?? 0,
      trackingFrames: diagnostics.trackingFrames ?? 0,
      lastXRFrameAt: diagnostics.lastXRFrameAt ?? null,
      webglStatus: diagnostics.webglStatus ?? 'ERROR',
      xrCompatibleGL: diagnostics.xrCompatibleGL ?? false,
      baseLayerActive: diagnostics.baseLayerActive ?? false,
      xrVisibility: (diagnostics.xrVisibility as SmartScanCapabilities['xrVisibility']) ?? 'unknown',
      xrFrameLoopError: diagnostics.xrFrameLoopError ?? null,
    }))
  }

  useEffect(() => {
    setCapabilities((current) => ({
      ...current,
      sensorData: { ...current.sensorData, orientation, position, distanceFromStart: distance },
    }))
  }, [orientation, position, distance])

  const trackingLabel = spatialDiagnostics?.mode === 'vision' ? 'VISION' : capabilities.trackingState
  const gpsText = capabilities.sensorData.location
    ? `${capabilities.sensorData.location.accuracy.toFixed(1)} m`
    : 'Unavailable'
  const metricTracking = spatialDiagnostics?.mode.startsWith('xr-') && capabilities.trackingState === 'ACTIVE'

  return (
    <main className="smart-scan-page">
      {prepared.cameraStream && <video ref={videoRef} className="smart-scan-camera" autoPlay muted playsInline aria-label="Smart Scan camera" />}
      <div className="smart-scan-shade" />
      <div className="smart-scan-hud">
        <header className="scan-topbar">
          <div><p className="scan-kicker">Cemetery Mapper</p><h1>Smart Scan</h1></div>
          <span className={`spatial-pill spatial-${capabilities.trackingState.toLowerCase()}`}>Spatial tracking: {trackingLabel}</span>
        </header>
        <section className="scan-diagnostics" aria-label="Smart Scan status">
          <span>GPS: {gpsText}</span>
          <span>GPS quality: {getGpsQuality(capabilities.sensorData.location?.accuracy)}</span>
          <span>Heading: {formatHeading(capabilities.sensorData.location?.heading)}</span>
          <span>Orientation: {capabilities.orientation === 'ready' ? 'OK' : 'LIMITED'}</span>
          <span>Tracking: {trackingLabel}</span>
        </section>
        <div className="scan-reticle" aria-hidden="true">+</div>
        {metricTracking && <PositionHud position={position} distance={distance} />}
        {spatialDiagnostics?.mode === 'vision' && <VisionTrajectoryHud position={spatialDiagnostics.relativePosition} />}
        {spatialDiagnostics?.mode === 'vision' && <VisionTrackingHint state={spatialDiagnostics.trackingState} />}
        <SpatialDiagnosticsPanel capabilities={capabilities} diagnostics={spatialDiagnostics} />
        <footer className="scan-footer">
          <p>Point the camera at an object</p>
          <button className="finish-button" type="button" onClick={onExit}>Finish</button>
        </footer>
      </div>
    </main>
  )
}

function SpatialDiagnosticsPanel({ capabilities, diagnostics }: { capabilities: SmartScanCapabilities; diagnostics: SpatialDiagnostics | null }) {
  if (diagnostics?.mode === 'vision') {
    return (
      <div className="xr-diagnostics vision-diagnostics">
        <span>Provider: Vision</span>
        <span>Tracking: {diagnostics.trackingState}</span>
        <span>Scale: {diagnostics.scaleStatus ?? 'UNSCALED'}</span>
        <span>Accuracy: {diagnostics.accuracy?.level.toUpperCase() ?? 'UNKNOWN'}</span>
        <span>Vision FPS: {diagnostics.visionFps?.toFixed(1) ?? '—'}</span>
        <span>Features: {diagnostics.featureCount ?? 0}</span>
        <span>Matches/Inliers: {diagnostics.matchedFeatureCount ?? 0} / {Math.round((diagnostics.inlierRatio ?? 0) * (diagnostics.matchedFeatureCount ?? 0))}</span>
        <span>Inlier ratio: {((diagnostics.inlierRatio ?? 0) * 100).toFixed(0)}%</span>
        <span>Confidence: {((diagnostics.trackingConfidence ?? 0) * 100).toFixed(0)}%</span>
        <span>Parallax: {diagnostics.parallaxPx?.toFixed(1) ?? '—'} px</span>
        <span>Blur/Exposure: {diagnostics.blurScore?.toFixed(0) ?? '—'} / {diagnostics.exposureMean?.toFixed(0) ?? '—'}</span>
        <span>Intrinsics: {diagnostics.intrinsics ? `${Math.round(diagnostics.intrinsics.fx)} px @ ${diagnostics.intrinsics.width}×${diagnostics.intrinsics.height}` : '—'}</span>
        <span>Processing: {diagnostics.processingMs?.toFixed(1) ?? '—'} ms</span>
        <span>GPS quality: {getGpsQuality(capabilities.sensorData.location?.accuracy)}</span>
      </div>
    )
  }
  return (
    <div className="xr-diagnostics">
      <span>Provider: {diagnostics?.provider ?? '—'}</span>
      <span>Mode: {diagnostics?.mode ?? '—'}</span>
      <span>XR session: {capabilities.xrSessionActive ? 'ACTIVE' : 'INACTIVE'}</span>
      <span>Reference space: {capabilities.referenceSpaceType ?? '—'}</span>
      <span>XR pose: {capabilities.xrPoseActive ? 'ACTIVE' : 'NULL'}</span>
      <span>WebGL: {capabilities.webglStatus}</span>
      <span>XR compatible GL: {capabilities.xrCompatibleGL ? 'YES' : 'NO'}</span>
      <span>Base layer: {capabilities.baseLayerActive ? 'ACTIVE' : 'NULL'}</span>
      <span>XR visibility: {capabilities.xrVisibility}</span>
      <span>XR frames: {capabilities.xrFrames}</span>
      <span>Tracking frames: {capabilities.trackingFrames}</span>
      <span>Last XR frame: {formatTimestamp(capabilities.lastXRFrameAt)}</span>
      {diagnostics?.featureCount !== undefined && <span>Features: {diagnostics.featureCount} / Matches: {diagnostics.matchedFeatureCount ?? 0}</span>}
      {diagnostics?.visionFps !== undefined && <span>Vision FPS: {diagnostics.visionFps.toFixed(1)}</span>}
      {diagnostics?.scaleStatus && <span>Scale: {diagnostics.scaleStatus}</span>}
      {capabilities.xrFrameLoopError && <span>{capabilities.xrFrameLoopError}</span>}
      {capabilities.xrError && <span>{capabilities.xrError.name}: {capabilities.xrError.message}</span>}
    </div>
  )
}

function VisionTrajectoryHud({ position }: { position?: { x: number; y: number; z: number } }) {
  return (
    <div className="position-hud vision-position-hud">
      <strong>Relative trajectory</strong>
      <span>VX: {formatUnscaled(position?.x)}</span>
      <span>VY: {formatUnscaled(position?.y)}</span>
      <span>VZ: {formatUnscaled(position?.z)}</span>
      <span>Scale: UNSCALED</span>
    </div>
  )
}

function VisionTrackingHint({ state }: { state: SpatialDiagnostics['trackingState'] }) {
  const hint = state === 'WEAK' ? 'Move the phone more slowly' : state === 'LOST' ? 'Point at a detailed, well-lit surface' : state === 'RECOVERING' || state === 'INITIALIZING' ? 'Looking for visual features…' : null
  return hint ? <p className="vision-tracking-hint">{hint}</p> : null
}

function PositionHud({ position, distance }: { position: Vector3 | null; distance: number | null }) {
  return (
    <div className="position-hud">
      <strong>Position</strong>
      <span>X: {formatMeters(position?.x)}</span>
      <span>Y: {formatMeters(position?.y)}</span>
      <span>Z: {formatMeters(position?.z)}</span>
      <span>From start: {distance == null ? '—' : `${distance.toFixed(2)} m`}</span>
    </div>
  )
}

function formatMeters(value: number | undefined) {
  return value == null ? 'Unavailable' : `${value.toFixed(2)} m`
}

function formatUnscaled(value: number | undefined) {
  return value == null ? '—' : value.toFixed(4)
}

function getGpsQuality(accuracy: number | undefined) {
  if (accuracy == null) return 'UNAVAILABLE'
  if (accuracy <= 10) return 'GOOD'
  if (accuracy <= 30) return 'POOR'
  return 'UNUSABLE'
}

function formatHeading(value: number | null | undefined) {
  return value == null ? 'Unavailable' : `${value.toFixed(0)}°`
}

function formatTimestamp(value: number | null) {
  return value == null ? '—' : new Date(value).toLocaleTimeString()
}
