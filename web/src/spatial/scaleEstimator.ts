export type ScaleStatus = 'METRIC' | 'ESTIMATED' | 'CALIBRATING' | 'UNSCALED'

export class ScaleEstimator {
  private scale: number | null = null
  private status: ScaleStatus = 'UNSCALED'

  getStatus() { return this.status }
  getScale() { return this.scale }

  setKnownDistance(pointADistance: number, pointBDistance: number, meters: number) {
    const imageDistance = Math.abs(pointBDistance - pointADistance)
    if (!Number.isFinite(imageDistance) || imageDistance <= 0 || meters <= 0) throw new Error('Known-distance calibration requires two distinct points and a positive meter value.')
    this.scale = meters / imageDistance
    this.status = 'ESTIMATED'
  }

  clear() { this.scale = null; this.status = 'UNSCALED' }
}
