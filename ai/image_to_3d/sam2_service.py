"""Real SAM 2.1 CUDA service for Cemetery Mapper.

The service is deliberately strict: it requires CUDA and real Hugging Face
weights. It never falls back to CPU or heuristic masks.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np
import torch
from PIL import Image
from transformers import pipeline


class SAM2ModelUnavailable(RuntimeError):
    pass


@dataclass
class SAM2State:
    status: str = "NOT_LOADED"
    model_id: str = "facebook/sam2.1-hiera-small"
    device: str = "cuda:0"
    error: str | None = None
    warmup_ms: float | None = None


class SAM2Service:
    def __init__(self) -> None:
        self.model_id = os.getenv("SAM2_MODEL_ID", "facebook/sam2.1-hiera-small")
        self._generator: Any = None
        self._lock = threading.Lock()
        self.state = SAM2State(model_id=self.model_id)

    def ensure_loaded(self) -> Any:
        if self._generator is not None:
            return self._generator
        with self._lock:
            if self._generator is not None:
                return self._generator
            self.state.status = "LOADING"
            self.state.error = None
            if not torch.cuda.is_available():
                return self._fail("CUDA_REQUIRED")
            try:
                start = torch.cuda.Event(enable_timing=True)
                end = torch.cuda.Event(enable_timing=True)
                start.record()
                generator = pipeline(
                    task="mask-generation",
                    model=self.model_id,
                    device=0,
                )
                warmup_image = Image.new("RGB", (256, 256), (32, 32, 32))
                generator(warmup_image)
                end.record()
                torch.cuda.synchronize()
                self.state.warmup_ms = float(start.elapsed_time(end))
                self._generator = generator
                self.state.status = "READY"
                return generator
            except Exception as exc:
                return self._fail(f"{type(exc).__name__}: {exc}")

    def generate(self, image: Image.Image) -> list[dict[str, Any]]:
        generator = self.ensure_loaded()
        if generator is None:
            raise SAM2ModelUnavailable(self.state.error or "SAM2_MODEL_UNAVAILABLE")
        try:
            outputs = generator(image)
            masks = outputs.get("masks", [])
            scores = outputs.get("scores", [])
            result: list[dict[str, Any]] = []
            for mask_value, score_value in zip(masks, scores):
                mask = np.asarray(mask_value, dtype=bool)
                ys, xs = np.where(mask)
                if not len(xs):
                    continue
                result.append({
                    "mask": mask,
                    "score": float(score_value),
                    "area": int(mask.sum()),
                    "bbox": {"x": int(xs.min()), "y": int(ys.min()), "width": int(xs.max() - xs.min() + 1), "height": int(ys.max() - ys.min() + 1)},
                })
            return result
        except Exception as exc:
            raise SAM2ModelUnavailable(f"SAM2_INFERENCE_FAILED: {type(exc).__name__}: {exc}") from exc

    def _fail(self, message: str) -> None:
        self.state.status = "UNAVAILABLE"
        self.state.error = message
        self._generator = None
        return None


sam2_service = SAM2Service()
