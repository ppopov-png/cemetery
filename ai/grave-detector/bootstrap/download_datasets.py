from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import requests

from dataset_utils import json_write, safe_extract

API = "https://api.roboflow.com"


def api_key() -> str:
    value = os.environ.get("ROBOFLOW_API_KEY")
    if not value: raise RuntimeError("ROBOFLOW_API_KEY is required")
    return value


def identifier(item: dict) -> tuple[str, str, int | str | None]:
    raw = item.get("raw", item); dataset_id = raw.get("id") or raw.get("datasetId") or raw.get("slug")
    if dataset_id and "/" in str(dataset_id):
        workspace, project = str(dataset_id).split("/", 1)
    else:
        workspace = raw.get("workspace") or raw.get("workspaceId") or item.get("workspace"); project = raw.get("project") or raw.get("projectId") or raw.get("name")
    version = raw.get("version") or raw.get("versionNumber") or item.get("version")
    return str(workspace), str(project), version


def export_dataset(item: dict, destination: Path, key: str, format_name: str = "yolov8") -> dict:
    workspace, project, version = identifier(item)
    if version is None:
        metadata = requests.get(f"{API}/{workspace}/{project}", params={"api_key": key}, timeout=30); metadata.raise_for_status(); payload = metadata.json(); project_payload = payload.get("project", payload); versions = project_payload.get("versions") or payload.get("versions") or []
        if isinstance(versions, dict): versions = list(versions.values())
        latest = versions[-1] if versions else {}; version = payload.get("version") or payload.get("latestVersion") or latest.get("version") or latest.get("versionNumber")
    if version is None: raise ValueError(f"No version in Roboflow metadata for {workspace}/{project}")
    dataset_id = f"{workspace}/{project}/{version}"; cache_dir = destination / f"{workspace}__{project}__{version}"; marker = cache_dir / "download.json"
    if marker.exists() and (cache_dir / "extracted").exists(): return json.loads(marker.read_text(encoding="utf-8"))
    response = requests.get(f"{API}/{workspace}/{project}/{version}/{format_name}", params={"api_key": key}, timeout=120); response.raise_for_status()
    content_type = response.headers.get("Content-Type", ""); zip_path = cache_dir / "dataset.zip"; cache_dir.mkdir(parents=True, exist_ok=True)
    if "json" in content_type:
        link = response.json().get("export", {}).get("link") or response.json().get("link")
        if not link: raise ValueError(f"Roboflow export response has no download link for {dataset_id}")
        response = requests.get(link, timeout=300); response.raise_for_status()
    zip_path.write_bytes(response.content); extracted = cache_dir / "extracted"; safe_extract(zip_path, extracted)
    raw = item.get("raw", item); result = {"datasetId": dataset_id, "workspace": workspace, "project": project, "version": version, "format": format_name, "sourceUrl": item.get("url") or raw.get("url") or f"https://universe.roboflow.com/{workspace}/{project}", "license": item.get("license") or raw.get("license"), "classes": item.get("classes") or raw.get("classes") or raw.get("classNames") or [], "imageCount": item.get("imageCount") or raw.get("images") or raw.get("imageCount"), "zip": str(zip_path), "extracted": str(extracted), "downloadedAt": datetime.now(timezone.utc).isoformat(), "bytes": zip_path.stat().st_size}
    json_write(marker, result); return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--manifest", type=Path, required=True); parser.add_argument("--output", type=Path, default=Path("cache")); parser.add_argument("--format", default="yolov8"); args = parser.parse_args(); key = api_key(); manifest = json.loads(args.manifest.read_text(encoding="utf-8")); results = []
    for item in manifest.get("approved", manifest.get("discovered", [])):
        try: results.append(export_dataset(item, args.output, key, args.format)); print(f"downloaded: {results[-1]['datasetId']}")
        except Exception as error: print(f"rejected: {item.get('id') or item.get('raw', {}).get('id')}: {error}")
    json_write(args.output / "downloads.json", {"downloads": results})
