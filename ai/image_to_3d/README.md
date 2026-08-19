# Image to 3D

The local setup uses TripoSR and the NVIDIA RTX 3060 GPU. It takes one image and produces an approximate GLB mesh. Hidden sides and true metric dimensions are inferred, not measured.

Run from the repository root:

```powershell
python ai/image_to_3d/generate.py --input path\to\monument.jpg
```

The result is written to `ai/3d-output/0/mesh.glb`.

To keep the background instead of removing it:

```powershell
python ai/image_to_3d/generate.py --input path\to\monument.jpg --no-remove-bg
```

The first run downloads approximately 1.7 GB of TripoSR weights. The model environment is separate in `ai/.venv-triposr/`.
