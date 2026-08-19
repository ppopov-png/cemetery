from __future__ import annotations

from collections import Counter
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

from PIL import Image


ALLOWED_LICENSES = {"cc0", "cc by", "cc by 4.0", "cc by-sa", "cc by-sa 4.0", "public domain", "public_domain"}
POSITIVE = ("grave", "graves", "gravestone", "headstone", "tombstone", "cemetery", "burial", "memorial grave")
NEGATIVE = ("accident", "severity", "doji", "candlestick", "game", "zombie", "medical", "gpr", "buried object", "crack severity")
TARGET_CLASSES = ("grave", "graves", "gravestone", "headstone", "tombstone", "grave marker")


def norm(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").casefold().replace("_", " ")).strip()


def license_allowed(value: str | None) -> bool:
    text = norm(value)
    return any(text == item or text.startswith(item + " ") for item in ALLOWED_LICENSES)


def semantic_relevance(*values: object) -> tuple[bool, list[str]]:
    text = norm(" ".join(str(value or "") for value in values))
    negative = [term for term in NEGATIVE if term in text]
    positive = [term for term in POSITIVE if term in text]
    if negative:
        return False, [f"negative concept: {term}" for term in negative]
    if not positive:
        return False, ["no cemetery concept"]
    return True, [f"positive concept: {term}" for term in positive]


def safe_extract(zip_path: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        root = destination.resolve()
        for member in archive.infolist():
            target = (destination / member.filename).resolve()
            if root not in target.parents and target != root:
                raise ValueError(f"Unsafe ZIP member: {member.filename}")
        archive.extractall(destination)


def find_yaml(root: Path) -> Path | None:
    candidates = sorted(root.rglob("data.yaml")) + sorted(root.rglob("data.yml"))
    return candidates[0] if candidates else None


def parse_yaml(path: Path) -> dict:
    """Parse the small YOLO data.yaml subset without requiring PyYAML."""
    result: dict = {}; names: dict[int, str] = {}
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    for position, raw in enumerate(lines):
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line: continue
        key, value = line.split(":", 1); key = key.strip(); value = value.strip().strip("'\"")
        if key == "names" and value.startswith("["):
            result[key] = [item.strip().strip("'\"") for item in value.strip("[]").split(",") if item.strip()]
        elif key.isdigit(): names[int(key)] = value
        elif key in {"train", "val", "test", "path", "nc"}: result[key] = int(value) if key == "nc" else value
    if names: result["names"] = [names[index] for index in sorted(names)]
    if "names" not in result:
        listed = []
        for raw in lines:
            value = raw.strip()
            if value.startswith("-") and not value.startswith("- "): continue
            if value.startswith("- "):
                listed.append(value[2:].strip().strip("'\""))
        if listed: result["names"] = listed
    return result


def find_split_files(root: Path, split: str) -> tuple[Path | None, Path | None]:
    image_dirs = [root / split / "images", root / "images" / split, root / split]
    label_dirs = [root / split / "labels", root / "labels" / split, root / split]
    image_dir = next((item for item in image_dirs if item.is_dir()), None)
    label_dir = next((item for item in label_dirs if item.is_dir()), None)
    return image_dir, label_dir


def image_sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): digest.update(chunk)
    return digest.hexdigest()


def image_signature(path: Path) -> str:
    with Image.open(path) as image:
        image = image.convert("L").resize((16, 16))
        pixels = list(image.getdata()); average = sum(pixels) / len(pixels)
        return "".join("1" if pixel >= average else "0" for pixel in pixels)


def json_write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
