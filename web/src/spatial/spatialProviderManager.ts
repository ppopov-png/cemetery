import { SensorSpatialProvider } from './sensorSpatialProvider'
import { VisionSpatialProvider } from './visionSpatialProvider'
import type { SpatialProvider, SpatialStartContext } from './spatialTypes'
import { WebXRSpatialProvider } from './webXRSpatialProvider'

export type SpatialProviderSelection = { provider: SpatialProvider; cameraStream: MediaStream | null; reason: string }

export class SpatialProviderManager {
  private provider: SpatialProvider | null = null

  async start(context: SpatialStartContext): Promise<SpatialProviderSelection> {
    const xrProvider = new WebXRSpatialProvider()
    try {
      await xrProvider.start(context)
      this.provider = xrProvider
      return { provider: xrProvider, cameraStream: null, reason: 'Working WebXR session and viewer pose.' }
    } catch {
      await xrProvider.stop()
    }

    let cameraStream = context.cameraStream ?? null
    if (!cameraStream) cameraStream = await context.requestCamera().catch(() => null)
    try {
      const visionProvider = new VisionSpatialProvider()
      await visionProvider.start({ ...context, cameraStream })
      this.provider = visionProvider
      return { provider: visionProvider, cameraStream: visionProvider.getCameraStream(), reason: 'WebXR unavailable; visual feature tracking is calibrating.' }
    } catch {
      const sensorProvider = new SensorSpatialProvider()
      await sensorProvider.start({ ...context, cameraStream })
      this.provider = sensorProvider
      return { provider: sensorProvider, cameraStream, reason: 'WebXR and visual tracking unavailable; sensor-limited mode.' }
    }
  }

  async stop() { await this.provider?.stop(); this.provider = null }
}
