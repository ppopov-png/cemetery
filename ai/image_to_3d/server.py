"""LAN/HTTPS-tunnel API for the phone -> PC reconstruction loop.

Run with the TripoSR virtual environment. This is an approximate foreground
mask and single-image mesh pipeline, not a metric multi-view reconstruction.
"""
from __future__ import annotations

import argparse, json, threading, uuid
from io import BytesIO
from pathlib import Path
from typing import Any

import cv2, numpy as np
import rembg, torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from transformers import AutoImageProcessor, DepthAnythingForDepthEstimation

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
depth_model = None
depth_processor = None
model_lock = threading.Lock()


@app.get("/health")
def health():
    return {"ok": True, "modelLoaded": model is not None, "depthModelLoaded": depth_model is not None, "cuda": torch.cuda.is_available()}

@app.post("/api/mapping/start")
def start_mapping():
    session_id = uuid.uuid4().hex
    mapping_sessions[session_id] = {"sessionId": session_id, "status": "active", "frames": 0, "features": 0, "mapPoints": 0, "pose": None, "points": [], "voxels": {}}
    return {"sessionId": session_id}

@app.post("/api/mapping/{session_id}/frame")
async def mapping_frame(session_id: str, frame: UploadFile = File(...), pose: str = Form(...)):
    session = mapping_sessions.get(session_id)
    if not session or session["status"] != "active": raise HTTPException(409, "Mapping session is not active")
    try:
        camera_pose = json.loads(pose)
        if not all(key in camera_pose for key in ("position", "quaternion")): raise ValueError("pose must contain position and quaternion")
        image = Image.open(BytesIO(await frame.read())).convert("RGB")
        points = estimate_depth_points(image, camera_pose)
    except Exception as exc:
        raise HTTPException(422, f"DEPTH_MAPPING_FAILED: {type(exc).__name__}: {exc}") from exc
    session["frames"] += 1; session["pose"] = camera_pose; session["points"] = fuse_voxels(session["voxels"], points); session["mapPoints"] = len(session["points"])
    return {"sessionId": session_id, "status": "active", "frame": session["frames"], "features": 0, "matches": 0, "mapPoints": session["mapPoints"], "points": session["points"], "pose": camera_pose}

@app.post("/api/mapping/{session_id}/stop")
def stop_mapping(session_id: str):
    session = mapping_sessions.get(session_id)
    if not session: return {"status": "failed", "message": "Unknown mapping session"}
    session["status"] = "completed"; session.pop("voxels", None); return session


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
    global model, rembg_session, depth_model, depth_processor
    if model is None:
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
        model.renderer.set_chunk_size(4096)
        model.to(device)
        rembg_session = rembg.new_session()
    if depth_model is None:
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        depth_processor = AutoImageProcessor.from_pretrained("depth-anything/Depth-Anything-V2-Small-hf")
        depth_model = DepthAnythingForDepthEstimation.from_pretrained("depth-anything/Depth-Anything-V2-Small-hf").to(device).eval()

def estimate_depth_points(image: Image.Image, pose: dict[str, Any]) -> list[tuple[float, float, float, float, float, float]]:
    if depth_model is None or depth_processor is None: raise RuntimeError("Depth Anything model is not loaded")
    width, height = image.size
    inputs = depth_processor(images=image, return_tensors="pt")
    device = next(depth_model.parameters()).device
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode(): prediction = depth_model(**inputs).predicted_depth
    prediction = torch.nn.functional.interpolate(prediction.unsqueeze(1), size=(height, width), mode="bicubic", align_corners=False).squeeze().detach().float().cpu().numpy()
    prediction = (prediction - prediction.min()) / max(float(prediction.max() - prediction.min()), 1e-6)
    pixels = np.asarray(image); focal = float(max(width, height)); cx, cy = width / 2, height / 2; q = pose["quaternion"]; p = pose["position"]; result = []
    for y in range(0, height, 8):
        for x in range(0, width, 8):
            depth = float(prediction[y, x]); z = 0.3 + (1.0 - depth) * 2.0
            local = np.array([(x - cx) * z / focal, -(y - cy) * z / focal, z], dtype=np.float32)
            world = rotate_by_quaternion(local, q) + np.asarray(p, dtype=np.float32)
            r, g, b = pixels[y, x] / 255.0; result.append((float(world[0]), float(world[1]), float(world[2]), float(r), float(g), float(b)))
    return result

def rotate_by_quaternion(vector: np.ndarray, q: list[float]) -> np.ndarray:
    x, y, z, w = q; qv = np.array([x, y, z], dtype=np.float32)
    return vector + 2.0 * np.cross(qv, np.cross(qv, vector) + w * vector)

def fuse_voxels(voxels: dict[str, dict[str, float]], points: list[tuple[float, float, float, float, float, float]]) -> list[list[float]]:
    size = 0.08
    for x, y, z, r, g, b in points:
        key = f"{int(np.floor(x / size))}:{int(np.floor(y / size))}:{int(np.floor(z / size))}"; old = voxels.get(key)
        if old is None: voxels[key] = {"x": x, "y": y, "z": z, "r": r, "g": g, "b": b, "n": 1}
        else:
            n = old["n"] + 1
            for name, value in (("x", x), ("y", y), ("z", z), ("r", r), ("g", g), ("b", b)): old[name] += (value - old[name]) / n
            old["n"] = n
    return [[v["x"], v["y"], v["z"]] for v in voxels.values()]


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
