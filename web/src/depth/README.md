# Single-view depth

The browser loads `public/models/depth/depth-anything-v2-small.onnx` through `import.meta.env.BASE_URL`. `OnnxDepthEstimator` prefers WebGPU and falls back to ONNX Runtime WASM. The output is monocular relative depth: it provides shape and ordering, but not metric distance. `DepthToPointCloud` converts the result into a color point cloud; the UI also provides a depth mesh view.
