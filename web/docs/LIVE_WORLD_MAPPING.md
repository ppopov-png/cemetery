# Live world mapping

`LIVE_WORLD_MAP` accumulates geometry during one scan session. Camera pose comes from the existing spatial provider: WebXR on supported Android devices, Vision tracking on iPhone/no-WebXR devices, and sensors only as a limited fallback.

Each accepted keyframe combines the current RGB frame, monocular relative depth from Depth Anything V2 Small, and the current pose. Depth pixels are back-projected into camera coordinates and rotated/translated into the provider's world coordinate system. The `VoxelMap` merges nearby observations instead of stacking separate meshes.

Fusion pauses when a real pose is unavailable or tracking is lost. The existing map remains visible. Scale is marked `RELATIVE` unless the provider reports metric scale; monocular depth cannot provide metres by itself.

The initial mobile limits are 100,000 voxels, five-pixel sampling, and roughly 650 ms between depth attempts. This is an approximate geometric map, not TSDF, NeRF, photogrammetry, or semantic grave recognition. Single-view preview remains available as a fallback.
