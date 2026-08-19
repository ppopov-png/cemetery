import type { DepthFrame } from './depthTypes'

export class TemporalDepthFilter {
  private previous: Float32Array | null = null
  reset(): void { this.previous = null }
  apply(frame: DepthFrame): DepthFrame {
    if (!this.previous || this.previous.length !== frame.values.length) { this.previous = frame.values.slice(); return frame }
    for (let i = 0; i < frame.values.length; i += 1) this.previous[i] = this.previous[i] * 0.7 + frame.values[i] * 0.3
    return { ...frame, values: this.previous.slice() }
  }
}
