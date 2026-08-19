from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import hashlib
import json

import requests

from yandex_browser import Candidate


IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/bmp": ".bmp", "image/tiff": ".tif"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): digest.update(chunk)
    return digest.hexdigest()


def reject_reason(candidate: Candidate) -> str | None:
    # Web bootstrap intentionally does not classify image content. Semantic review
    # belongs after collection; only technical validation happens in _download().
    return None


def existing_index(root: Path) -> tuple[set[str], set[str]]:
    shas: set[str] = set(); phashes: set[str] = set()
    for metadata_path in (root / "raw/metadata").glob("*.json"):
        try: item = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError: continue
        if item.get("sha256"): shas.add(item["sha256"])
        if item.get("phash"): phashes.add(item["phash"])
    return shas, phashes


def _download(candidate: Candidate, root: Path, timeout: int = 30) -> dict:
    reason = reject_reason(candidate)
    if reason: return {"status": "rejected", "candidate": asdict(candidate), "reason": reason}
    session = requests.Session(); session.headers.update({"User-Agent": "cemetery-mapper-yandex-web-bootstrap/0.1"})
    temporary: Path | None = None
    errors = []
    urls = list(dict.fromkeys([candidate.imageUrl] + (candidate.alternateUrls or []) + ([candidate.previewUrl] if candidate.previewUrl else [])))
    for image_url in urls:
      try:
        response = session.get(image_url, timeout=timeout, stream=True); response.raise_for_status(); content_type = response.headers.get("Content-Type", "").split(";", 1)[0].casefold()
        suffix = IMAGE_TYPES.get(content_type, Path(urlparse(image_url).path).suffix.casefold()[:5] or ".img")
        temporary = root / "raw/images" / f".tmp-{hashlib.sha256(image_url.encode()).hexdigest()[:20]}{suffix}"
        with temporary.open("wb") as stream:
            for chunk in response.iter_content(1024 * 1024):
                if chunk: stream.write(chunk)
        # Do not reject candidates based on Pillow decoding, dimensions, format,
        # aspect ratio, or semantic heuristics. This stage is a raw web bootstrap:
        # every successfully downloaded response is kept for later review.
        width = 0; height = 0; phash = ""
        digest = sha256(temporary); image_id = digest[:24]; image_path = root / "raw/images" / f"{image_id}{suffix}"; temporary.replace(image_path)
        metadata = {"source": "yandex_images_web", "query": candidate.query, "rank": candidate.rank, "sourcePage": candidate.sourcePage, "imageUrl": image_url, "previewUrl": candidate.previewUrl, "alternateImageUrls": candidate.alternateUrls or [], "domain": candidate.domain, "title": candidate.title, "downloadedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), "width": width, "height": height, "sha256": digest, "phash": phash, "licenseStatus": "unverified", "datasetTier": "web_bootstrap", "filename": image_path.name}
        (root / "raw/metadata" / f"{image_id}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"status": "accepted", "candidate": asdict(candidate), "metadata": metadata}
      except Exception as error:
        errors.append(f"{image_url}: {error}")
        if temporary and temporary.exists(): temporary.unlink(missing_ok=True)
    return {"status": "rejected", "candidate": asdict(candidate), "reason": " | ".join(errors)}


def download_candidates(candidates: list[Candidate], root: Path, workers: int, max_per_domain: int, state: dict) -> dict:
    for path in (root / "raw/images", root / "raw/metadata", root / "rejected", root / "reports", root / "state"): path.mkdir(parents=True, exist_ok=True)
    shas, phashes = existing_index(root); domain_counts: dict[str, int] = dict(state.get("domains", {})); batch_domains: dict[str, int] = {}; accepted = []; rejected = 0; duplicates = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_download, candidate, root): candidate for candidate in candidates}
        for future in as_completed(futures):
            result = future.result(); candidate = futures[future]; domain = candidate.domain or urlparse(candidate.sourcePage or "").netloc or "unknown"
            if result["status"] == "rejected":
                rejected += 1; (root / "rejected" / f"{hashlib.sha256(candidate.imageUrl.encode()).hexdigest()[:24]}.json").write_text(json.dumps({**asdict(candidate), "reason": result["reason"]}, ensure_ascii=False, indent=2), encoding="utf-8"); continue
            metadata = result["metadata"]
            if domain_counts.get(domain, 0) >= max_per_domain or metadata["sha256"] in shas or (metadata["phash"] and metadata["phash"] in phashes):
                duplicates += 1; (root / "raw/images" / metadata["filename"]).unlink(missing_ok=True); (root / "raw/metadata" / f"{metadata['sha256']}.json").unlink(missing_ok=True); continue
            domain_counts[domain] = domain_counts.get(domain, 0) + 1; batch_domains[domain] = batch_domains.get(domain, 0) + 1; shas.add(metadata["sha256"]); phashes.add(metadata["phash"]); accepted.append(metadata)
    state["downloaded"] = state.get("downloaded", 0) + len(accepted); state["accepted"] = state.get("accepted", 0) + len(accepted); state["rejected"] = state.get("rejected", 0) + rejected; state["duplicates"] = state.get("duplicates", 0) + duplicates
    state["domains"] = domain_counts
    return {"accepted": accepted, "rejected": rejected, "duplicates": duplicates, "domains": batch_domains}
