# Cemetery dataset collection

This directory contains a reproducible, provenance-first collector for two future datasets:

- Grave Detector candidates (`grave_object`);
- multilingual grave OCR candidates.

The collector does not scrape search engines, invent annotations, train models, or commit downloaded images. It only accepts records with explicit license metadata allowed by the local policy.

## Sources

- Wikimedia Commons through the MediaWiki Action API;
- Open Images through an official metadata CSV supplied locally by the operator;
- Flickr Commons through the Flickr API when `FLICKR_API_KEY` is configured.

## Windows quick start

```powershell
cd ai/datasets/cemetery
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python collect.py --source wikimedia --query gravestones --limit 100
python collect.py --profile russia_priority --limit 100
python validate_dataset.py
python dedup.py
python report.py
python prepare_split.py --seed 42
```

The collector resumes by reading existing metadata IDs. Use `--source open_images --metadata-csv <official-file.csv>` for Open Images. No command trains a detector or OCR model.

## Output

```text
ai/datasets/cemetery/
  raw/images/
  raw/metadata/
  cleaned/images/
  cleaned/metadata/
  rejected/
  reports/
  detector_staging/images/
  detector_staging/proposed_labels/
  detector_staging/verified_labels/
  ocr_staging/images/
  ocr_staging/crops/
  ocr_staging/proposed_text/
  ocr_staging/verified_text/
```

The output metadata is the source of truth. File renames must not remove `datasetId`, source page, original URL, license, author, and retrieval metadata.

## Review and annotation

`staging.py` creates human-review copies only. It does not create bounding boxes, OCR text, or ground truth. Proposed labels from an external detector must be written to `detector_staging/proposed_labels/` and copied to `verified_labels/` only after human review. OCR candidates follow the same rule in `ocr_staging/`; the record shape is documented in `ocr-record.schema.json`.

Recommended first collection command:

```powershell
python collect.py --source wikimedia --query "gravestones Russia" --country Russia --limit 100
python validate_dataset.py
python dedup.py
python report.py
```

The initial target of 2,000–5,000 detector candidates and several hundred OCR candidates is a planning range, not a guaranteed result. Actual counts come from `reports/dataset-report.json`.
