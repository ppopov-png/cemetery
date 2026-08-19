from __future__ import annotations

import argparse
from pathlib import Path
import json
import sys

from playwright.sync_api import sync_playwright

from download_images import download_candidates
from state import load_state, save_state
from yandex_browser import YandexBlockedOrCaptcha, YandexDomChanged, collect_query


ROOT = Path(__file__).resolve().parent


def queries() -> list[str]:
    bank = json.loads((ROOT / "query_bank_ru.json").read_text(encoding="utf-8")); values = list(bank["baseQueries"]) + list(bank["namedQueries"])
    values.extend(template.format(city=city) for city in bank["cities"] for template in bank["cityTemplates"])
    return list(dict.fromkeys(values))


def print_progress(query: str, state: dict, discovered: int = 0) -> None:
    print(f"\nQuery: {query}\nResults discovered: {discovered}\nDownloaded: {state.get('downloaded', 0)}\nRejected: {state.get('rejected', 0)}\nDuplicates: {state.get('duplicates', 0)}\nTotal unique: {state.get('accepted', 0)}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect web image candidates from Yandex Images without API keys."); parser.add_argument("--limit", type=int, default=5000); parser.add_argument("--max-per-query", type=int, default=100); parser.add_argument("--max-per-domain", type=int, default=150); parser.add_argument("--workers", type=int, default=8); parser.add_argument("--scroll-delay", type=float, default=0.8); parser.add_argument("--headed", action="store_true"); parser.add_argument("--resume", action="store_true"); args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(errors="replace")
    output = ROOT; state_path = output / "state/collector-state.json"; state = load_state(state_path, args.resume); all_queries = queries(); start = min(int(state.get("queryIndex", 0)), len(all_queries))
    browser = None
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=not args.headed); page = browser.new_page(viewport={"width": 1280, "height": 900}, locale="ru-RU")
            for index in range(start, len(all_queries)):
                if state.get("accepted", 0) >= args.limit: break
                query = all_queries[index]; state["queryIndex"] = index; state["lastQuery"] = query; save_state(state_path, state); print_progress(query, state)
                try: candidates = collect_query(page, query, args.max_per_query, args.scroll_delay)
                except YandexBlockedOrCaptcha:
                    state["status"] = "YANDEX_BLOCKED_OR_CAPTCHA"; save_state(state_path, state); print("YANDEX_BLOCKED_OR_CAPTCHA\nState saved. Run later to resume."); return 2
                except YandexDomChanged as error:
                    state["status"] = "YANDEX_DOM_CHANGED"; save_state(state_path, state); print(f"YANDEX_DOM_CHANGED: {error}"); return 3
                except Exception as error:
                    state["status"] = "YANDEX_DOM_CHANGED"; state["error"] = str(error); save_state(state_path, state); print(f"YANDEX_DOM_CHANGED: {error}"); return 3
                seen = set(state.get("seenUrls", [])); unseen = [candidate for candidate in candidates if candidate.imageUrl not in seen]; state["discovered"] = state.get("discovered", 0) + len(unseen); state["seenUrls"] = list(dict.fromkeys(state.get("seenUrls", []) + [candidate.imageUrl for candidate in candidates])); save_state(state_path, state); print_progress(query, state, len(candidates))
                remaining = max(0, args.limit - state.get("accepted", 0)); result = download_candidates(unseen[:remaining], output, args.workers, args.max_per_domain, state); state["acceptedTitles"] = (state.get("acceptedTitles", []) + [item.get("title") for item in result["accepted"] if item.get("title")])[:20]; state["queryIndex"] = index + 1; save_state(state_path, state); print_progress(query, state, len(candidates))
            state["status"] = "completed"; save_state(state_path, state); (output / "reports" / "latest.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"); return 0
    except KeyboardInterrupt:
        state["status"] = "interrupted"; save_state(state_path, state); print("\nInterrupted. State saved."); return 130
    finally:
        if browser:
            try: browser.close()
            except Exception: pass


if __name__ == "__main__": raise SystemExit(main())
