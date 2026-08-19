from __future__ import annotations

import argparse
import json
from pathlib import Path
from PIL import Image


def validate(root: Path) -> dict:
    errors = []; images = 0; boxes = 0
    for split in ("train", "val", "test"):
        image_dir = root / "images" / split; label_dir = root / "labels" / split
        for image in image_dir.glob("*") if image_dir.exists() else []:
            try:
                with Image.open(image) as opened: width, height = opened.size; opened.verify()
            except Exception as error: errors.append(f"{image}: image decode: {error}"); continue
            images += 1; label = label_dir / f"{image.stem}.txt"
            if not label.exists(): errors.append(f"{image}: missing label"); continue
            for line_no, line in enumerate(label.read_text(encoding="utf-8").splitlines(), 1):
                fields = line.split()
                if len(fields) != 5 or fields[0] != "0": errors.append(f"{label}:{line_no}: invalid class/field count"); continue
                try: values = [float(value) for value in fields[1:]]
                except ValueError: errors.append(f"{label}:{line_no}: non-numeric bbox"); continue
                if any(value < 0 or value > 1 for value in values) or values[2] <= 0 or values[3] <= 0: errors.append(f"{label}:{line_no}: invalid bbox")
                else: boxes += 1
    result = {"valid": not errors, "images": images, "boxes": boxes, "errors": errors}; (root / "validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"); return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--root", type=Path, default=Path("../dataset-bootstrap")); args = parser.parse_args(); result = validate(args.root); print(json.dumps(result, ensure_ascii=False, indent=2)); raise SystemExit(0 if result["valid"] else 1)
