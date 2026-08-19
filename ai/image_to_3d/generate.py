from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


AI_ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = AI_ROOT / "third_party/triposr"
PYTHON = AI_ROOT / ".venv-triposr/Scripts/python.exe"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate an approximate GLB model from one image using TripoSR.")
    parser.add_argument("--input", type=Path, required=True, help="Input image path")
    parser.add_argument("--output-dir", type=Path, default=AI_ROOT / "3d-output", help="Output directory")
    parser.add_argument("--mc-resolution", type=int, default=128)
    parser.add_argument("--chunk-size", type=int, default=4096)
    parser.add_argument("--no-remove-bg", action="store_true", help="Keep the original background")
    args = parser.parse_args()

    if not PYTHON.is_file():
        raise SystemExit(f"TripoSR environment not found: {PYTHON}")
    if not args.input.is_file():
        raise SystemExit(f"Input image not found: {args.input}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    command = [
        str(PYTHON), str(MODEL_ROOT / "run.py"), str(args.input.resolve()),
        "--output-dir", str(args.output_dir.resolve()), "--model-save-format", "glb",
        "--mc-resolution", str(args.mc_resolution), "--chunk-size", str(args.chunk_size),
        "--device", "cuda:0",
    ]
    if args.no_remove_bg:
        command.append("--no-remove-bg")
    return subprocess.run(command, cwd=AI_ROOT).returncode


if __name__ == "__main__":
    raise SystemExit(main())
