"""LAN/HTTPS-tunnel API for the phone -> PC reconstruction loop.

Run with the TripoSR virtual environment. This is an approximate foreground
mask and single-image mesh pipeline, not a metric multi-view reconstruction.
"""
from __future__ import annotations

import argparse, threading, uuid
from pathlib import Path
from typing import Any

import cv2, numpy as np
import rembg, torch
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image

AI_ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = AI_ROOT / "third_party" / "triposr"
JOBS_ROOT = AI_ROOT / "3d-jobs"
import sys
sys.path.insert(0, str(MODEL_ROOT))
from tsr.system import TSR
from tsr.utils import remove_background, resize_foreground

app = FastAPI(title="Cemetery Mapper reconstruction API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
JOBS_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=JOBS_ROOT), name="files")
jobs: dict[str, dict[str, Any]] = {}
mapping_sessions: dict[str, dict[str, Any]] = {}
model = None
rembg_session = None
model_lock = threading.Lock()


@app.get("/health")
def health():
    return {"ok": True, "modelLoaded": model is not None, "cuda": torch.cuda.is_available()}

@app.post("/api/mapping/start")
def start_mapping():
    session_id = uuid.uuid4().hex
    mapping_sessions[session_id] = {"sessionId": session_id, "status": "active", "frames": 0, "features": 0, "mapPoints": 0, "pose": {"x": 0.0, "y": 0.0, "z": 0.0}, "previous": None}
    return {"sessionId": session_id}

@app.post("/api/mapping/{session_id}/frame")
async def mapping_frame(session_id: str, frame: UploadFile = File(...)):
    session = mapping_sessions.get(session_id)
    if not session or session["status"] != "active": return {"status": "failed", "message": "Mapping session is not active"}
    image = cv2.imdecode(np.frombuffer(await frame.read(), np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None: return {"status": "failed", "message": "Invalid image"}
    orb = cv2.ORB_create(nfeatures=900); keypoints, descriptors = orb.detectAndCompute(image, None); matches = []
    if session["previous"] is not None and descriptors is not None and session["previous"][1] is not None:
        raw = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(session["previous"][1], descriptors, k=2)
        matches = [m for m, n in raw if m.distance < 0.75 * n.distance]
        if len(matches) >= 8:
            old = np.float32([session["previous"][0][m.queryIdx].pt for m in matches]); new = np.float32([keypoints[m.trainIdx].pt for m in matches]); matrix, _ = cv2.estimateAffinePartial2D(old, new, method=cv2.RANSAC)
            if matrix is not None: session["pose"]["x"] += float(matrix[0, 2] / max(1, image.shape[1])); session["pose"]["y"] += float(matrix[1, 2] / max(1, image.shape[0])); session["pose"]["z"] += float(1.0 - matrix[0, 0])
    session["previous"] = (keypoints, descriptors); session["frames"] += 1; session["features"] = len(keypoints); session["mapPoints"] += len(matches)
    return {"sessionId": session_id, "status": "active", "frame": session["frames"], "features": session["features"], "matches": len(matches), "mapPoints": session["mapPoints"], "pose": session["pose"]}

@app.post("/api/mapping/{session_id}/stop")
def stop_mapping(session_id: str):
    session = mapping_sessions.get(session_id)
    if not session: return {"status": "failed", "message": "Unknown mapping session"}
    session["status"] = "completed"; session.pop("previous", None); return session


@app.post("/api/scan")
async def create_scan(images: list[UploadFile] = File(...)):
    if not images or len(images) > 6:
        return {"error": "Send between 1 and 6 images"}
    job_id = uuid.uuid4().hex
    root = JOBS_ROOT / job_id
    input_dir = root / "input"
    input_dir.mkdir(parents=True)
    paths = []
    for index, upload in enumerate(images):
        path = input_dir / f"{index}.jpg"
        path.write_bytes(await upload.read())
        paths.append(path)
    jobs[job_id] = {"jobId": job_id, "status": "queued", "progress": 0, "objects": [], "framesReceived": len(paths)}
    threading.Thread(target=process_job, args=(job_id, paths), daemon=True).start()
    return {"jobId": job_id}


@app.get("/api/scan/{job_id}")
def scan_status(job_id: str):
    return jobs.get(job_id, {"status": "failed", "message": "Unknown job"})


def load_model():
    global model, rembg_session
    if model is None:
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
        model.renderer.set_chunk_size(4096)
        model.to(device)
        rembg_session = rembg.new_session()


def process_job(job_id: str, paths: list[Path]):
    root = JOBS_ROOT / job_id
    try:
        jobs[job_id].update(status="processing", progress=1)
        with model_lock:
            load_model()
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
            # Fast path: return one usable reconstruction quickly. The remaining
            # views are retained on disk for the future multi-view fusion stage.
            paths = paths[:1]
            for index, path in enumerate(paths):
                output = root / str(index)
                output.mkdir(parents=True, exist_ok=True)
                original = Image.open(path).convert("RGB")
                rgba = remove_background(original, rembg_session)
                alpha = rgba.getchannel("A")
                alpha.save(output / "mask.png")
                bbox = alpha.getbbox() or (0, 0, original.width, original.height)
                image = resize_foreground(rgba, 0.85)
                arr = np.array(image).astype(np.float32) / 255.0
                arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
                prepared = Image.fromarray((arr * 255.0).astype(np.uint8))
                prepared.save(output / "input.png")
                with torch.no_grad():
                    codes = model([prepared], device=device)
                mesh = model.extract_mesh(codes, True, resolution=64)[0]
                mesh.export(output / "mesh.glb")
                jobs[job_id]["objects"].append({
                    "id": f"object-{index}", "imageIndex": index,
                    "imageUrl": f"/files/{job_id}/input/{index}.jpg",
                    "maskUrl": f"/files/{job_id}/{index}/mask.png",
                    "modelUrl": f"/files/{job_id}/{index}/mesh.glb",
                    "bbox": {"x": bbox[0] / original.width, "y": bbox[1] / original.height, "width": (bbox[2] - bbox[0]) / original.width, "height": (bbox[3] - bbox[1]) / original.height},
                })
                jobs[job_id]["progress"] = round((index + 1) / len(paths) * 100)
        jobs[job_id]["status"] = "completed"
    except Exception as exc:
        jobs[job_id].update(status="failed", message=f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    load_model()
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)
