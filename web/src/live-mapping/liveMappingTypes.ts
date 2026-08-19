import type { SpatialPose } from '../spatial/spatialTypes'
import type { DepthFrame } from '../depth/depthTypes'

export type CameraWorldPose = { position: [number, number, number]; quaternion: [number, number, number, number]; confidence: number; method: 'WEBXR' | 'VISION' | 'SENSOR'; scale: 'METRIC' | 'RELATIVE' }
export type MappingKeyframe = { id: string; timestamp: number; pose: CameraWorldPose; width: number; height: number; trackingConfidence: number; depthConfidence: number }
export type WorldBounds = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
export type LiveMapSnapshot = { positions: Float32Array; colors: Float32Array; voxels: number; keyframes: number; bounds: WorldBounds | null; depthFps: number; fusionFps: number; tracking: 'GOOD' | 'WEAK' | 'LOST' | 'LIMITED'; pose: SpatialPose | null }
export type FusionInput = { depth: DepthFrame; rgb: CanvasImageSource; pose: SpatialPose; trackingConfidence: number }
