from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None


ROOT = Path(__file__).resolve().parent / "yandex_web"


def audit(root: Path) -> dict:
    image_root = root / "raw/images"
    metadata_root = root / "raw/metadata"
    records = []
    missing = []
    broken = []
    bytes_by_sha: Counter[str] = Counter()
    formats: Counter[str] = Counter()
    domains: Counter[str] = Counter()
    queries: Counter[str] = Counter()
    total_bytes = 0

    for metadata_path in sorted(metadata_root.glob("*.json")):
        try:
            item = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            broken.append({"metadata": metadata_path.name, "error": str(error)})
            continue
        filename = item.get("filename")
        image_path = image_root / filename if filename else None
        if not image_path or not image_path.is_file():
            missing.append({"metadata": metadata_path.name, "filename": filename})
            continue
        size = image_path.stat().st_size
        total_bytes += size
        digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
        bytes_by_sha[digest] += 1
        domains[item.get("domain") or "unknown"] += 1
        queries[item.get("query") or "unknown"] += 1
        suffix = image_path.suffix.lower() or ".unknown"
        formats[suffix] += 1
        dimensions = None
        if Image is not None:
            try:
                with Image.open(image_path) as image:
                    image.load()
                    dimensions = {"width": image.width, "height": image.height, "format": image.format}
            except Exception as error:
                broken.append({"metadata": metadata_path.name, "filename": filename, "error": str(error)})
        records.append({"id": metadata_path.stem, "filename": filename, "bytes": size, "sha256": digest, "dimensions": dimensions})

    duplicate_files = sum(count - 1 for count in bytes_by_sha.values() if count > 1)
    report = {
        "root": str(root),
        "metadataCount": len(list(metadata_root.glob("*.json"))),
        "filesFound": len(records),
        "missingFiles": missing,
        "brokenFiles": broken,
        "duplicateFilesBySha256": duplicate_files,
        "totalBytes": total_bytes,
        "formats": dict(formats),
        "domains": dict(domains.most_common()),
        "queries": dict(queries.most_common()),
        "records": records,
    }
    report_root = root / "reports"
    report_root.mkdir(parents=True, exist_ok=True)
    (report_root / "bootstrap-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = [
        "# Bootstrap dataset audit", "", f"- Metadata: {report['metadataCount']}",
        f"- Files found: {report['filesFound']}", f"- Missing files: {len(missing)}",
        f"- Broken files: {len(broken)}", f"- Exact duplicate files: {duplicate_files}",
        f"- Total bytes: {total_bytes}", "", "## Formats", "",
        *[f"- `{key}`: {value}" for key, value in formats.most_common()],
        "", "## Domains", "", *[f"- `{key}`: {value}" for key, value in domains.most_common(30)],
    ]
    (report_root / "bootstrap-audit.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit the raw Yandex bootstrap dataset without deleting files.")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    result = audit(args.root)
    print(json.dumps({key: result[key] for key in ("metadataCount", "filesFound", "missingFiles", "brokenFiles", "duplicateFilesBySha256", "totalBytes")}, ensure_ascii=False, indent=2))
