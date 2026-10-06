#!/usr/bin/env python3
"""Shrink reviewed high-traffic PNGs in a staged deployment directory.

The source assets in the repository are left untouched. Images with transparency,
poor measured quality, or small size savings retain their original bytes.
"""

import math
import os
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


TARGETS = Path(__file__).with_name("high-traffic-pngs.txt")
MIN_PSNR_DB = 32.0
MIN_SAVING = 0.40


def optimize(path: Path) -> tuple[str, int, int]:
    original_size = path.stat().st_size
    with Image.open(path) as source:
        if source.format != "PNG":
            raise ValueError(f"Expected PNG: {path}")
        if source.convert("RGBA").getchannel("A").getextrema() != (255, 255):
            return "transparent", original_size, original_size
        original = source.convert("RGB")
        palette = original.quantize(
            colors=256,
            method=Image.Quantize.MEDIANCUT,
            dither=Image.Dither.FLOYDSTEINBERG,
        )
        delta = ImageChops.difference(original, palette.convert("RGB"))
        mean_squared_error = sum(value * value for value in ImageStat.Stat(delta).rms) / 3
        psnr = 10 * math.log10(255 * 255 / mean_squared_error) if mean_squared_error else float("inf")

    descriptor, temporary_name = tempfile.mkstemp(suffix=".png", dir=path.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        palette.save(temporary, optimize=True)
        optimized_size = temporary.stat().st_size
        if psnr < MIN_PSNR_DB or optimized_size > original_size * (1 - MIN_SAVING):
            return "quality-or-savings", original_size, original_size
        os.replace(temporary, path)
        return "optimized", original_size, optimized_size
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: optimize-deploy-images.py DIST_DIRECTORY")
    staged = Path(sys.argv[1]).resolve()
    if not staged.is_dir():
        raise SystemExit(f"Staged directory does not exist: {staged}")
    targets = [line.strip() for line in TARGETS.read_text().splitlines() if line.strip() and not line.startswith("#")]
    counts = {"optimized": 0, "transparent": 0, "quality-or-savings": 0, "missing": 0}
    before = after = 0
    for key in targets:
        path = (staged / key).resolve()
        if not path.is_relative_to(staged):
            raise ValueError(f"Invalid image path: {key}")
        if not path.exists():
            counts["missing"] += 1
            continue
        result, old_size, new_size = optimize(path)
        counts[result] += 1
        before += old_size
        after += new_size
        if result == "optimized":
            print(f"optimized {key}: {old_size} -> {new_size} bytes")
    print(f"Image optimization: {counts}; staged bytes: {before} -> {after}")


if __name__ == "__main__":
    main()
