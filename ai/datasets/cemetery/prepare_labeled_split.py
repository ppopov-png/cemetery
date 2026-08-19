from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LABELS = {"gravestone", "grave", "memorial_tablet", "cemetery_background"}


def prepare(root: Path = ROOT, output: Path | None = None, seed: int = 42) -> dict:
    source = root / "yandex_web"
    output = output or root / "prepared"
    labels_path = source / "reports/labels.json"
    labels = json.loads(labels_path.read_text(encoding="utf-8")) if labels_path.is_file() else {}
    records = []
    for metadata_path in sorted((source / "raw/metadata").glob("*.json")):
        try: item = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError): continue
        label = labels.get(metadata_path.stem)
        image = source / "raw/images" / str(item.get("filename") or "")
        if label not in LABELS or not image.is_file(): continue
        # Grouping prevents the same source page or exact bytes from crossing splits.
        group = item.get("sha256") or item.get("sourcePage") or item.get("domain") or metadata_path.stem
        records.append({"id": metadata_path.stem, "label": label, "image": image, "metadata": item, "group": str(group)})

    grouped: dict[str, list[dict]] = defaultdict(list)
    for record in records: grouped[f"{record['label']}::{record['group']}"] .append(record)
    split_records: dict[str, list[dict]] = {"train": [], "val": [], "test": []}
    rng = random.Random(seed)
    by_label: dict[str, list[list[dict]]] = defaultdict(list)
    for group in grouped.values(): by_label[group[0]["label"]].append(group)
    for label_groups in by_label.values():
        rng.shuffle(label_groups); total = len(label_groups); train_end = max(1, int(total * 0.8)); val_end = max(train_end, int(total * 0.9))
        for index, group in enumerate(label_groups):
            split_records["train" if index < train_end else "val" if index < val_end else "test"].extend(group)

    for split, split_items in split_records.items():
        image_dir = output / split / "images"; metadata_dir = output / split / "metadata"; image_dir.mkdir(parents=True, exist_ok=True); metadata_dir.mkdir(parents=True, exist_ok=True)
        manifest = []
        for record in split_items:
            destination = image_dir / record["image"].name; shutil.copy2(record["image"], destination)
            item = {"id": record["id"], "label": record["label"], "filename": destination.name, "source": record["metadata"]}
            (metadata_dir / f"{record['id']}.json").write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8"); manifest.append(item)
        (output / split / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    report = {"seed": seed, "source": str(source), "output": str(output), "labeledIncluded": len(records), "unlabeledExcluded": max(0, len(list((source / "raw/metadata").glob("*.json"))) - len(records)), "classes": dict(Counter(item["label"] for item in records)), "splits": {key: len(value) for key, value in split_records.items()}}
    (source / "reports").mkdir(parents=True, exist_ok=True); (source / "reports/labeled-split.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare labeled train/val/test copies grouped by source and content hash.")
    parser.add_argument("--root", type=Path, default=ROOT); parser.add_argument("--output", type=Path, default=None); parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(); print(json.dumps(prepare(args.root, args.output, args.seed), ensure_ascii=False, indent=2))
