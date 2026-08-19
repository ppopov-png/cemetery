import { OnnxDepthEstimator } from '../depth/OnnxDepthEstimator'
import { TemporalDepthFilter } from '../depth/TemporalDepthFilter'
import type { SpatialPose } from '../spatial/spatialTypes'
import { KeyframeManager } from './KeyframeManager'
import { VoxelMap } from './VoxelMap'
import type { LiveMapSnapshot } from './liveMappingTypes'

export class LiveMappingController { readonly estimator = new OnnxDepthEstimator(); readonly map = new VoxelMap(); readonly keyframes = new KeyframeManager(); private filter = new TemporalDepthFilter(); private running = false; private busy = false; private lastDepth = 0; private depthCount = 0; private fusionCount = 0
  async start(): Promise<void> { await this.estimator.load(); this.running = true }
  stop(): void { this.running = false; this.filter.reset() }
  clear(): void { this.map.clear(); this.keyframes.frames.length = 0; this.filter.reset() }
  async process(video: HTMLVideoElement, pose: SpatialPose | null, tracking: LiveMapSnapshot['tracking']): Promise<LiveMapSnapshot> { if (!this.running || this.busy || !pose || video.readyState < 2) return this.snapshot(tracking, pose); this.busy = true; try { const depth = this.filter.apply(await this.estimator.estimate(video)); this.depthCount += 1; const now = Date.now(); if (this.keyframes.shouldCreate(pose, now)) { this.map.fuse({ depth, rgb: video, pose, trackingConfidence: tracking === 'GOOD' ? 0.9 : 0.55 }); this.keyframes.add(pose, depth.width, depth.height, tracking === 'GOOD' ? 0.9 : 0.55, 0.75); this.fusionCount += 1 } this.lastDepth = now } finally { this.busy = false } return this.snapshot(tracking, pose) }
  snapshot(tracking: LiveMapSnapshot['tracking'], pose: SpatialPose | null): LiveMapSnapshot { const elapsed = Math.max(1, (Date.now() - (this.lastDepth || Date.now())) / 1000); return this.map.snapshot(this.keyframes.frames.length, this.depthCount / elapsed, this.fusionCount / elapsed, tracking, pose) }
}
