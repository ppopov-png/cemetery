# Training workflow

The intended framework is a lightweight Ultralytics YOLO detector exported to ONNX for browser/mobile inference.

Dataset layout:

```text
dataset/
  images/train/
  images/val/
  labels/train/
  labels/val/
```

The first taxonomy contains one class: `grave_object`.

Negative examples must include people, tables, circles, cars, benches, trees, buildings, fences without monuments, and ordinary vertical objects. The model must learn the grave object rather than a central ROI or generic vertical shape.

After training, export an ONNX model and place it at `web/public/models/grave-detector/grave-detector.onnx` beside the manifest. Do not commit large datasets or weights until they are intentionally versioned.
