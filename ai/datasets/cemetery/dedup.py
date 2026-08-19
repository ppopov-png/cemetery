from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from PIL import Image
import imagehash

from collector import ROOT, paths
from collector_models import sha256_file


def deduplicate(root: Path = ROOT, near_threshold: int = 6) -> dict:
    output = paths(root); exact: dict[str, str] = {}; hashes: list[tuple[str, str]] = []; stats = {"checked": 0, "exactDuplicates": 0, "nearDuplicates": 0, "cleaned": 0}
    for metadata_path in output["raw/metadata"].glob("*.json"):
        metadata = json.loads(metadata_path.read_text(encoding="utf-8")); image_path = output["raw/images"] / (metadata.get("filename") or ""); stats["checked"] += 1
        if metadata.get("status") == "rejected" or not image_path.exists(): continue
        sha = metadata.get("sha256") or sha256_file(image_path); metadata["sha256"] = sha
        if sha in exact:
            reject(metadata_path, metadata, "exact_duplicate", exact[sha], output); stats["exactDuplicates"] += 1; continue
        try: phash = str(imagehash.phash(Image.open(image_path)))
        except Exception:
            reject(metadata_path, metadata, "invalid_image", None, output); continue
        near = next(((other_id, distance) for other_id, other_hash in hashes if (distance := imagehash.hex_to_hash(phash) - imagehash.hex_to_hash(other_hash)) <= near_threshold), None)
        metadata["perceptualHash"] = phash
        if near:
            group = near[0]; metadata["duplicateGroup"] = group; reject(metadata_path, metadata, "near_duplicate", group, output); stats["nearDuplicates"] += 1; continue
        exact[sha] = metadata["id"]; hashes.append((metadata["id"], phash)); metadata["status"] = "cleaned"; target_image = output["cleaned/images"] / image_path.name; target_meta = output["cleaned/metadata"] / metadata_path.name; shutil.copy2(image_path, target_image); target_meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"); stats["cleaned"] += 1
    (output["reports"] / "dedup.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"); return stats


def reject(metadata_path: Path, metadata: dict, reason: str, group: str | None, output: dict[str, Path]):
    metadata["status"] = "rejected"; metadata["rejectReason"] = reason; metadata["duplicateGroup"] = group; target = output["rejected"] / metadata_path.name; target.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"); metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--root", type=Path, default=ROOT); args = parser.parse_args(); print(json.dumps(deduplicate(args.root), indent=2))
