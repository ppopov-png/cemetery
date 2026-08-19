from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import requests

from dataset_utils import license_allowed, semantic_relevance

API = "https://api.roboflow.com/universe/search"
QUERIES = ["grave", "graves", "gravestone", "gravestones", "headstone", "headstones", "tombstone", "tombstones", "cemetery", "burial", "grave marker"]


def key() -> str:
    value = os.environ.get("ROBOFLOW_API_KEY")
    if not value: raise RuntimeError("ROBOFLOW_API_KEY is required")
    return value


def as_candidates(payload: dict, query: str) -> list[dict]:
    raw = payload.get("results") or payload.get("datasets") or payload.get("projects") or payload.get("data") or []
    if isinstance(raw, dict): raw = list(raw.values())
    candidates = []
    for item in raw:
        if not isinstance(item, dict): continue
        item = dict(item); item["query"] = query; candidates.append(item)
    return candidates


def discover(queries: list[str], api_key: str) -> dict:
    discovered: list[dict] = []; rejected: list[dict] = []
    for query in queries:
        response = requests.get(API, params={"q": f"{query} object detection", "api_key": api_key}, timeout=30); response.raise_for_status()
        for item in as_candidates(response.json(), query):
            task = item.get("task") or item.get("type") or item.get("projectType") or ""
            classes = item.get("classes") or item.get("classNames") or []
            if isinstance(classes, dict): classes = list(classes)
            license_name = item.get("license") or item.get("licenseType")
            image_count = item.get("images") or item.get("imageCount") or item.get("datasetSize")
            annotation_count = item.get("annotated") or item.get("annotatedImages") or item.get("annotations")
            allowed, reasons = semantic_relevance(item.get("name"), item.get("description"), *classes, item.get("tags"))
            rejection = None
            if str(task).casefold().replace("_", " ") not in {"object detection", "object-detection", "detection"}: rejection = "task is not Object Detection"
            elif image_count is None or int(image_count or 0) <= 0: rejection = "missing image count"
            elif annotation_count is None or int(annotation_count or 0) <= 0: rejection = "missing annotations"
            elif not license_allowed(license_name): rejection = "missing or incompatible license"
            elif not allowed: rejection = "; ".join(reasons)
            record = {"raw": item, "query": query, "task": task, "classes": classes, "license": license_name, "imageCount": image_count, "annotationCount": annotation_count, "semanticReasons": reasons}
            (rejected if rejection else discovered).append({**record, "rejectionReason": rejection} if rejection else record)
    unique: dict[str, dict] = {}
    for item in discovered:
        identifier = item["raw"].get("id") or item["raw"].get("datasetId") or item["raw"].get("slug")
        if identifier: unique[str(identifier)] = item
    return {"generatedAt": datetime.now(timezone.utc).isoformat(), "queries": queries, "discovered": list(unique.values()), "rejected": rejected}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--output", type=Path, default=Path("discovered.json")); parser.add_argument("--query", action="append", dest="queries"); args = parser.parse_args()
    result = discover(args.queries or QUERIES, key()); args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"); print(json.dumps({"discovered": len(result["discovered"]), "rejected": len(result["rejected"])}, indent=2))
