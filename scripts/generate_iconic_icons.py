"""Generate optically-centered line-art PNG icons for the Iconic family.

Each glyph is drawn, cropped to its ink bbox, scaled into a fixed content
square, then pasted dead-center on a transparent 128×128 canvas so every icon
shares the same visual weight and alignment at 12–16 px on the canvas.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "backend" / "template_assets" / "iconic"

THEMES = {
    "nova": "#C45C26",
    "ridge": "#1F7A6C",
    "loom": "#C4A35A",
    "volt": "#E8A838",
    # Cardinal (Classic collection): the layout keeps its "noble red" for text
    # headings only. Its section and contact icons are deliberately neutral grey
    # so the red stays reserved for typography, matching the template's design.
    "cardinal": "#8A8A8A",
}
THEME_VARIANTS = {
    "loom-light": "#F3E6C8",
}

SIZE = 128
# Ink area inside the canvas — equal padding on every side after normalize.
CONTENT = 88
STROKE = 8
DRAW = 160  # oversized draft canvas so strokes are not clipped before crop


def _hex(color: str) -> tuple[int, int, int, int]:
    c = color.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)


def _draft() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (DRAW, DRAW), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def _normalize(img: Image.Image) -> Image.Image:
    """Crop ink, fit into CONTENT×CONTENT, center on SIZE×SIZE."""
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if not bbox:
        return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    cropped = img.crop(bbox)
    cw, ch = cropped.size
    scale = min(CONTENT / cw, CONTENT / ch)
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    fitted = cropped.resize((nw, nh), Image.Resampling.LANCZOS)

    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(fitted, ((SIZE - nw) // 2, (SIZE - nh) // 2), fitted)
    return out


def draw_email(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    d.rounded_rectangle((36, 48, 124, 112), radius=10, outline=col, width=STROKE)
    d.line([(36, 54), (80, 88), (124, 54)], fill=col, width=STROKE)
    return _normalize(img)


def draw_phone(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    d.rounded_rectangle((58, 28, 102, 132), radius=14, outline=col, width=STROKE)
    d.rounded_rectangle((70, 40, 90, 48), radius=3, fill=col)
    d.ellipse((72, 112, 88, 128), fill=col)
    return _normalize(img)


def draw_location(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    d.ellipse((44, 28, 116, 100), outline=col, width=STROKE)
    d.ellipse((66, 50, 94, 78), outline=col, width=STROKE - 1)
    d.line([(52, 88), (80, 136), (108, 88)], fill=col, width=STROKE)
    return _normalize(img)


def draw_summary(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    d.rounded_rectangle((44, 32, 116, 128), radius=12, outline=col, width=STROKE)
    for y in (58, 78, 98):
        d.line([(60, y), (100, y)], fill=col, width=STROKE - 1)
    return _normalize(img)


def draw_experience(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    d.rounded_rectangle((36, 64, 124, 124), radius=10, outline=col, width=STROKE)
    d.arc((60, 36, 100, 76), start=0, end=180, fill=col, width=STROKE)
    d.line([(36, 88), (124, 88)], fill=col, width=STROKE - 1)
    return _normalize(img)


def draw_education(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    # Cap diamond + tassel — closed strokes so small sizes stay readable.
    d.line([(28, 72), (80, 40), (132, 72), (80, 104), (28, 72)], fill=col, width=STROKE)
    d.line([(80, 40), (80, 104)], fill=col, width=STROKE - 1)
    d.line([(118, 80), (118, 118)], fill=col, width=STROKE - 1)
    d.ellipse((110, 114, 126, 130), outline=col, width=STROKE - 1)
    return _normalize(img)


def draw_skills(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    pts = [
        (80, 28), (92, 64), (128, 64), (100, 86),
        (112, 122), (80, 100), (48, 122), (60, 86),
        (32, 64), (68, 64),
    ]
    d.line(pts + [pts[0]], fill=col, width=STROKE)
    return _normalize(img)


def draw_languages(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    d.ellipse((36, 36, 124, 124), outline=col, width=STROKE)
    d.ellipse((58, 36, 102, 124), outline=col, width=STROKE - 1)
    d.arc((36, 58, 124, 102), start=0, end=180, fill=col, width=STROKE - 1)
    d.arc((36, 58, 124, 102), start=180, end=360, fill=col, width=STROKE - 1)
    return _normalize(img)


def draw_interests(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    d.ellipse((40, 44, 82, 86), outline=col, width=STROKE)
    d.ellipse((78, 44, 120, 86), outline=col, width=STROKE)
    d.line([(44, 74), (80, 128), (116, 74)], fill=col, width=STROKE)
    return _normalize(img)


def draw_references(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    d.ellipse((50, 30, 90, 70), outline=col, width=STROKE)
    d.arc((36, 70, 104, 126), start=0, end=180, fill=col, width=STROKE)
    d.ellipse((96, 52, 124, 80), outline=col, width=STROKE - 1)
    d.arc((86, 80, 134, 126), start=20, end=180, fill=col, width=STROKE - 1)
    return _normalize(img)


def draw_certifications(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    import math
    pts = []
    for i in range(6):
        a = math.radians(-90 + i * 60)
        pts.append((80 + 42 * math.cos(a), 70 + 42 * math.sin(a)))
    d.line(pts + [pts[0]], fill=col, width=STROKE)
    d.ellipse((66, 56, 94, 84), outline=col, width=STROKE - 1)
    d.line([(70, 108), (80, 136), (90, 108)], fill=col, width=STROKE - 1)
    return _normalize(img)


def draw_other(color: str) -> Image.Image:
    img, d = _draft()
    col = _hex(color)
    for box in ((40, 40, 74, 74), (86, 40, 120, 74), (40, 86, 74, 120), (86, 86, 120, 120)):
        d.rounded_rectangle(box, radius=7, outline=col, width=STROKE - 1)
    return _normalize(img)


def draw_github(color: str) -> Image.Image:
    """`< >` code mark — used for a code-host / repository profile link."""
    img, d = _draft()
    col = _hex(color)
    d.line([(62, 48), (34, 84), (62, 120)], fill=col, width=STROKE)
    d.line([(98, 48), (126, 84), (98, 120)], fill=col, width=STROKE)
    return _normalize(img)


def draw_calendar(color: str) -> Image.Image:
    """Calendar icon for date ranges: framed body, header divider, binder tabs."""
    img, d = _draft()
    col = _hex(color)
    d.rounded_rectangle((34, 46, 126, 122), radius=10, outline=col, width=STROKE)
    d.line([(34, 68), (126, 68)], fill=col, width=STROKE - 1)
    d.line([(58, 34), (58, 54)], fill=col, width=STROKE)
    d.line([(102, 34), (102, 54)], fill=col, width=STROKE)
    for cx in (58, 80, 102):
        d.ellipse((cx - 5, 86, cx + 5, 96), fill=col)
    return _normalize(img)


def draw_diamond(color: str) -> Image.Image:
    """Faceted gem bullet for the tools/systems list. Kept legible at ~9 px."""
    img, d = _draft()
    col = _hex(color)
    d.line([(80, 30), (126, 72), (80, 130), (34, 72), (80, 30)], fill=col, width=STROKE)
    d.line([(34, 72), (126, 72)], fill=col, width=STROKE - 2)
    d.line([(56, 51), (72, 72)], fill=col, width=STROKE - 3)
    d.line([(104, 51), (88, 72)], fill=col, width=STROKE - 3)
    return _normalize(img)


ICONS = {
    "email": draw_email,
    "phone": draw_phone,
    "location": draw_location,
    "summary": draw_summary,
    "experience": draw_experience,
    "education": draw_education,
    "skills": draw_skills,
    "languages": draw_languages,
    "interests": draw_interests,
    "references": draw_references,
    "certifications": draw_certifications,
    "other": draw_other,
}

# Glyphs used only by the Harbor two-column template, not by the Iconic family.
# Kept out of the base ICONS set so regenerating does not add unused files to
# the existing themes (nova/ridge/loom/volt/cardinal).
EXTRA_ICONS = {
    "github": draw_github,
    "calendar": draw_calendar,
    "diamond": draw_diamond,
}

# Harbor (Sidebar collection) uses two colour variants of a curated glyph subset:
# slate-grey contact/meta/photo icons, and a single teal diamond for the tool
# list bullets. Only these subsets are generated, so existing themes are
# untouched. Format: theme -> (colour, [icon names]).
SUBSET_THEMES = {
    "harbor": ("#5C6672", ["email", "phone", "github", "location", "calendar", "references"]),
    "harbor-accent": ("#17A2B8", ["diamond"]),
}


def main() -> None:
    all_glyphs = {**ICONS, **EXTRA_ICONS}

    # Full-set Iconic themes (and variants) get every base glyph.
    for theme, color in {**THEMES, **THEME_VARIANTS}.items():
        out_dir = ROOT / theme
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, fn in ICONS.items():
            path = out_dir / f"{name}.png"
            fn(color).save(path, "PNG")
            print("wrote", path.relative_to(ROOT.parent))

    # Curated subset themes (Harbor) get only the glyphs they reference.
    for theme, (color, names) in SUBSET_THEMES.items():
        out_dir = ROOT / theme
        out_dir.mkdir(parents=True, exist_ok=True)
        for name in names:
            path = out_dir / f"{name}.png"
            all_glyphs[name](color).save(path, "PNG")
            print("wrote", path.relative_to(ROOT.parent))


if __name__ == "__main__":
    main()
