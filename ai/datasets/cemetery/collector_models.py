from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import hashlib
import json
import re


SCRIPT_NAMES = ("Cyrillic", "Latin", "Hebrew", "Greek", "Arabic", "Armenian", "Georgian", "Other", "Unknown")


@dataclass
class SourceRecord:
    dataset_id: str
    source: str
    source_page: str
    original_url: str
    license: str
    license_url: str | None
    license_verified: bool
    author: str | None = None
    title: str | None = None
    description: str | None = None
    categories: list[str] = field(default_factory=list)
    country_hint: str | None = None
    language_hints: list[str] = field(default_factory=lambda: ["unknown"])
    script_hints: list[str] = field(default_factory=lambda: ["Unknown"])
    tags: list[str] = field(default_factory=list)
    contains_people: bool | None = None
    rights_note: str | None = None


@dataclass
class ImageMetadata:
    id: str
    source: str
    sourcePage: str
    originalUrl: str
    license: str
    licenseUrl: str | None
    licenseVerified: bool
    author: str | None
    countryHint: str | None
    languageHints: list[str]
    scriptHints: list[str]
    title: str | None
    description: str | None
    categories: list[str]
    tags: list[str]
    downloadedAt: str
    filename: str | None = None
    mime: str | None = None
    width: int | None = None
    height: int | None = None
    bytes: int | None = None
    sha256: str | None = None
    perceptualHash: str | None = None
    duplicateGroup: str | None = None
    status: str = "raw"
    containsPeople: bool | None = None
    rejectReason: str | None = None
    rightsNote: str | None = None
    predictedScript: str | None = None
    predictedLanguage: str | None = None
    predictionConfidence: float | None = None
    predictionSource: str | None = None

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(source: str, source_id: str | None, original_url: str) -> str:
    value = f"{source}:{source_id or original_url}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()[:24]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"<[^>]+>", " ", str(value))
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def script_hints(text: str | None) -> list[str]:
    if not text:
        return ["Unknown"]
    found: list[str] = []
    for char in text:
        code = ord(char)
        name = "Unknown"
        if "\u0400" <= char <= "\u052f": name = "Cyrillic"
        elif "A" <= char <= "z" or "\u00c0" <= char <= "\u024f": name = "Latin"
        elif "\u0370" <= char <= "\u03ff": name = "Greek"
        elif "\u0590" <= char <= "\u05ff": name = "Hebrew"
        elif "\u0600" <= char <= "\u06ff": name = "Arabic"
        elif "\u0530" <= char <= "\u058f": name = "Armenian"
        elif "\u10a0" <= char <= "\u10ff": name = "Georgian"
        elif code > 127 and char.isalpha(): name = "Other"
        if name not in found and name != "Unknown": found.append(name)
    return found or ["Unknown"]


def infer_language_hint(text: str | None) -> list[str]:
    # Script is a weak hint only; country is never converted into a language label.
    if not text:
        return ["unknown"]
    return ["unknown"]


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))
