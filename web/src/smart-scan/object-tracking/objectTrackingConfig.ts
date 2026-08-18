export const objectTrackingConfig = {
  roiWidth: 0.4,
  roiHeight: 0.5,
  maxFeatures: 120,
  minFeatures: 8,
  minInliers: 5,
  weakInliers: 3,
  descriptorThreshold: 72,
  inlierDistancePx: 12,
  recoveryFrames: 2,
  sampleWidth: 640,
  sampleHeight: 480,
} as const
