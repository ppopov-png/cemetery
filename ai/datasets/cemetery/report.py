from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from collector import ROOT, paths


def build_report(root: Path = ROOT) -> dict:
    output = paths(root); records = [json.loads(path.read_text(encoding="utf-8")) for path in output["raw/metadata"].glob("*.json")]; accepted = [item for item in records if item.get("status") in {"validated", "cleaned"}]
    report = {"totalDownloaded": len(records), "accepted": len(accepted), "rejected": len(records) - len(accepted), "duplicates": sum(item.get("rejectReason") == "exact_duplicate" for item in records), "nearDuplicates": sum(item.get("rejectReason") == "near_duplicate" for item in records), "bySource": dict(Counter(item.get("source", "unknown") for item in records)), "byCountryHint": dict(Counter(item.get("countryHint") or "unknown" for item in records)), "byScriptHint": dict(Counter(script for item in records for script in item.get("scriptHints", ["Unknown"]))), "ocrCandidates": sum(float(item.get("ocrCandidateScore") or 0) >= 0.5 for item in records), "licenseDistribution": dict(Counter(item.get("license", "unknown") for item in records))}
    (output["reports"] / "dataset-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# Dataset report", "", *[f"- **{key}**: {value}" for key, value in report.items()]]; (output["reports"] / "dataset-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8"); return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--root", type=Path, default=ROOT); args = parser.parse_args(); print(json.dumps(build_report(args.root), indent=2))
