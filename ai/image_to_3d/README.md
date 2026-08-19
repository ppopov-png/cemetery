# Phone → PC reconstruction bridge

The PC server accepts up to six JPEG frames, creates an approximate foreground
mask with `rembg`, generates one approximate GLB per frame with TripoSR, and
returns URLs for the phone UI.

Install server dependencies into the existing TripoSR environment:

```powershell
& .\ai\.venv-triposr\Scripts\python.exe -m pip install -r .\ai\image_to_3d\requirements-server.txt
& .\ai\.venv-triposr\Scripts\python.exe .\ai\image_to_3d\server.py
```

The server listens on `http://0.0.0.0:8080`. Open `http://<PC-LAN-IP>:8080/health`
from the phone to verify it. For the deployed HTTPS PWA, expose this port through
an HTTPS tunnel (Cloudflare Tunnel or a VPN HTTPS gateway); browsers block an
HTTPS page from calling a plain HTTP LAN endpoint.
