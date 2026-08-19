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
python collect.py --profile russia_priority --city "Санкт-Петербург" --limit 100
python collect.py --profile russia_priority --cemetery "Большеохтинское кладбище" --limit 50
python validate_dataset.py
python dedup.py
python report.py
python prepare_split.py --seed 42
```

The collector resumes by reading existing metadata IDs. Use `--source open_images --metadata-csv <official-file.csv>` for Open Images. No command trains a detector or OCR model.

## Russia priority profile

`russia_priority` uses Cyrillic-first Wikimedia queries generated from `russian_cemeteries.json`: specific cemetery names, city monument searches, historical searches, and broad Russian cemetery terms. It scores title, description, and categories before downloading, rejects foreign cemetery metadata without a Russian relation, and records city/cemetery hints, matched names, relevance reasons, Cyrillic metadata, and historical Russian context. It includes Orthodox, Muslim, Jewish, Lutheran/German, Catholic, Old Believer, and military contexts when the source metadata connects them to Russia; it is not an Orthodox-only filter.

The profile is limited to Russia. Neighboring countries are kept in the separate `post_soviet` profile and are not traversed automatically by `russia_priority`. `maxPerCemetery` and `maxPerCity` prevent one location from dominating the collection. Progress is printed for accepted, rejected, duplicate, and failed candidates. Rejected metadata and downloaded metadata are written as the collector runs, so Ctrl+C does not discard completed work and a later run resumes by ID/URL.

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

## Yandex bootstrap: audit, labeling, and split

The Yandex web collector stores a raw, unverified bootstrap set in `yandex_web/raw/`. It is not training-ready until it has been reviewed by a person.

Run an audit without deleting anything:

```powershell
python dataset_audit.py
```

Start the local browser labeling tool:

```powershell
python label_tool.py
```

Open the printed `http://127.0.0.1:8765/` address. Labels are saved continuously to `yandex_web/reports/labels.json`.

```text
1 gravestone   2 grave   3 memorial_tablet   4 cemetery_background   5 irrelevant   Space skip
```

After labeling, create grouped train/validation/test copies:

```powershell
python prepare_labeled_split.py --seed 42
```

The result is written to `prepared/train`, `prepared/val`, and `prepared/test`. Exact duplicate bytes and the same source group stay in one split. Unlabeled and `irrelevant` records are excluded.

The initial target of 2,000–5,000 detector candidates and several hundred OCR candidates is a planning range, not a guaranteed result. Actual counts come from `reports/dataset-report.json`.
