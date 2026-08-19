from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
import shutil

from dataset_utils import TARGET_CLASSES, find_split_files, find_yaml, image_sha, image_signature, json_write, parse_yaml


def merge(cache: Path, output: Path) -> dict:
    for split in ("train", "val", "test"): (output / "images" / split).mkdir(parents=True, exist_ok=True); (output / "labels" / split).mkdir(parents=True, exist_ok=True)
    seen_sha: dict[str, str] = {}; seen_signature: dict[str, str] = {}; counts = Counter(); boxes = 0; rejected = []; downloads_path = cache / "downloads.json"; downloads = json.loads(downloads_path.read_text(encoding="utf-8")).get("downloads", []) if downloads_path.exists() else []; download_info = {Path(item.get("extracted", "")).parent.name: item for item in downloads}
    for dataset_dir in sorted(cache.glob("*/extracted")):
        yaml_path = find_yaml(dataset_dir)
        if not yaml_path: rejected.append({"dataset": str(dataset_dir), "reason": "missing data.yaml"}); continue
        config = parse_yaml(yaml_path); names = [str(name).casefold() for name in config.get("names", [])]; mapping = {index: 0 for index, name in enumerate(names) if any(target in name or name in target for target in TARGET_CLASSES)}
        if not mapping: rejected.append({"dataset": str(dataset_dir), "reason": "no grave-compatible class"}); continue
        namespace = dataset_dir.parent.name
        for split in ("train", "val", "test"):
            image_dir, label_dir = find_split_files(dataset_dir, split)
            if not image_dir: continue
            for image in sorted(image_dir.iterdir()):
                if image.suffix.casefold() not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}: continue
                try: digest = image_sha(image); signature = image_signature(image)
                except Exception as error: rejected.append({"dataset": str(dataset_dir), "image": image.name, "reason": f"decode: {error}"}); continue
                if digest in seen_sha or signature in seen_signature: counts["duplicatesRemoved"] += 1; continue
                source_id = f"{namespace}_{image.stem}{image.suffix.lower()}"; destination = output / "images" / split / source_id; label_source = (label_dir / f"{image.stem}.txt") if label_dir else None; label_destination = output / "labels" / split / f"{Path(source_id).stem}.txt"
                shutil.copy2(image, destination); lines = []
                if label_source and label_source.exists():
                    for raw in label_source.read_text(encoding="utf-8").splitlines():
                        fields = raw.split()
                        if len(fields) != 5: continue
                        try: class_id = int(fields[0]); values = [float(value) for value in fields[1:]]
                        except ValueError: continue
                        if class_id not in mapping or any(value < 0 or value > 1 for value in values) or values[2] <= 0 or values[3] <= 0: continue
                        lines.append("0 " + " ".join(f"{value:.6f}" for value in values)); boxes += 1
                label_destination.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8"); seen_sha[digest] = source_id; seen_signature[signature] = source_id; counts[split] += 1
                info = download_info.get(namespace, {}); json_write(output / "provenance" / f"{Path(source_id).stem}.json", {"sourceDataset": info.get("datasetId", namespace), "workspace": info.get("workspace"), "project": info.get("project"), "version": info.get("version"), "sourceUrl": info.get("sourceUrl"), "license": info.get("license"), "imageCount": info.get("imageCount"), "classes": info.get("classes"), "downloadedAt": info.get("downloadedAt"), "sourceImage": image.name, "split": split, "classMapping": "grave-compatible -> grave_object"})
    config = {"path": ".", "train": "images/train", "val": "images/val", "test": "images/test", "names": ["grave_object"]}; (output / "dataset.yaml").write_text("path: .\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n  0: grave_object\n", encoding="utf-8")
    report = {"images": dict(counts), "boxes": boxes, "rejected": rejected, "classDistribution": {"grave_object": boxes}}; json_write(output / "bootstrap-report.json", report); return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--cache", type=Path, default=Path("cache")); parser.add_argument("--output", type=Path, default=Path("../dataset-bootstrap")); args = parser.parse_args(); print(json.dumps(merge(args.cache, args.output), ensure_ascii=False, indent=2))
