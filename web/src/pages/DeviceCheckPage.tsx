import { useEffect, useRef, useState } from 'react'
import { getCameraSupport, stopCameraStream, testCamera } from '../camera/cameraService'
import { getCurrentLocation, isGeolocationSupported, type LocationReading } from '../sensors/geolocationService'
import { isOrientationSupported, requestOrientationPermission, subscribeToOrientation, type OrientationReading } from '../sensors/orientationService'
import { isImmersiveARSupported, isWebXRSupported } from '../xr/xrService'

type CheckStatus = 'supported' | 'unsupported' | 'ok' | 'pending' | 'error'
type DeviceCheckPageProps = { onBack: () => void }

const initialOrientation: OrientationReading = { alpha: null, beta: null, gamma: null }

export function DeviceCheckPage({ onBack }: DeviceCheckPageProps) {
  const [cameraStatus, setCameraStatus] = useState<CheckStatus>(getCameraSupport())
  const [cameraMessage, setCameraMessage] = useState('Not tested')
  const [gpsStatus, setGpsStatus] = useState<CheckStatus>(isGeolocationSupported() ? 'supported' : 'unsupported')
  const [location, setLocation] = useState<LocationReading | null>(null)
  const [gpsMessage, setGpsMessage] = useState('Not tested')
  const [orientationStatus, setOrientationStatus] = useState<CheckStatus>(isOrientationSupported() ? 'supported' : 'unsupported')
  const [orientation, setOrientation] = useState(initialOrientation)
  const [orientationMessage, setOrientationMessage] = useState('Not tested')
  const [webXRStatus] = useState<CheckStatus>(isWebXRSupported() ? 'supported' : 'unsupported')
  const [immersiveARStatus, setImmersiveARStatus] = useState<CheckStatus>('pending')
  const previewRef = useRef<HTMLVideoElement>(null)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    if (!isWebXRSupported()) {
      setImmersiveARStatus('unsupported')
      return
    }

    void isImmersiveARSupported().then((supported) => {
      setImmersiveARStatus(supported ? 'supported' : 'unsupported')
    })
  }, [])

  useEffect(() => {
    if (!previewStream || !previewRef.current) return
    const video = previewRef.current
    video.srcObject = previewStream
    void video.play().catch(() => undefined)
    const timer = window.setTimeout(() => {
      stopCameraStream(previewStream)
      setPreviewStream(null)
    }, 1600)
    return () => {
      window.clearTimeout(timer)
      stopCameraStream(previewStream)
      video.srcObject = null
    }
  }, [previewStream])

  const runCameraTest = async () => {
    setCameraStatus('pending')
    setCameraMessage('Requesting camera permission…')
    try {
      const { stream } = await testCamera()
      setPreviewStream(stream)
      setCameraStatus('ok')
      setCameraMessage('Camera: OK — rear camera responded.')
    } catch (error) {
      setCameraStatus('error')
      setCameraMessage(getCameraError(error))
    }
  }

  const runGpsTest = async () => {
    setGpsStatus('pending')
    setGpsMessage('Requesting location permission…')
    try {
      setLocation(await getCurrentLocation())
      setGpsStatus('ok')
      setGpsMessage('GPS: OK')
    } catch (error) {
      setGpsStatus('error')
      setGpsMessage(error instanceof Error ? error.message : 'Could not test GPS.')
    }
  }

  const runOrientationTest = async () => {
    setOrientationStatus('pending')
    setOrientationMessage('Requesting motion permission…')
    try {
      const permission = await requestOrientationPermission()
      if (permission === 'denied') throw new Error('Motion sensor permission was denied.')
      setOrientationStatus('ok')
      setOrientationMessage('Live sensor values')
    } catch (error) {
      setOrientationStatus('error')
      setOrientationMessage(error instanceof Error ? error.message : 'Could not test orientation.')
    }
  }

  useEffect(() => {
    if (orientationStatus !== 'ok') return
    return subscribeToOrientation(setOrientation)
  }, [orientationStatus])

  return (
    <main className="device-check-page">
      <header className="diagnostic-header">
        <button className="back-button" type="button" onClick={onBack}>← Back</button>
        <p className="eyebrow">Cemetery Mapper</p>
        <h1>Device Check</h1>
        <p className="diagnostic-intro">A quick capability check for this Android browser.</p>
      </header>

      <section className="status-list" aria-label="Device capability status">
        <StatusRow label="Camera API" status={cameraStatus} detail={cameraMessage} />
        <StatusRow label="GPS" status={gpsStatus} detail={gpsMessage} />
        <StatusRow label="Orientation" status={orientationStatus} detail={orientationMessage} />
        <StatusRow label="WebXR" status={webXRStatus} />
        <StatusRow label="Immersive AR" status={immersiveARStatus} />
        <StatusRow label="Depth sensing" status="unsupported" detail="Not tested yet" />
      </section>

      <section className="test-actions" aria-label="Run device tests">
        <button className="test-button" type="button" onClick={() => void runCameraTest()} disabled={cameraStatus === 'pending'}>Test Camera</button>
        <button className="test-button" type="button" onClick={() => void runGpsTest()} disabled={gpsStatus === 'pending'}>Test GPS</button>
        <button className="test-button" type="button" onClick={() => void runOrientationTest()} disabled={orientationStatus === 'pending'}>Test Orientation</button>
      </section>

      {previewStream && (
        <div className="camera-preview-wrap">
          <video ref={previewRef} className="camera-preview" muted playsInline aria-label="Camera preview" />
          <p className="preview-note">Camera preview active briefly — stream will stop automatically.</p>
        </div>
      )}
      <DiagnosticDetails location={location} orientation={orientation} />
    </main>
  )
}

function StatusRow({ label, status, detail }: { label: string; status: CheckStatus; detail?: string }) {
  const symbol = status === 'supported' || status === 'ok' ? '✓' : status === 'pending' ? '…' : '✕'
  return (
    <div className="status-row">
      <div><strong>{label}</strong>{detail && <small>{detail}</small>}</div>
      <span className={`status-symbol status-${status}`} aria-label={status}>{symbol}</span>
    </div>
  )
}

function DiagnosticDetails({ location, orientation }: { location: LocationReading | null; orientation: OrientationReading }) {
  return (
    <section className="diagnostic-details" aria-label="Diagnostic data">
      <h2>Diagnostic data</h2>
      <dl>
        <DataItem label="Latitude" value={location ? location.latitude.toFixed(6) : '—'} />
        <DataItem label="Longitude" value={location ? location.longitude.toFixed(6) : '—'} />
        <DataItem label="Accuracy" value={location ? `${location.accuracy.toFixed(1)} m` : '—'} />
        <DataItem label="Altitude" value={location?.altitude == null ? '—' : `${location.altitude.toFixed(1)} m`} />
        <DataItem label="Heading" value={location?.heading == null ? '—' : `${location.heading.toFixed(0)}°`} />
        <DataItem label="Timestamp" value={location ? new Date(location.timestamp).toLocaleString() : '—'} />
        <DataItem label="Alpha" value={formatAngle(orientation.alpha)} />
        <DataItem label="Beta" value={formatAngle(orientation.beta)} />
        <DataItem label="Gamma" value={formatAngle(orientation.gamma)} />
      </dl>
    </section>
  )
}

function DataItem({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function formatAngle(value: number | null) {
  return value == null ? '—' : `${value.toFixed(1)}°`
}

function getCameraError(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in Chrome settings and try again.'
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No camera was found on this device.'
  return error instanceof Error ? error.message : 'Could not test the camera.'
}
