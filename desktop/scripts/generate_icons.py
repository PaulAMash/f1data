"""
Generate the Pitwall IQ app icon set for Tauri.

Produces (in frontend/src-tauri/icons/):
  app-icon.png (1024 master), 32x32.png, 128x128.png, 128x128@2x.png,
  icon.png, icon.ico, icon.icns

The mark: a dark rounded tile with a red speedometer arc + cyan needle — the
"virtual pit wall" idea. Regenerate any time, or replace app-icon.png and run
`npm run tauri icon` for the platform-native sets.
"""
from __future__ import annotations

import math
import struct
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src-tauri" / "icons"
BASE = (11, 14, 22)       # #0b0e16
ACCENT = (255, 59, 59)    # brand red
SPEED = (0, 224, 198)     # brand cyan
INK = (232, 236, 245)


def _rounded(size: int, radius_frac=0.22) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_frac)
    # subtle vertical gradient background
    top = (18, 22, 34)
    for y in range(size):
        t = y / size
        col = tuple(int(top[i] + (BASE[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=col + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    img.putalpha(mask)
    return img


def _draw_mark(img: Image.Image) -> None:
    size = img.width
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    R = size * 0.30
    w = max(2, int(size * 0.055))
    box = [cx - R, cy - R, cx + R, cy + R]
    # speedometer arc (225° sweep), red
    d.arc(box, start=135, end=360 + 45 - 15, width=w, fill=ACCENT + (255,))
    # tick marks
    for k in range(9):
        ang = math.radians(135 + k * (270 / 8))
        r1, r2 = R * 0.72, R * 0.86
        d.line([(cx + r1 * math.cos(ang), cy + r1 * math.sin(ang)),
                (cx + r2 * math.cos(ang), cy + r2 * math.sin(ang))],
               fill=INK + (200,), width=max(1, int(size * 0.012)))
    # needle (cyan), pointing to ~upper-right
    na = math.radians(-35)
    d.line([(cx, cy), (cx + R * 0.92 * math.cos(na), cy + R * 0.92 * math.sin(na))],
           fill=SPEED + (255,), width=max(2, int(size * 0.045)))
    hub = size * 0.045
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=SPEED + (255,))


def render(size: int) -> Image.Image:
    img = _rounded(size)
    _draw_mark(img)
    return img


def write_icns(master: Image.Image, path: Path) -> None:
    """Minimal but valid ICNS with PNG-embedded entries."""
    types = {
        b"icp4": 16, b"icp5": 32, b"icp6": 64,
        b"ic07": 128, b"ic08": 256, b"ic09": 512, b"ic10": 1024,
    }
    import io
    entries = b""
    for ostype, sz in types.items():
        buf = io.BytesIO()
        master.resize((sz, sz), Image.LANCZOS).save(buf, format="PNG")
        data = buf.getvalue()
        entries += ostype + struct.pack(">I", len(data) + 8) + data
    body = b"icns" + struct.pack(">I", len(entries) + 8) + entries
    path.write_bytes(body)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    master = render(1024)
    master.save(OUT / "app-icon.png")
    master.save(OUT / "icon.png")
    render(32).save(OUT / "32x32.png")
    render(128).save(OUT / "128x128.png")
    render(256).save(OUT / "128x128@2x.png")
    # Windows .ico (multi-size)
    master.save(OUT / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # macOS .icns
    write_icns(master, OUT / "icon.icns")
    # Windows Store-style square icons (harmless extras Tauri may reference)
    for name, sz in [("Square30x30Logo.png", 30), ("Square44x44Logo.png", 44),
                     ("Square71x71Logo.png", 71), ("Square89x89Logo.png", 89),
                     ("Square107x107Logo.png", 107), ("Square142x142Logo.png", 142),
                     ("Square150x150Logo.png", 150), ("Square284x284Logo.png", 284),
                     ("Square310x310Logo.png", 310), ("StoreLogo.png", 50)]:
        render(sz).save(OUT / name)
    print(f"✔ Icons written to {OUT}")


if __name__ == "__main__":
    main()
