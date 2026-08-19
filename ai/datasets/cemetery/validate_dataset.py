from __future__ import annotations

import argparse
import json
from pathlib import Path
from PIL import Image, UnidentifiedImageError

from collector import ROOT, paths


def validate(root: Path = ROOT, min_width: int = 512, min_height: int = 512) -> dict:
    output = paths(root); stats = {"checked": 0, "accepted": 0, "rejected": 0, "reasons": {}}
    for metadata_path in output["raw/metadata"].glob("*.json"):
        stats["checked"] += 1; metadata = json.loads(metadata_path.read_text(encoding="utf-8")); image_path = output["raw/images"] / (metadata.get("filename") or "")
        reason = None
        try:
            if not image_path.exists() or image_path.stat().st_size == 0: reason = "missing_or_zero_bytes"
            else:
                with Image.open(image_path) as image:
                    image.verify()
                with Image.open(image_path) as image:
                    width, height = image.size
                    if width < min_width or height < min_height: reason = "resolution_too_small"
                    elif not 0.2 <= width / height <= 5: reason = "aspect_ratio_anomalous"
                    else: metadata.update({"width": width, "height": height, "mime": Image.MIME.get(image.format)})
        except (UnidentifiedImageError, OSError): reason = "invalid_image"
        if reason:
            stats["rejected"] += 1; stats["reasons"][reason] = stats["reasons"].get(reason, 0) + 1; metadata["status"] = "rejected"; metadata["rejectReason"] = reason
        else:
            stats["accepted"] += 1; metadata["status"] = "validated"
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    (output["reports"] / "validation.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"); return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--root", type=Path, default=ROOT); args = parser.parse_args(); print(json.dumps(validate(args.root), indent=2))
