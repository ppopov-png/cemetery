from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

import requests

from collector_models import ImageMetadata, load_json, now_iso, sha256_file
from sources import DatasetSource, FlickrCommonsSource, OpenImagesSource, WikimediaCommonsSource, resilient_session


ROOT = Path(__file__).resolve().parent


def paths(root: Path = ROOT) -> dict[str, Path]:
    result = {name: root / name for name in ("raw/images", "raw/metadata", "cleaned/images", "cleaned/metadata", "rejected", "reports", "detector_staging/images", "detector_staging/proposed_labels", "detector_staging/verified_labels", "ocr_staging/images", "ocr_staging/crops", "ocr_staging/proposed_text", "ocr_staging/verified_text")}
    for path in result.values(): path.mkdir(parents=True, exist_ok=True)
    return result


def build_source(name: str, open_images_csv: Path | None) -> DatasetSource:
    if name == "wikimedia": return WikimediaCommonsSource()
    if name == "open_images":
        if not open_images_csv: raise ValueError("--metadata-csv is required for Open Images")
        return OpenImagesSource(open_images_csv)
    if name == "flickr": return FlickrCommonsSource()
    raise ValueError(f"Unknown source: {name}")


def collect(source: DatasetSource, query: str, country: str | None, limit: int, root: Path = ROOT, delay: float = 0.5) -> dict:
    output = paths(root); existing = {path.stem for path in output["raw/metadata"].glob("*.json")}; stats = {"source": source.name, "query": query, "country": country, "requested": limit, "downloaded": 0, "skippedExisting": 0, "rejected": 0, "errors": 0}
    session = resilient_session(); session.headers.update({"User-Agent": "cemetery-mapper-dataset-collector/0.1"})
    for record in source.search(query, country, limit):
        if record.dataset_id in existing: stats["skippedExisting"] += 1; continue
        metadata_path = output["raw/metadata"] / f"{record.dataset_id}.json"
        try:
            response = session.get(record.original_url, timeout=60, stream=True); response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
            if content_type and not content_type.startswith("image/"): raise ValueError(f"Not an image content type: {content_type}")
            suffix = extension(content_type, record.original_url); image_path = output["raw/images"] / f"{record.dataset_id}{suffix}"
            with image_path.open("wb") as stream:
                for chunk in response.iter_content(1024 * 1024):
                    if chunk: stream.write(chunk)
            metadata = ImageMetadata(id=record.dataset_id, source=record.source, sourcePage=record.source_page, originalUrl=record.original_url, license=record.license, licenseUrl=record.license_url, licenseVerified=record.license_verified, author=record.author, countryHint=record.country_hint, languageHints=record.language_hints, scriptHints=record.script_hints, title=record.title, description=record.description, categories=record.categories, tags=record.tags, downloadedAt=now_iso(), filename=image_path.name, bytes=image_path.stat().st_size, rightsNote=record.rights_note)
            metadata.sha256 = sha256_file(image_path); metadata_path.write_text(json.dumps(metadata.to_json(), ensure_ascii=False, indent=2), encoding="utf-8"); existing.add(record.dataset_id); stats["downloaded"] += 1
        except Exception as error:
            stats["errors"] += 1; (output["rejected"] / f"{record.dataset_id}.json").write_text(json.dumps({"id": record.dataset_id, "source": record.source, "url": record.original_url, "reason": str(error)}, ensure_ascii=False, indent=2), encoding="utf-8")
        time.sleep(delay)
    report_path = output["reports"] / f"collect-{int(time.time())}.json"; report_path.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"); return stats


def extension(content_type: str, url: str) -> str:
    known = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/tiff": ".tif", "image/gif": ".gif"}
    return known.get(content_type, Path(url.split("?")[0]).suffix.lower()[:5] or ".bin")


def main():
    parser = argparse.ArgumentParser(description="Collect licensed cemetery image candidates with provenance.")
    parser.add_argument("--source", choices=["wikimedia", "open_images", "flickr"], default="wikimedia")
    parser.add_argument("--query", default="gravestones")
    parser.add_argument("--country")
    parser.add_argument("--profile", choices=["russia_priority", "global_multilingual"])
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--metadata-csv", type=Path)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()
    profiles = load_json(ROOT / "profiles.json", {})
    if args.profile:
        profile = profiles[args.profile]; queries = profile["queries"]; countries = profile["countries"]
        for country in countries:
            for query in queries:
                if args.limit <= 0: return
                stats = collect(build_source(args.source, args.metadata_csv), query, country, min(args.limit, 50), args.root, args.delay); args.limit -= stats["downloaded"]
    else:
        print(json.dumps(collect(build_source(args.source, args.metadata_csv), args.query, args.country, args.limit, args.root, args.delay), indent=2))


if __name__ == "__main__": main()
