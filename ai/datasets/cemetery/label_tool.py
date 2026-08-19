from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent / "yandex_web"
LABELS = ("gravestone", "grave", "memorial_tablet", "cemetery_background", "irrelevant")


def load_items(root: Path) -> list[dict]:
    result = []
    for path in sorted((root / "raw/metadata").glob("*.json")):
        try:
            item = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        filename = item.get("filename")
        if filename and (root / "raw/images" / filename).is_file():
            result.append({"id": path.stem, "filename": filename, "title": item.get("title") or "", "query": item.get("query") or "", "domain": item.get("domain") or "", "sourcePage": item.get("sourcePage") or ""})
    return result


def read_labels(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def write_labels(path: Path, labels: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cemetery dataset labeling</title><style>
body{font-family:system-ui,sans-serif;background:#17191d;color:#eee;max-width:1100px;margin:0 auto;padding:18px}main{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px}img{display:block;max-width:100%;max-height:72vh;margin:auto;background:#000;object-fit:contain}.card{background:#242830;border-radius:12px;padding:14px}.buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}button{border:0;border-radius:8px;padding:13px 8px;font-size:15px;cursor:pointer;background:#3a4656;color:white}button:hover{background:#55708e}.irrelevant{background:#713f45}.skip{background:#555}.meta{color:#b9c0c9;word-break:break-word;font-size:13px;line-height:1.45}.progress{font-size:18px;margin:4px 0 14px}@media(max-width:700px){main{display:block}.side{margin-top:14px}img{max-height:58vh}.buttons{grid-template-columns:1fr 1fr}}
</style></head><body><h1>Cemetery dataset labeling</h1><div class="progress" id="progress"></div><main><section class="card"><img id="photo" alt="dataset image"><div class="buttons"><button data-label="gravestone">Gravestone [1]</button><button data-label="grave">Grave [2]</button><button data-label="memorial_tablet">Tablet [3]</button><button data-label="cemetery_background">Background [4]</button><button class="irrelevant" data-label="irrelevant">Irrelevant [5]</button><button class="skip" id="skip">Skip [Space]</button></div></section><aside class="card side"><div class="meta" id="meta"></div><p>Размечено: классы сохраняются в `reports/labels.json`.</p><p>Горячие клавиши: 1–5, пробел.</p></aside></main><script>
let items=[], labels={}, index=0; const $=id=>document.getElementById(id); async function init(){items=await (await fetch('/api/items')).json(); labels=await (await fetch('/api/labels')).json(); next();} function pending(){return items.filter(x=>!labels[x.id]).length} function next(){while(index<items.length&&labels[items[index].id])index++; if(index>=items.length){$('progress').textContent='Готово. Все изображения размечены.';$('photo').removeAttribute('src');$('meta').textContent='';return}let x=items[index];$('photo').src='/image/'+encodeURIComponent(x.id);$('meta').innerHTML='<b>'+escapeHtml(x.title||'Без названия')+'</b><br>Query: '+escapeHtml(x.query)+'<br>Domain: '+escapeHtml(x.domain)+'<br><a href="'+escapeHtml(x.sourcePage)+'" target="_blank">Source page</a>';$('progress').textContent='Осталось: '+pending()+' | Позиция: '+(index+1)+'/'+items.length;}function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}async function label(value){let x=items[index];if(!x)return;await fetch('/api/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:x.id,label:value})});labels[x.id]=value;index++;next();}document.querySelectorAll('[data-label]').forEach(b=>b.onclick=()=>label(b.dataset.label));$('skip').onclick=()=>{index++;next()};document.onkeydown=e=>{if(e.key>='1'&&e.key<='5')label(['gravestone','grave','memorial_tablet','cemetery_background','irrelevant'][Number(e.key)-1]);if(e.code==='Space'){e.preventDefault();index++;next()}};init();
</script></body></html>"""


def serve(root: Path, host: str, port: int, open_browser: bool) -> None:
    labels_path = root / "reports/labels.json"
    lock = threading.Lock()
    items = load_items(root)

    class Handler(BaseHTTPRequestHandler):
        def send_json(self, value: object, status: int = 200) -> None:
            data = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

        def do_GET(self) -> None:
            path = unquote(urlparse(self.path).path)
            if path == "/":
                data = PAGE.encode("utf-8"); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data); return
            if path == "/api/items": self.send_json(items); return
            if path == "/api/labels": self.send_json(read_labels(labels_path)); return
            if path.startswith("/image/"):
                item = next((x for x in items if x["id"] == path.removeprefix("/image/")), None)
                if not item: self.send_error(404); return
                image = (root / "raw/images" / item["filename"]).resolve()
                if root.joinpath("raw/images").resolve() not in image.parents or not image.is_file(): self.send_error(404); return
                data = image.read_bytes(); self.send_response(200); self.send_header("Content-Type", mimetypes.guess_type(image.name)[0] or "application/octet-stream"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data); return
            self.send_error(404)

        def do_POST(self) -> None:
            if urlparse(self.path).path != "/api/label": self.send_error(404); return
            try: payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            except json.JSONDecodeError: self.send_error(400); return
            if payload.get("id") not in {item["id"] for item in items} or payload.get("label") not in LABELS: self.send_error(400); return
            with lock:
                labels = read_labels(labels_path); labels[payload["id"]] = payload["label"]; write_labels(labels_path, labels)
            self.send_json({"ok": True})

        def log_message(self, *_args) -> None: pass

    server = ThreadingHTTPServer((host, port), Handler)
    url = f"http://{host}:{server.server_port}/"; print(f"Label tool: {url}\nImages: {len(items)}\nLabels: {labels_path}", flush=True)
    if open_browser: webbrowser.open(url)
    try: server.serve_forever()
    except KeyboardInterrupt: print("\nLabel tool stopped. Labels saved.")
    finally: server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local browser labeling tool for the raw bootstrap dataset.")
    parser.add_argument("--root", type=Path, default=ROOT); parser.add_argument("--host", default="127.0.0.1"); parser.add_argument("--port", type=int, default=8765); parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args(); serve(args.root, args.host, args.port, not args.no_open)
