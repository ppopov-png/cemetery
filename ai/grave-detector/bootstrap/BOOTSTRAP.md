# Grave Detector bulk bootstrap

This pipeline imports public Roboflow Universe object-detection datasets as a generic bootstrap dataset for `grave_object`. It does not download individual Wikimedia images, generate synthetic labels, or train a model.

Roboflow Universe is queried through its official REST API (`/universe/search`) and dataset exports are downloaded as bulk YOLO archives. `ROBOFLOW_API_KEY` is read only from the environment; it is never stored in Git.

## Windows

```powershell
cd ai/grave-detector/bootstrap
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:ROBOFLOW_API_KEY="..."
python bootstrap.py --seed-only
python bootstrap.py --target-images 5000
```

`--seed-only` uses the approved `lei-kl6g1/graves` seed. The full command first searches the configured queries, filters for Object Detection, explicit compatible license, annotations, classes, and cemetery semantics, then downloads approved candidates and merges them.

Outputs are created under `ai/grave-detector/dataset-bootstrap/`:

```text
images/{train,val,test}/
labels/{train,val,test}/
provenance/
dataset.yaml
bootstrap-report.json
validation.json
```

Accepted licenses are CC0, Public Domain, CC BY, and CC BY-SA. A source with no explicit compatible license is rejected. Class names `grave`, `graves`, `gravestone`, `headstone`, `tombstone`, and `grave marker` map to the single target class `grave_object`; unrelated classes are ignored. If a dataset has no compatible class, it is rejected. Original splits are preserved where available.

The cache is resumable at `ai/grave-detector/bootstrap/cache/<dataset-id>/`. Existing archives and extracted directories are reused. Exact SHA-256 duplicates and perceptual near-duplicates are removed before merge. Every imported image receives a provenance JSON record with source dataset and original image ID.

The generic bootstrap dataset is intentionally separate from future Russian fine-tuning:

```text
dataset-bootstrap/  # generic grave detector bootstrap
dataset-russia/     # future Russian cemetery fine-tuning
dataset-final/      # future merged training set
```

After validation, the existing training pipeline can be used:

```powershell
cd ai/grave-detector
python check_dataset.py --data dataset-bootstrap/dataset.yaml
python train.py --data dataset-bootstrap/dataset.yaml
```

If those scripts are not yet present in the checkout, the bootstrap still produces a standard Ultralytics-compatible dataset and `dataset.yaml`; no training is claimed automatically.
