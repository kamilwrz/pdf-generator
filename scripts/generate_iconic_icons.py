"""Generate line-art PNG icons for the Iconic template family.

Each theme gets the same icon set tinted to its accent color so contact rows
and section headings stay chromatically consistent with the layout.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "backend" / "template_assets" / "iconic"

# Theme accent colors (stroke). Icons are drawn on transparent canvas.
THEMES = {
    "nova": "#C45C26",   # clay / terracotta
    "ridge": "#1F7A6C",  # deep teal
    "loom": "#C4A35A",   # antique gold (on dark sidebar use light variant too)
    "volt": "#E8A838",   # amber
}

# loom also needs a light ink variant for dark sidebar contact icons
THEME_VARIANTS = {
    "loom-light": "#F3E6C8",
}

SIZE = 128
STROKE = 7


def _new() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def _hex(color: str) -> tuple[int, int, int, int]:
    c = color.lstrip("#")
    r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    return (r, g, b, 255)


def draw_email(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # Envelope body
    d.rounded_rectangle((22, 38, 106, 96), radius=8, outline=col, width=STROKE)
    # Flap
    d.line([(22, 42), (64, 72), (106, 42)], fill=col, width=STROKE, joint="curve")
    return img


def draw_phone(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    d.rounded_rectangle((44, 18, 84, 110), radius=12, outline=col, width=STROKE)
    d.ellipse((56, 92, 72, 100), fill=col)
    d.line([(54, 30), (74, 30)], fill=col, width=STROKE)
    return img


def draw_location(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # Pin teardrop approximated with ellipse + triangle
    d.ellipse((34, 18, 94, 78), outline=col, width=STROKE)
    d.ellipse((52, 36, 76, 60), outline=col, width=STROKE - 1)
    d.polygon([(64, 108), (40, 68), (88, 68)], outline=col)
    # thicken pin point with lines
    d.line([(40, 68), (64, 108), (88, 68)], fill=col, width=STROKE)
    return img


def draw_summary(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    d.rounded_rectangle((28, 24, 100, 104), radius=10, outline=col, width=STROKE)
    for y in (48, 64, 80):
        d.line([(44, y), (84, y)], fill=col, width=STROKE - 2)
    return img


def draw_experience(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # Briefcase
    d.rounded_rectangle((24, 48, 104, 102), radius=8, outline=col, width=STROKE)
    d.arc((48, 28, 80, 56), start=0, end=180, fill=col, width=STROKE)
    d.line([(24, 70), (104, 70)], fill=col, width=STROKE - 1)
    return img


def draw_education(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # Graduation cap
    d.polygon([(20, 56), (64, 32), (108, 56), (64, 80)], outline=col)
    d.line([(20, 56), (64, 80), (108, 56)], fill=col, width=STROKE)
    d.line([(64, 32), (64, 80)], fill=col, width=STROKE - 1)
    d.line([(96, 62), (96, 92)], fill=col, width=STROKE - 1)
    d.ellipse((90, 90, 102, 102), outline=col, width=STROKE - 2)
    return img


def draw_skills(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # Spark / star
    pts = [
        (64, 18), (74, 50), (108, 50), (80, 70),
        (92, 104), (64, 84), (36, 104), (48, 70),
        (20, 50), (54, 50),
    ]
    d.line(pts + [pts[0]], fill=col, width=STROKE, joint="curve")
    return img


def draw_languages(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # Globe
    d.ellipse((24, 24, 104, 104), outline=col, width=STROKE)
    d.ellipse((44, 24, 84, 104), outline=col, width=STROKE - 2)
    d.arc((24, 44, 104, 84), start=0, end=180, fill=col, width=STROKE - 2)
    d.arc((24, 44, 104, 84), start=180, end=360, fill=col, width=STROKE - 2)
    return img


def draw_interests(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # Heart-ish: two circles + V
    d.ellipse((28, 34, 64, 70), outline=col, width=STROKE)
    d.ellipse((64, 34, 100, 70), outline=col, width=STROKE)
    d.line([(32, 58), (64, 104), (96, 58)], fill=col, width=STROKE)
    return img


def draw_references(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # People / quote bubble
    d.ellipse((40, 22, 72, 54), outline=col, width=STROKE)
    d.arc((28, 54, 84, 100), start=0, end=180, fill=col, width=STROKE)
    d.ellipse((74, 40, 98, 64), outline=col, width=STROKE - 1)
    d.arc((66, 64, 108, 100), start=20, end=180, fill=col, width=STROKE - 1)
    return img


def draw_certifications(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    import math
    pts = []
    for i in range(6):
        a = math.radians(-90 + i * 60)
        pts.append((64 + 40 * math.cos(a), 56 + 40 * math.sin(a)))
    d.line(pts + [pts[0]], fill=col, width=STROKE)
    d.ellipse((52, 44, 76, 68), outline=col, width=STROKE - 1)
    d.line([(56, 88), (64, 112), (72, 88)], fill=col, width=STROKE - 1)
    return img


def draw_other(color: str) -> Image.Image:
    img, d = _new()
    col = _hex(color)
    # Grid / modules
    for box in ((28, 28, 56, 56), (72, 28, 100, 56), (28, 72, 56, 100), (72, 72, 100, 100)):
        d.rounded_rectangle(box, radius=6, outline=col, width=STROKE - 1)
    return img


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


def main() -> None:
    all_themes = {**THEMES, **THEME_VARIANTS}
    for theme, color in all_themes.items():
        out_dir = ROOT / theme
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, fn in ICONS.items():
            path = out_dir / f"{name}.png"
            fn(color).save(path, "PNG")
            print("wrote", path.relative_to(ROOT.parent))


if __name__ == "__main__":
    main()
