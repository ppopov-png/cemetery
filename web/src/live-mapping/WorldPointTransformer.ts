import type { SpatialPose } from '../spatial/spatialTypes'

export function cameraToWorld(x: number, y: number, z: number, pose: SpatialPose): [number, number, number] {
  const q = pose.orientation; const ix = q.w * x + q.y * z - q.z * y; const iy = q.w * y + q.z * x - q.x * z; const iz = q.w * z + q.x * y - q.y * x; const iw = -q.x * x - q.y * y - q.z * z
  return [ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y + pose.position.x, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z + pose.position.y, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x + pose.position.z]
}

export function poseDistance(a: SpatialPose, b: SpatialPose): number { return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) }
export function poseRotationDelta(a: SpatialPose, b: SpatialPose): number { const dot = Math.abs(a.orientation.x * b.orientation.x + a.orientation.y * b.orientation.y + a.orientation.z * b.orientation.z + a.orientation.w * b.orientation.w); return 2 * Math.acos(Math.min(1, dot)) }
