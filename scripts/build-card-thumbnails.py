#!/usr/bin/env python3
"""Build small WebP article-card images while retaining full-size OG assets."""

import sys
from pathlib import Path

from PIL import Image, ImageOps


WIDTHS = (360, 720)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build-card-thumbnails.py DIST_DIRECTORY")
    staged = Path(sys.argv[1]).resolve()
    source_dir = staged / "og"
    if not source_dir.is_dir():
        raise SystemExit(f"Missing staged OG images: {source_dir}")

    count = total_bytes = 0
    for source_path in sorted(source_dir.rglob("*")):
        if not source_path.is_file() or source_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        with Image.open(source_path) as raw:
            image = ImageOps.exif_transpose(raw)
            image.load()
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            for width in WIDTHS:
                thumbnail = image.copy()
                thumbnail.thumbnail((width, width * 4), Image.Resampling.LANCZOS)
                target = staged / "thumbs" / source_path.relative_to(staged)
                target = target.with_name(target.name + f"-{width}.webp")
                target.parent.mkdir(parents=True, exist_ok=True)
                thumbnail.save(target, "WEBP", quality=78, method=6)
                total_bytes += target.stat().st_size
                count += 1
    print(f"Card thumbnails: {count} WebP files, {total_bytes} bytes")


if __name__ == "__main__":
    main()
