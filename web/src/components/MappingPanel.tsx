import { useEffect, useRef, useState, type RefObject } from 'react'
import { getRemoteScanApiUrl } from '../api/remoteScanService'
import { sendMappingFrame, startMapping, stopMapping, type MappingTelemetry } from '../api/mappingService'
import { SparseMapViewer } from './SparseMapViewer'

export function MappingPanel({ videoRef, onClose }: { videoRef: RefObject<HTMLVideoElement | null>; onClose: () => void }) {
  const [telemetry, setTelemetry] = useState<MappingTelemetry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const sessionRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  const apiUrl = getRemoteScanApiUrl()

  const stop = async () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (sessionRef.current) await stopMapping(apiUrl, sessionRef.current).catch(() => undefined)
    setRunning(false)
  }

  const capture = async () => {
    const video = videoRef.current
    if (!video || !sessionRef.current || busyRef.current || video.readyState < 2) return
    busyRef.current = true
    const canvas = document.createElement('canvas')
    const scale = Math.min(960 / Math.max(video.videoWidth, video.videoHeight), 1)
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) { busyRef.current = false; return }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.68))
    if (blob) {
      try { setTelemetry(await sendMappingFrame(apiUrl, sessionRef.current, blob)) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'PC reconstruction failed') }
    }
    busyRef.current = false
  }

  const start = async () => {
    try {
      const result = await startMapping(apiUrl)
      sessionRef.current = result.sessionId
      setRunning(true)
      timerRef.current = window.setInterval(() => void capture(), 1100)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PC mapping failed to start') }
  }

  useEffect(() => { void start(); return () => { if (timerRef.current) window.clearInterval(timerRef.current) } }, [])

  return <section className="mapping-panel">
    <header><div><p className="scan-kicker">LIVE WORLD MAP</p><h2>Живая 3D-карта</h2></div><button className="remote-close" type="button" onClick={() => { void stop(); onClose() }}>Close</button></header>
    {!running && !error && <p className="remote-note">Подключение к компьютеру…</p>}
    {running && <><SparseMapViewer points={telemetry?.points ?? []} /><div className="mapping-stats"><strong>Frames {telemetry?.frame ?? 0}</strong><span>Reconstructed voxels {telemetry?.mapPoints ?? 0}</span><span>Scale RELATIVE · drag to orbit · pinch to zoom</span></div><button className="remote-action" type="button" onClick={() => void stop()}>STOP MAPPING</button></>}
    {error && <p className="remote-error">{error}</p>}
  </section>
}
