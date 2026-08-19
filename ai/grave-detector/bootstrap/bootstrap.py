from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

from dataset_utils import json_write
from discover_datasets import QUERIES, discover
from download_datasets import export_dataset
from merge_datasets import merge
from validate_bootstrap import validate


ROOT = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover, download, merge, and validate licensed Roboflow grave datasets.")
    parser.add_argument("--target-images", type=int, default=3000); parser.add_argument("--seed-only", action="store_true"); parser.add_argument("--cache", type=Path, default=ROOT / "cache"); parser.add_argument("--output", type=Path, default=ROOT.parent / "dataset-bootstrap"); args = parser.parse_args()
    api_key = os.environ.get("ROBOFLOW_API_KEY")
    if not api_key: raise SystemExit("ROBOFLOW_API_KEY is required. Set it in PowerShell before bootstrap.")
    sources = json.loads((ROOT / "sources.json").read_text(encoding="utf-8")); manifest = {"approved": sources.get("approved", []), "rejected": sources.get("rejected", [])}
    if not args.seed_only:
        discovered = discover(QUERIES, api_key); manifest["discovered"] = discovered["discovered"]; manifest["rejected"].extend(discovered["rejected"]); json_write(args.cache / "discovery.json", discovered)
    json_write(args.cache / "manifest.json", manifest); downloads = []
    for item in manifest["approved"] if args.seed_only else manifest.get("discovered", []) + manifest["approved"]:
        try: downloads.append(export_dataset(item, args.cache, api_key)); print(f"Downloaded: {downloads[-1]['datasetId']}")
        except Exception as error: manifest["rejected"].append({"id": item.get("id"), "reason": f"download: {error}"}); print(f"Rejected: {item.get('id')}: {error}")
    json_write(args.cache / "downloads.json", {"downloads": downloads}); report = merge(args.cache, args.output); validation = validate(args.output); report["validation"] = validation; report["targetImages"] = args.target_images; json_write(args.output / "bootstrap-report.json", report)
    print(json.dumps({"approved": len(manifest["approved"]), "downloaded": len(downloads), "images": report.get("images", {}), "boxes": report.get("boxes", 0), "valid": validation["valid"]}, ensure_ascii=False, indent=2)); raise SystemExit(0 if validation["valid"] else 1)


if __name__ == "__main__": main()
