#!/usr/bin/env python3
"""Rasterize icons/token-police.svg (and the 16px variant) to PNG.

SVG is the source. Run after editing the mark:

    python3 scripts/render-icons.py
"""

from pathlib import Path

import cairosvg
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
DOCS = ROOT / "docs"


def raster(svg: Path, size: int) -> Image.Image:
    png = cairosvg.svg2png(url=str(svg), output_width=size, output_height=size)
    return Image.open(BytesIO(png)).convert("RGBA")


def save(im: Image.Image, dest: Path) -> None:
    im.save(dest, "PNG", optimize=True)
    print(f"wrote {dest.relative_to(ROOT)} {im.size[0]}x{im.size[1]} {dest.stat().st_size} bytes")


def main() -> None:
    src = ICONS / "token-police.svg"
    src16 = ICONS / "token-police-16.svg"
    icon128 = raster(src, 128)
    save(icon128, ICONS / "128.png")
    save(icon128, DOCS / "icon-128.png")
    save(raster(src, 48), ICONS / "48.png")
    save(raster(src16, 16), ICONS / "16.png")


if __name__ == "__main__":
    main()
