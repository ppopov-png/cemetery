import type { CapturedFrame } from './scanSessionTypes'

export interface FrameSelectorForOCR { select(frames: CapturedFrame[], maxFrames: number): CapturedFrame[] }

export class QualityFrameSelector implements FrameSelectorForOCR {
  select(frames: CapturedFrame[], maxFrames: number) { return [...frames].sort((a, b) => (b.ocrCandidateScore ?? b.quality.score) - (a.ocrCandidateScore ?? a.quality.score)).slice(0, maxFrames) }
}
