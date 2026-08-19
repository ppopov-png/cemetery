from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import os
import tempfile


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def new_state() -> dict:
    return {
        "status": "running", "queryIndex": 0, "lastQuery": None, "seenUrls": [],
        "accepted": 0, "downloaded": 0, "rejected": 0, "duplicates": 0,
        "discovered": 0, "domains": {}, "acceptedTitles": [], "updatedAt": now_iso()
    }


def load_state(path: Path, resume: bool) -> dict:
    if resume and path.exists():
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            base = new_state(); base.update(value); return base
        except (OSError, json.JSONDecodeError):
            pass
    return new_state()


def save_state(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True); value["updatedAt"] = now_iso()
    fd, temporary = tempfile.mkstemp(prefix="state-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream: json.dump(value, stream, ensure_ascii=False, indent=2)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
