export interface DepthProvider {
  readonly type: string
  isAvailable(): Promise<boolean>
  start(): Promise<void>
  getDepthAt(normalizedX: number, normalizedY: number): number | null
  stop(): Promise<void>
}

export class NoDepthProvider implements DepthProvider {
  readonly type = 'none'
  async isAvailable() { return false }
  async start() { /* Depth is intentionally not started in this stage. */ }
  getDepthAt(_normalizedX: number, _normalizedY: number) { return null }
  async stop() { /* Nothing to release. */ }
}
