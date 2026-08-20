import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

type MapPoint = [number, number, number, number?, number?, number?]

export function SparseMapViewer({ points }: { points: MapPoint[] }) {
  const host = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cloudRef = useRef<THREE.Points | null>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#050807')
    scene.add(new THREE.GridHelper(8, 32, 0x34443d, 0x17231e))
    sceneRef.current = scene
    const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 100)
    camera.position.set(0, 0.8, 3.2)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    element.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0.8, 0)
    const resize = () => {
      camera.aspect = element.clientWidth / Math.max(element.clientHeight, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(element.clientWidth, element.clientHeight, false)
    }
    resize()
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      renderer.setAnimationLoop(null)
      controls.dispose()
      renderer.dispose()
      element.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (cloudRef.current) {
      scene.remove(cloudRef.current)
      cloudRef.current.geometry.dispose()
      ;(cloudRef.current.material as THREE.Material).dispose()
      cloudRef.current = null
    }
    if (!points.length) return
    const positions: number[] = []
    const colors: number[] = []
    for (const point of points.slice(-18000)) {
      positions.push(point[0], point[1], point[2])
      colors.push(point[3] ?? 0.72, point[4] ?? 0.85, point[5] ?? 0.62)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    cloudRef.current = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.018, vertexColors: true, sizeAttenuation: true }))
    scene.add(cloudRef.current)
  }, [points])

  return <div className="sparse-map-viewer" ref={host}><span>{points.length ? `${points.length} voxels` : 'Waiting for PC reconstruction…'}</span></div>
}
