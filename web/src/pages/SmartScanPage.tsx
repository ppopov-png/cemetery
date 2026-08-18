import { useEffect, useRef, useState } from 'react'
import { stopCameraStream } from '../camera/cameraService'
import { subscribeToOrientation, type OrientationReading } from '../sensors/orientationService'
import type { PreparedSmartScan } from '../smart-scan/prepareSmartScan'
import type { SmartScanCapabilities, Vector3 } from '../smart-scan/smartScanTypes'
import type { XRTrackingDiagnostics } from '../xr/xrService'

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

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = prepared.cameraStream
    void video.play().catch(() => undefined)

    const unsubscribeOrientation = subscribeToOrientation(setOrientation)
    prepared.xrTracking?.setOnUpdate(({ position: nextPosition, distanceFromStart }) => {
      setPosition(nextPosition)
      setDistance(distanceFromStart)
    })
    prepared.xrTracking?.setOnDiagnostics((diagnostics) => updateXRDiagnostics(diagnostics))

    return () => {
      unsubscribeOrientation()
      video.srcObject = null
      stopCameraStream(prepared.cameraStream)
      void prepared.xrTracking?.stop()
    }
  }, [prepared])

  const updateXRDiagnostics = (diagnostics: XRTrackingDiagnostics) => {
    setCapabilities((current) => ({
      ...current,
      trackingState: diagnostics.state,
      spatialMode: diagnostics.state === 'ACTIVE' ? 'ar' : 'limited',
      referenceSpaceType: diagnostics.referenceSpaceType,
      xrSessionActive: diagnostics.sessionActive,
      xrPoseActive: diagnostics.poseActive,
      xrFrames: diagnostics.xrFrames,
      trackingFrames: diagnostics.trackingFrames,
    }))
  }

  useEffect(() => {
    setCapabilities((current) => ({
      ...current,
      sensorData: { ...current.sensorData, orientation, position, distanceFromStart: distance },
    }))
  }, [orientation, position, distance])

  const trackingLabel = capabilities.trackingState
  const gpsText = capabilities.sensorData.location
    ? `${capabilities.sensorData.location.accuracy.toFixed(1)} m`
    : 'Unavailable'

  return (
    <main className="smart-scan-page">
      <video ref={videoRef} className="smart-scan-camera" autoPlay muted playsInline aria-label="Smart Scan camera" />
      <div className="smart-scan-shade" />
      <div className="smart-scan-hud">
        <header className="scan-topbar">
          <div><p className="scan-kicker">Cemetery Mapper</p><h1>Smart Scan</h1></div>
          <span className={`spatial-pill spatial-${capabilities.trackingState.toLowerCase()}`}>Spatial tracking: {trackingLabel}</span>
        </header>
        <section className="scan-diagnostics" aria-label="Smart Scan status">
          <span>GPS: {gpsText}</span>
          <span>Heading: {formatHeading(capabilities.sensorData.location?.heading)}</span>
          <span>Orientation: {capabilities.orientation === 'ready' ? 'OK' : 'LIMITED'}</span>
          <span>Tracking: {trackingLabel}</span>
        </section>
        <div className="scan-reticle" aria-hidden="true">+</div>
        {capabilities.trackingState === 'ACTIVE' && <PositionHud position={position} distance={distance} />}
        <XRDiagnostics capabilities={capabilities} />
        <footer className="scan-footer">
          <p>Point the camera at an object</p>
          <button className="finish-button" type="button" onClick={onExit}>Finish</button>
        </footer>
      </div>
    </main>
  )
}

function XRDiagnostics({ capabilities }: { capabilities: SmartScanCapabilities }) {
  return (
    <div className="xr-diagnostics">
      <span>XR session: {capabilities.xrSessionActive ? 'ACTIVE' : 'INACTIVE'}</span>
      <span>Reference space: {capabilities.referenceSpaceType ?? '—'}</span>
      <span>XR pose: {capabilities.xrPoseActive ? 'ACTIVE' : 'NULL'}</span>
      <span>XR frames: {capabilities.xrFrames}</span>
      <span>Tracking frames: {capabilities.trackingFrames}</span>
      {capabilities.xrError && <span>{capabilities.xrError.name}: {capabilities.xrError.message}</span>}
    </div>
  )
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

function formatHeading(value: number | null | undefined) {
  return value == null ? 'Unavailable' : `${value.toFixed(0)}°`
}
