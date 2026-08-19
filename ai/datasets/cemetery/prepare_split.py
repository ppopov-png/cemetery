from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

from collector import ROOT, paths


def prepare_split(root: Path = ROOT, seed: int = 42) -> dict:
    output = paths(root); records = [json.loads(path.read_text(encoding="utf-8")) for path in output["cleaned/metadata"].glob("*.json")]; groups: dict[str, list[str]] = {}
    for item in records: groups.setdefault(item.get("duplicateGroup") or item["id"], []).append(item["id"])
    keys = list(groups); random.Random(seed).shuffle(keys); total = len(keys); boundaries = (int(total * 0.8), int(total * 0.9)); result = {"seed": seed, "train": [], "val": [], "test": []}
    for index, key in enumerate(keys): result["train" if index < boundaries[0] else "val" if index < boundaries[1] else "test"].extend(groups[key])
    (output["reports"] / "split.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"); return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--root", type=Path, default=ROOT); parser.add_argument("--seed", type=int, default=42); args = parser.parse_args(); print(json.dumps(prepare_split(args.root, args.seed), indent=2))
