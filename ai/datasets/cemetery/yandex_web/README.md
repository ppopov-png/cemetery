# Yandex Images web bootstrap collector

This collector uses the ordinary public Yandex Images web interface through Playwright + Chromium. It does not use Yandex Search API, Brave API, Google API, Wikimedia as the primary source, stealth plugins, fingerprint changes, proxies, CAPTCHA solving, login-wall bypasses, or rate-limit bypasses.

## Install and run on Windows

```powershell
cd ai/datasets/cemetery/yandex_web
pip install playwright pillow imagehash requests
playwright install chromium

python collect_yandex.py --limit 30 --headed
python collect_yandex.py --limit 100 --headed
python collect_yandex.py --limit 5000
python collect_yandex.py --limit 5000 --resume
```

The default browser mode is headless. `--headed` is only for diagnosing page access or DOM changes. Supported controls are `--max-per-query 100`, `--max-per-domain 150`, `--workers 8`, `--scroll-delay 0.8`, `--headed`, and `--resume`.

If Yandex presents CAPTCHA, an access block, or a rate-limit page, the collector writes state and exits with `YANDEX_BLOCKED_OR_CAPTCHA`. It never attempts to solve or bypass the restriction. A changed page structure exits with `YANDEX_DOM_CHANGED` instead of silently downloading unknown content.

## Output and policy

Downloaded files are stored under this directory in `raw/images/`, with metadata in `raw/metadata/`. `cleaned/images/`, `cleaned/metadata/`, `rejected/`, `reports/`, and `state/` are prepared for later stages. All accepted web candidates have `licenseStatus: unverified` and `datasetTier: web_bootstrap`; no license is inferred from a search result.

Images must decode in Pillow, be at least 500x500, and have a reasonable aspect ratio. Obvious maps, schemes, aerial/drone imagery, logos, favicons, and thumbnails are rejected. The collector does not try to decide whether an image contains a grave, and it creates no bounding boxes, OCR, or training artifacts. Exact SHA-256 and pHash duplicates are not stored again.

State is saved after each query and after each download batch. Ctrl+C saves `state/collector-state.json`. Resume skips URLs already seen and continues from the last query.
