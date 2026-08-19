import type { SpatialPose } from '../spatial/spatialTypes'
import { poseDistance, poseRotationDelta } from './WorldPointTransformer'
import type { CameraWorldPose, MappingKeyframe } from './liveMappingTypes'

export class KeyframeManager { readonly frames: MappingKeyframe[] = []; private last: SpatialPose | null = null
  shouldCreate(pose: SpatialPose, now: number): boolean { return !this.last || poseDistance(this.last, pose) > 0.06 || poseRotationDelta(this.last, pose) > Math.PI / 24 || now - this.frames.at(-1)!.timestamp > 850 }
  add(pose: SpatialPose, width: number, height: number, trackingConfidence: number, depthConfidence: number): MappingKeyframe { const worldPose: CameraWorldPose = { position: [pose.position.x, pose.position.y, pose.position.z], quaternion: [pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w], confidence: trackingConfidence, method: pose.source === 'webxr' ? 'WEBXR' : pose.source === 'vision' ? 'VISION' : 'SENSOR', scale: pose.metricScaleAvailable ? 'METRIC' : 'RELATIVE' }; const frame: MappingKeyframe = { id: crypto.randomUUID(), timestamp: Date.now(), pose: worldPose, width, height, trackingConfidence, depthConfidence }; this.frames.push(frame); this.last = pose; return frame }
}
