export type ScaleStatus = 'METRIC' | 'ESTIMATED' | 'CALIBRATING' | 'UNSCALED'

export class ScaleEstimator {
  private scale: number | null = null
  private status: ScaleStatus = 'UNSCALED'
  private readonly samples = new Map<string, number>()

  getStatus() { return this.status }
  getScale() { return this.scale }

  recordSample(sampleId: string, visionUnits: number) {
    if (!sampleId || !Number.isFinite(visionUnits)) throw new Error('A sample id and finite vision position are required.')
    this.samples.set(sampleId, visionUnits)
    this.status = 'CALIBRATING'
  }

  setKnownDistance(startSampleId: string, endSampleId: string, meters: number) {
    const start = this.samples.get(startSampleId)
    const end = this.samples.get(endSampleId)
    const visionDistance = start === undefined || end === undefined ? NaN : Math.abs(end - start)
    if (!Number.isFinite(visionDistance) || visionDistance <= 0 || meters <= 0) throw new Error('Known-distance calibration requires two recorded samples and a positive meter value.')
    this.scale = meters / visionDistance
    this.status = 'ESTIMATED'
  }

  clear() { this.scale = null; this.samples.clear(); this.status = 'UNSCALED' }
}
