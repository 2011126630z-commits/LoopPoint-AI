"""Generate every LoopPoint AI app icon from the favicon.svg geometry.

The mark is defined on a 48x48 grid: rounded square #164438 (rx=10), a ring
#c8e77d (r=12, stroke 6) and the right half of that ring in #62b7a8.
Everything is drawn at 4x and downsampled, so the PNGs are antialiased.

Usage: python scripts/build-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"

BG = (22, 68, 56, 255)       # #164438
RING = (200, 231, 125, 255)  # #c8e77d
TINT = (98, 183, 168, 255)   # #62b7a8
WHITE = (255, 255, 255, 255)
SUPERSAMPLE = 4

# Geometry in the 48x48 reference grid.
GRID = 48
CORNER = 10
CENTER = 24
RADIUS = 12
STROKE = 6


def draw_mark(draw: ImageDraw.ImageDraw, size: int, scale: float, ring: tuple, arc: tuple) -> None:
    """Draw the ring mark centred in a `size` box, scaled by `scale`."""
    box = size * scale
    offset = (size - box) / 2
    radius = box * RADIUS / GRID
    width = max(1, round(box * STROKE / GRID))
    center = offset + box / 2
    bounds = [center - radius, center - radius, center + radius, center + radius]
    draw.ellipse(bounds, outline=ring, width=width)
    # favicon.svg paints the right half of the ring: 12 o'clock -> 6 o'clock.
    draw.arc(bounds, start=-90, end=90, fill=arc, width=width)


def render(size: int, *, rounded: bool, background: bool, scale: float = 1.0,
           ring: tuple = RING, arc: tuple = TINT) -> Image.Image:
    canvas = size * SUPERSAMPLE
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if background:
        if rounded:
            draw.rounded_rectangle([0, 0, canvas - 1, canvas - 1], radius=canvas * CORNER / GRID, fill=BG)
        else:
            draw.rectangle([0, 0, canvas, canvas], fill=BG)
    draw_mark(draw, canvas, scale, ring, arc)
    return image.resize((size, size), Image.LANCZOS)


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    print(f"{path.relative_to(ROOT)}  {image.width}x{image.height}  {path.stat().st_size / 1024:.1f} KB")


def main() -> None:
    # "any": exactly the favicon mark, rounded corners included.
    for size in (192, 512):
        save(render(size, rounded=True, background=True), ICONS / f"icon-{size}.png")

    # "maskable": full-bleed square, mark well inside the 80% safe circle so any
    # launcher mask (circle, squircle, rounded square) crops cleanly.
    for size in (192, 512):
        save(render(size, rounded=False, background=True), ICONS / f"maskable-{size}.png")

    # iOS ignores the manifest icon and applies its own mask to this one.
    save(render(180, rounded=False, background=True), PUBLIC / "apple-touch-icon.png")

    # Android 13+ themed icons.
    save(render(512, rounded=False, background=False, ring=WHITE, arc=WHITE), ICONS / "monochrome-512.png")

    favicon = render(48, rounded=True, background=True)
    save(favicon.resize((32, 32), Image.LANCZOS), ICONS / "favicon-32.png")
    save(favicon.resize((16, 16), Image.LANCZOS), ICONS / "favicon-16.png")
    favicon.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"public/favicon.ico  16/32/48  {(PUBLIC / 'favicon.ico').stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
