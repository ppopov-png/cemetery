from __future__ import annotations

from dataclasses import asdict, dataclass
from urllib.parse import quote_plus, urlparse
import json
import re
import time

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError


class YandexBlockedOrCaptcha(RuntimeError):
    pass


class YandexDomChanged(RuntimeError):
    pass


@dataclass
class Candidate:
    imageUrl: str
    previewUrl: str | None
    sourcePage: str | None
    title: str | None
    domain: str | None
    query: str
    rank: int
    cardIndex: int | None = None


def _is_blocked(page: Page) -> bool:
    url = page.url.casefold()
    body = (page.locator("body").inner_text(timeout=3000) if page.locator("body").count() else "").casefold()
    markers = ("captcha", "подтвердите, что вы не робот", "робот", "доступ ограничен", "too many requests", "access denied")
    return "showcaptcha" in url or any(marker in body for marker in markers)


def _urls(value: object) -> list[str]:
    found: list[str] = []
    if isinstance(value, str):
        text = value.replace("\\/", "/")
        found.extend(re.findall(r"(?:https?:)?//[^\"'\\\s]+", text))
    elif isinstance(value, dict):
        for item in value.values(): found.extend(_urls(item))
    elif isinstance(value, list):
        for item in value: found.extend(_urls(item))
    return found


def _looks_like_image_url(url: str) -> bool:
    lowered = url.casefold()
    if "yastatic.net/lego" in lowered or "yandex.ru/images/search" in lowered or lowered.startswith("data:"): return False
    return "avatars.mds.yandex.net" in lowered or "get-images" in lowered or any(token in lowered for token in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif"))


def _extract_cards(page: Page, query: str, start_rank: int) -> list[Candidate]:
    raw = page.locator("body").evaluate("""body => {
      const rows = [];
      const nodes = [...body.querySelectorAll('img, a, [data-bem], [data-state], [data-metrika], [data-original], [data-image-url], [data-src]')];
      for (const node of nodes) {
        const parent = node.closest('a') || node.closest('[data-bem]') || node.closest('[data-state]') || node;
        const attrs = {};
        for (const attr of [...parent.attributes, ...node.attributes]) attrs[attr.name] = attr.value;
        const image = node.tagName === 'IMG' ? node : parent.querySelector('img');
        const cardIndex = rows.length;
        parent.setAttribute('data-cemetery-bootstrap-card', String(cardIndex));
        rows.push({cardIndex, attrs, text: (parent.innerText || '').slice(0, 500), img: image ? {src: image.src, alt: image.alt, attrs: [...image.attributes].reduce((a,x)=>(a[x.name]=x.value,a),{})} : null, href: parent.href || null});
      }
      return rows;
    }""")
    candidates: list[Candidate] = []; seen: set[str] = set()
    for row in raw:
        values = []
        for key, value in row.get("attrs", {}).items():
            if key.startswith("data-"):
                try: values.extend(_urls(json.loads(value)))
                except (TypeError, json.JSONDecodeError): values.extend(_urls(value))
        image_data = row.get("img") or {}; values.extend(_urls(image_data.get("attrs", {}))); values.extend(_urls(image_data.get("src")))
        image_values = list(dict.fromkeys(url for url in values if _looks_like_image_url(url)))
        original = next((url for url in image_values if "yandex" not in url.casefold()), None)
        preview = next((url for url in image_values if url != original), None)
        original = original or preview
        if not original or original in seen: continue
        seen.add(original); href = row.get("href"); domain = urlparse(href or original).netloc or None
        title = image_data.get("alt") or row.get("text") or None
        candidates.append(Candidate(original, preview, href, re.sub(r"\s+", " ", title).strip() if title else None, domain, query, start_rank + len(candidates) + 1, row.get("cardIndex")))
    return candidates


def resolve_original_urls(page: Page, candidates: list[Candidate]) -> None:
    """Open cards one at a time and capture the image request made by Yandex."""
    for candidate in candidates:
        if candidate.cardIndex is None or "yandex" not in candidate.imageUrl.casefold():
            continue
        responses: list[tuple[int, str]] = []

        def on_response(response) -> None:
            try:
                if response.request.resource_type != "image": return
                if not response.headers.get("content-type", "").startswith("image/"): return
                if not _looks_like_image_url(response.url): return
                size = int(response.headers.get("content-length", "0") or 0)
                responses.append((size, response.url))
            except (ValueError, KeyError):
                return

        page.on("response", on_response)
        try:
            card = page.locator(f'[data-cemetery-bootstrap-card="{candidate.cardIndex}"]').first
            if not card.count(): continue
            card.scroll_into_view_if_needed(timeout=5000); card.click(timeout=5000); page.wait_for_timeout(800)
            if _is_blocked(page): raise YandexBlockedOrCaptcha("YANDEX_BLOCKED_OR_CAPTCHA")
            if responses:
                _, url = max(responses, key=lambda item: item[0])
                if url != candidate.imageUrl:
                    candidate.previewUrl = candidate.imageUrl; candidate.imageUrl = url; candidate.domain = urlparse(url).netloc or candidate.domain
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)
        except PlaywrightTimeoutError:
            page.keyboard.press("Escape")
        finally:
            page.off("response", on_response)


def collect_query(page: Page, query: str, max_results: int, scroll_delay: float) -> list[Candidate]:
    url = "https://yandex.ru/images/search?text=" + quote_plus(query)
    try: page.goto(url, wait_until="domcontentloaded", timeout=45000); page.wait_for_timeout(1500)
    except PlaywrightTimeoutError as error: raise YandexDomChanged(f"Yandex page load timeout for query: {query}") from error
    if _is_blocked(page): raise YandexBlockedOrCaptcha("YANDEX_BLOCKED_OR_CAPTCHA")
    results: list[Candidate] = []; seen: set[str] = set(); previous_height = 0; stagnant = 0
    for _ in range(80):
        if _is_blocked(page): raise YandexBlockedOrCaptcha("YANDEX_BLOCKED_OR_CAPTCHA")
        for candidate in _extract_cards(page, query, len(results)):
            if candidate.imageUrl not in seen: seen.add(candidate.imageUrl); results.append(candidate)
            if len(results) >= max_results: return results[:max_results]
        height = page.evaluate("document.body.scrollHeight")
        if height == previous_height: stagnant += 1
        else: stagnant = 0
        if stagnant >= 4: break
        previous_height = height; page.evaluate("window.scrollTo(0, document.body.scrollHeight)"); page.wait_for_timeout(int(scroll_delay * 1000))
    if not results: raise YandexDomChanged(f"No image cards detected; Yandex DOM may have changed for query: {query}")
    resolve_original_urls(page, results)
    return results
