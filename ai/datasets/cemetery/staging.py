from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from collector import ROOT, paths


def stage_candidates(root: Path = ROOT, ocr_threshold: float = 0.5) -> dict:
    output = paths(root); detector = ocr = 0
    for metadata_path in output["cleaned/metadata"].glob("*.json"):
        item = json.loads(metadata_path.read_text(encoding="utf-8")); image = output["cleaned/images"] / (item.get("filename") or "")
        if not image.exists(): continue
        # No labels or transcriptions are invented. These are human-review staging copies only.
        shutil.copy2(image, output["detector_staging/images"] / image.name); detector += 1
        score = float(item.get("ocrCandidateScore") or 0)
        if score >= ocr_threshold: shutil.copy2(image, output["ocr_staging/images"] / image.name); ocr += 1
    result = {"detectorStaging": detector, "ocrStaging": ocr, "note": "Human verification is required before labels or transcription become ground truth."}; (output["reports"] / "staging.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"); return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--root", type=Path, default=ROOT); args = parser.parse_args(); print(json.dumps(stage_candidates(args.root), indent=2))
