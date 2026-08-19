import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function SparseMapViewer({ points }: { points: [number, number, number][] }) {
  const host = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const pointsRef = useRef<THREE.Points | null>(null)
  useEffect(() => {
    if (!host.current) return
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#050807'); sceneRef.current = scene
    const camera = new THREE.PerspectiveCamera(55, 1, .001, 100); camera.position.set(0, 0, 2)
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(host.current.clientWidth, 250); host.current.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true
    const animate = () => { controls.update(); renderer.render(scene, camera) }; renderer.setAnimationLoop(animate)
    const resize = () => { if (!host.current) return; camera.aspect = host.current.clientWidth / 250; camera.updateProjectionMatrix(); renderer.setSize(host.current.clientWidth, 250) }
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); renderer.setAnimationLoop(null); renderer.dispose(); controls.dispose(); sceneRef.current = null; host.current?.removeChild(renderer.domElement) }
  }, [])
  useEffect(() => { const scene = sceneRef.current; if (!scene) return; if (pointsRef.current) scene.remove(pointsRef.current); const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3)); const material = new THREE.PointsMaterial({ color: '#b7cf9c', size: .025 }); pointsRef.current = new THREE.Points(geometry, material); scene.add(pointsRef.current) }, [points])
  return <div className="sparse-map-viewer" ref={host}><span>{points.length ? `${points.length} points` : 'Ожидание 3D-точек…'}</span></div>
}
