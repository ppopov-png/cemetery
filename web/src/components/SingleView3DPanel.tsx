import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { OnnxDepthEstimator } from '../depth/OnnxDepthEstimator'
import { TemporalDepthFilter } from '../depth/TemporalDepthFilter'
import { depthToPointCloud } from '../depth/DepthToPointCloud'
import type { DepthFrame, PointCloudData } from '../depth/depthTypes'

type ViewMode = 'POINT_CLOUD' | 'DEPTH_MESH'

export function SingleView3DPanel({ videoRef, onClose }: { videoRef: RefObject<HTMLVideoElement | null>; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const estimatorRef = useRef(new OnnxDepthEstimator()); const filterRef = useRef(new TemporalDepthFilter())
  const [status, setStatus] = useState('Loading depth model…'); const [frame, setFrame] = useState<DepthFrame | null>(null); const [mode, setMode] = useState<ViewMode>('POINT_CLOUD'); const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const run = async () => { try { await estimatorRef.current.load(); if (cancelled) return; setStatus(`Ready · ${estimatorRef.current.getBackend().toUpperCase()}`); const video = videoRef.current; if (!video) throw new Error('Camera is unavailable.'); await waitForVideo(video); const next = filterRef.current.apply(await estimatorRef.current.estimate(video)); if (!cancelled) { setFrame(next); setStatus(`3D built from one frame · ${next.inferenceMs.toFixed(0)} ms`) } } catch (cause) { if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Depth estimation failed.'); setStatus('Depth model unavailable') } } }
    void run(); return () => { cancelled = true; filterRef.current.reset() }
  }, [videoRef])
  useEffect(() => { if (!frame || !canvasRef.current) return; const cloud = depthToPointCloud(frame, videoRef.current!, 4); return renderScene(canvasRef.current, cloud, mode) }, [frame, mode, videoRef])
  return <section className="remote-scan-panel single-view-3d-panel"><header><div><p className="scan-kicker">SINGLE-VIEW 3D</p><h2>Approximate object model</h2></div><button className="remote-close" type="button" onClick={onClose}>Close</button></header><p className="remote-note">Один кадр → относительная глубина → цветное облако точек. Пользователю не нужно обходить объект.</p><div className="single-view-status">{status}</div>{error && <p className="remote-error">{error}</p>}<canvas ref={canvasRef} className="single-view-3d-canvas" aria-label="Approximate 3D reconstruction" />{frame && <div className="single-view-controls"><button type="button" onClick={() => setMode('POINT_CLOUD')} aria-pressed={mode === 'POINT_CLOUD'}>Point cloud</button><button type="button" onClick={() => setMode('DEPTH_MESH')} aria-pressed={mode === 'DEPTH_MESH'}>Depth mesh</button><span>Relative scale · {frame.width}×{frame.height}</span></div>}<p className="remote-note">Depth Anything V2 Small · scale is relative, not measured in metres.</p></section>
}

async function waitForVideo(video: HTMLVideoElement): Promise<void> { if (video.readyState >= 2 && video.videoWidth > 0) return; await new Promise<void>((resolve, reject) => { const timer = window.setTimeout(() => reject(new Error('Camera frame is not ready.')), 5000); video.addEventListener('loadeddata', () => { window.clearTimeout(timer); resolve() }, { once: true }) }) }

function renderScene(canvas: HTMLCanvasElement, cloud: PointCloudData, mode: ViewMode): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); const scene = new THREE.Scene(); scene.background = new THREE.Color('#101615'); const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 20); camera.position.z = 2.1
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(cloud.colors, 3));
  let object: THREE.Object3D
  if (mode === 'DEPTH_MESH') { const indices: number[] = []; for (let y = 0; y < cloud.height - 1; y += 1) for (let x = 0; x < cloud.width - 1; x += 1) { const a = y * cloud.width + x; indices.push(a, a + 1, a + cloud.width, a + 1, a + cloud.width + 1, a + cloud.width) }; geometry.setIndex(indices); geometry.computeVertexNormals(); object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, wireframe: false })) } else object = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.018, vertexColors: true, sizeAttenuation: true }))
  scene.add(object)
  const resize = () => { const width = canvas.clientWidth || 320; const height = canvas.clientHeight || 320; renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix() }; resize(); const onResize = () => resize(); window.addEventListener('resize', onResize); let animation = 0; const tick = () => { object.rotation.y += 0.002; renderer.render(scene, camera); animation = requestAnimationFrame(tick) }; tick()
  return () => { cancelAnimationFrame(animation); window.removeEventListener('resize', onResize); geometry.dispose(); const material = (object as THREE.Mesh | THREE.Points).material as THREE.Material; material.dispose(); renderer.dispose() }
}
