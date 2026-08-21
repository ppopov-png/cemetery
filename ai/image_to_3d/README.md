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

## SAM 2.1 CUDA service

The service uses real `facebook/sam2.1-hiera-small` weights on CUDA. The first
SAM2 request downloads the weights from Hugging Face and performs a GPU warm-up.
It does not fall back to CPU or heuristic masks.

```powershell
& .\ai\.venv-triposr\Scripts\python.exe -m uvicorn ai.image_to_3d.server:app --host 0.0.0.0 --port 8080
Invoke-RestMethod http://127.0.0.1:8080/api/sam2/health
```

Run real automatic mask generation with an image:

```powershell
curl.exe -X POST -F "image=@ai/test-input.jpg" http://127.0.0.1:8080/api/sam2/segment
```

Use `SAM2_MODEL_ID=facebook/sam2.1-hiera-large` to select another real SAM 2.1
checkpoint. If CUDA or the weights are unavailable, the API returns
`SAM2_MODEL_UNAVAILABLE`.
