from __future__ import annotations

import csv
import html
import os
from pathlib import Path
from typing import Iterator

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from collector_models import SourceRecord, clean_text, infer_language_hint, script_hints, stable_id


class DatasetSource:
    name: str

    def search(self, query: str, country: str | None, limit: int) -> Iterator[SourceRecord]:
        raise NotImplementedError


def resilient_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(total=4, connect=4, read=4, backoff_factor=1.0, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=frozenset({"GET"}))
    session.mount("https://", HTTPAdapter(max_retries=retry)); session.mount("http://", HTTPAdapter(max_retries=retry))
    return session


ALLOWED_LICENSES = {
    "cc0", "cc by", "cc by 4.0", "cc by-sa", "cc by-sa 4.0", "public domain", "public domain mark", "pdm", "no known copyright restrictions"
}


def license_allowed(license_name: str | None, license_url: str | None) -> bool:
    value = " ".join((license_name or "", license_url or "")).lower()
    if any(token in value for token in ("noncommercial", "non-commercial", "nc", "no derivatives", "no-derivatives", "nd")):
        return False
    return any(item in value for item in ALLOWED_LICENSES)


class WikimediaCommonsSource(DatasetSource):
    name = "wikimedia_commons"
    endpoint = "https://commons.wikimedia.org/w/api.php"

    def __init__(self, session: requests.Session | None = None):
        self.session = session or resilient_session()
        self.session.headers.update({"User-Agent": "cemetery-mapper-dataset-collector/0.1 (research tool)"})

    def search(self, query: str, country: str | None, limit: int) -> Iterator[SourceRecord]:
        remaining = limit
        continuation: dict[str, str] = {}
        while remaining > 0:
            batch = min(50, remaining)
            params = {
                "action": "query", "format": "json", "formatversion": "2", "generator": "search",
                "gsrsearch": query, "gsrnamespace": "6", "gsrlimit": batch,
                "prop": "imageinfo|categories", "iiprop": "url|size|mime|sha1|timestamp|user|extmetadata",
                "iiurlwidth": 1920, "cllimit": "max", **continuation,
            }
            response = self.session.get(self.endpoint, params=params, timeout=30)
            response.raise_for_status()
            payload = response.json()
            pages = payload.get("query", {}).get("pages", [])
            if not pages:
                break
            for page in pages:
                record = self._record(page, country)
                if record:
                    yield record
                    remaining -= 1
                    if remaining <= 0:
                        return
            continuation = payload.get("continue", {})
            if not continuation:
                break

    def _record(self, page: dict, country: str | None) -> SourceRecord | None:
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        license_name = clean_text(field(meta, "LicenseShortName") or field(meta, "UsageTerms"))
        license_url = clean_text(field(meta, "LicenseUrl"))
        if not license_allowed(license_name, license_url):
            return None
        original_url = info.get("url")
        if not original_url:
            return None
        categories = [clean_text(item.get("title")) for item in page.get("categories", [])]
        categories = [item for item in categories if item]
        title = clean_text(field(meta, "ObjectName") or page.get("title"))
        description = clean_text(field(meta, "ImageDescription") or field(meta, "Credit"))
        text = " ".join(filter(None, [title, description, *categories]))
        source_id = info.get("sha1") or page.get("pageid")
        return SourceRecord(
            dataset_id=stable_id(self.name, str(source_id) if source_id else None, original_url), source=self.name,
            source_page=f"https://commons.wikimedia.org/wiki/{str(page.get('title', '')).replace(' ', '_')}", original_url=original_url,
            license=license_name or "unknown", license_url=license_url, license_verified=True,
            author=clean_text(field(meta, "Artist") or info.get("user")), title=title, description=description,
            categories=categories, country_hint=country, language_hints=infer_language_hint(text), script_hints=script_hints(text), tags=categories,
            rights_note="License read from Wikimedia Commons imageinfo extmetadata.",
        )


