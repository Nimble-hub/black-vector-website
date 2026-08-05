from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageEnhance


def soften_horizontal_seam(image: Image.Image, blend_width: int) -> Image.Image:
    pixels = image.load()
    width, height = image.size
    blend_width = max(2, min(blend_width, width // 6))

    for y in range(height):
        left_edge = pixels[0, y]
        right_edge = pixels[width - 1, y]
        shared_edge = tuple((left_edge[channel] + right_edge[channel]) // 2 for channel in range(3))
        for offset in range(blend_width):
            progress = offset / (blend_width - 1)
            smooth = progress * progress * (3.0 - 2.0 * progress)
            left = pixels[offset, y]
            right = pixels[width - 1 - offset, y]
            pixels[offset, y] = tuple(
                round(shared_edge[channel] * (1.0 - smooth) + left[channel] * smooth)
                for channel in range(3)
            )
            pixels[width - 1 - offset, y] = tuple(
                round(shared_edge[channel] * (1.0 - smooth) + right[channel] * smooth)
                for channel in range(3)
            )
    return image


def render(source: Path, output: Path, size: tuple[int, int], quality: int) -> None:
    with Image.open(source) as loaded:
        image = loaded.convert("RGB").resize(size, Image.Resampling.LANCZOS)
    image = ImageEnhance.Contrast(image).enhance(1.08)
    image = ImageEnhance.Color(image).enhance(0.92)
    image = ImageEnhance.Sharpness(image).enhance(1.18)
    # The source is authored to tile. Only reconcile the final few texels so
    # bilinear filtering cannot reveal a hairline at the sphere's UV seam.
    image = soften_horizontal_seam(image, max(6, size[0] // 256))
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", quality=quality, method=6)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build seamless Black Vector galaxy sky textures.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    render(
        args.source,
        args.output_dir / "bv-deep-space-galaxy-v1.webp",
        (2048, 1024),
        90,
    )
    render(
        args.source,
        args.output_dir / "bv-deep-space-galaxy-v1-mobile.webp",
        (1024, 512),
        86,
    )


if __name__ == "__main__":
    main()
