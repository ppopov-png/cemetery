import type { RefObject } from 'react'
import type { SpatialPose, SpatialTrackingState } from '../spatial/spatialTypes'
import { MappingPanel } from './MappingPanel'

// Mapping is deliberately delegated to the PC backend. The phone only
// captures frames and renders the returned map; it never runs depth inference.
export function LiveWorldMapPanel({ videoRef, onClose, pose }: { videoRef: RefObject<HTMLVideoElement | null>; pose: SpatialPose | null; trackingState: SpatialTrackingState; onClose: () => void; onSingleView: () => void }) {
  return <MappingPanel videoRef={videoRef} onClose={onClose} />
}