class OpenImagesSource(DatasetSource):
    name = "open_images"

    def __init__(self, metadata_csv: Path):
        self.metadata_csv = metadata_csv

    def search(self, query: str, country: str | None, limit: int) -> Iterator[SourceRecord]:
        if not self.metadata_csv.exists():
            raise FileNotFoundError(f"Open Images metadata CSV not found: {self.metadata_csv}")
        query_terms = {term.lower() for term in query.split() if term.strip()}
        with self.metadata_csv.open("r", encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                searchable = " ".join(row.get(key, "") for key in ("Title", "Description", "ImageID", "OriginalLandingURL")).lower()
                if query_terms and not any(term in searchable for term in query_terms):
                    continue
                original_url = row.get("OriginalURL") or row.get("Thumbnail300KURL")
                if not original_url:
                    continue
                license_name = row.get("License") or "CC BY 2.0 (Open Images metadata; verify per image)"
                license_url = "https://creativecommons.org/licenses/by/2.0/"
                yield SourceRecord(
                    dataset_id=stable_id(self.name, row.get("ImageID"), original_url), source=self.name,
                    source_page=row.get("OriginalLandingURL") or original_url, original_url=original_url,
                    license=license_name, license_url=license_url, license_verified=False,
                    author=clean_text(row.get("Author")), title=clean_text(row.get("Title")), description=clean_text(row.get("Description")),
                    categories=[], country_hint=country, language_hints=["unknown"], script_hints=script_hints(row.get("Title")),
                    rights_note="Open Images metadata warns that image license status must be verified independently.",
                )
                limit -= 1
                if limit <= 0:
                    return


class FlickrCommonsSource(DatasetSource):
    name = "flickr_commons"
    endpoint = "https://www.flickr.com/services/rest/"
    license_map = {4: ("CC BY", "https://creativecommons.org/licenses/by/4.0/"), 5: ("CC BY-SA", "https://creativecommons.org/licenses/by-sa/4.0/"), 7: ("No known copyright restrictions", None), 8: ("US Government Work", None), 9: ("Public Domain Dedication", "https://creativecommons.org/publicdomain/zero/1.0/"), 10: ("Public Domain Mark", "https://creativecommons.org/publicdomain/mark/1.0/")}

    def __init__(self, api_key: str | None = None, session: requests.Session | None = None):
        self.api_key = api_key or os.environ.get("FLICKR_API_KEY")
        self.session = session or resilient_session()
        if not self.api_key:
            raise RuntimeError("Flickr Commons requires FLICKR_API_KEY; source is optional and was not enabled.")

    def search(self, query: str, country: str | None, limit: int) -> Iterator[SourceRecord]:
        params = {"method": "flickr.photos.search", "api_key": self.api_key, "text": query, "is_commons": 1, "license": "4,5,7,8,9,10", "content_type": 1, "media": "photos", "per_page": min(limit, 500), "format": "json", "nojsoncallback": 1, "extras": "url_c,license,owner_name,date_taken"}
        response = self.session.get(self.endpoint, params=params, timeout=30); response.raise_for_status()
        for photo in response.json().get("photos", {}).get("photo", []):
            license_id = int(photo.get("license", 0)); license_name, license_url = self.license_map.get(license_id, ("unknown", None))
            original_url = photo.get("url_c")
            if not original_url or not license_allowed(license_name, license_url):
                continue
            source_page = f"https://www.flickr.com/photos/{photo.get('owner')}/{photo.get('id')}"
            yield SourceRecord(dataset_id=stable_id(self.name, photo.get("id"), original_url), source=self.name, source_page=source_page, original_url=original_url, license=license_name, license_url=license_url, license_verified=True, author=clean_text(photo.get("ownername")), title=clean_text(photo.get("title")), country_hint=country, language_hints=["unknown"], script_hints=script_hints(photo.get("title")), rights_note="License read from Flickr API response.")


def field(metadata: dict, key: str):
    value = metadata.get(key)
    if isinstance(value, dict):
        return value.get("value")
    return value
