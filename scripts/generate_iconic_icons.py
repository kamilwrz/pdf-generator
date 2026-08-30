"""Generate optically-centered line-art PNG icons for icon-tagged templates.

Each glyph is drawn, cropped to its ink bbox, scaled into a fixed content
square, then pasted dead-center on a transparent 128×128 canvas so every icon
shares the same visual weight and alignment at 12–16 px on the canvas.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "backend" / "template_assets" / "iconic"

THEMES = {
    # Regent uses a neutral charcoal icon set so its masthead remains entirely
    # monochrome while retaining independently editable contact channels.
    "regent": "#151515",
}
THEME_VARIANTS = {}
# Full Iconic themes normally receive the base glyph set. Nova additionally
# uses the portrait placeholder inside its masthead photo frame.
THEME_EXTRA_ICONS = {}

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


def _save_png(image: Image.Image, path: Path) -> bool:
    """Write a glyph only when its rendered RGBA pixels actually changed.

    Pillow versions can encode identical pixels into different PNG byte
    streams. Comparing decoded pixels first prevents a palette-only addition
    from rewriting every established icon theme in the repository.
    """
    if path.exists():
        with Image.open(path) as existing:
            current = existing.convert("RGBA")
            candidate = image.convert("RGBA")
            if current.size == candidate.size and current.tobytes() == candidate.tobytes():
                return False
    image.save(path, "PNG")
    return True


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


def draw_linkedin(color: str) -> Image.Image:
    """Compact LinkedIn-style \"in\" mark inside a rounded square."""
    img, d = _draft()
    col = _hex(color)
    d.rounded_rectangle((36, 36, 124, 124), radius=14, outline=col, width=STROKE)
    # Stem + bowl of a lowercase "in" wordmark, sized for ~14 px contact icons.
    d.rectangle((54, 62, 66, 112), fill=col)
    d.ellipse((52, 44, 68, 60), fill=col)
    d.rectangle((78, 70, 90, 112), fill=col)
    d.arc((78, 58, 114, 104), start=200, end=340, fill=col, width=STROKE)
    d.line([(114, 78), (114, 112)], fill=col, width=STROKE)
    return _normalize(img)


def draw_website(color: str) -> Image.Image:
    """Globe / www mark for personal sites and portfolios."""
    img, d = _draft()
    col = _hex(color)
    d.ellipse((34, 34, 126, 126), outline=col, width=STROKE)
    d.ellipse((58, 34, 102, 126), outline=col, width=STROKE - 1)
    d.arc((34, 52, 126, 108), start=0, end=180, fill=col, width=STROKE - 1)
    d.arc((34, 52, 126, 108), start=180, end=360, fill=col, width=STROKE - 1)
    d.line([(34, 80), (126, 80)], fill=col, width=STROKE - 1)
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


def draw_portrait(color: str) -> Image.Image:
    """Rectangular-photo placeholder glyph: geometric head and shoulder line."""
    img, d = _draft()
    col = _hex(color)
    d.ellipse((58, 30, 102, 74), outline=col, width=STROKE)
    d.arc((36, 66, 124, 132), start=180, end=360, fill=col, width=STROKE)
    d.line([(44, 108), (44, 132), (116, 132), (116, 108)], fill=col, width=STROKE)
    return _normalize(img)


ICONS = {
    "email": draw_email,
    "phone": draw_phone,
    "location": draw_location,
    # Contact profile links shared by base and template-specific themes.
    "github": draw_github,
    "linkedin": draw_linkedin,
    "website": draw_website,
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

# Glyphs used only by Harbor / Slate subsets, not every Iconic theme.
EXTRA_ICONS = {
    "calendar": draw_calendar,
    "diamond": draw_diamond,
    "portrait": draw_portrait,
}

# Full glyph set shared by both Slate colour variants (see SUBSET_THEMES below).
_SLATE_GLYPHS = [
    "email", "phone", "linkedin", "github", "website", "location",
    "calendar", "portrait",
    "summary", "experience", "education", "skills", "languages",
    "interests", "references", "certifications", "other",
]

# Palette variants only replace glyphs drawn directly on paper: masthead
# contacts and the photo placeholder. White section glyphs remain on the
# shared `slate` theme because every palette keeps filled accent badges.
_SLATE_ACCENT_GLYPHS = [
    "email", "phone", "location", "linkedin", "github", "website", "portrait",
]

# Meridian uses icons only in its centered masthead contact band. Each
# Appearance palette gets real PNG ink so canvas and PDF output stay identical.
_MERIDIAN_CONTACT_GLYPHS = [
    "email", "phone", "location", "linkedin", "github", "website",
]

# Cadenza uses the same compact contact-channel inventory, but owns a separate
# family so its light and strong editorial palettes can evolve independently
# without changing Meridian or the legacy copper glyphs still used by Vellum.
_CADENZA_CONTACT_GLYPHS = [
    "email", "phone", "location", "linkedin", "github", "website",
]

# Only these subsets are generated, so existing themes are untouched.
# Format: theme -> (colour, [icon names]).
SUBSET_THEMES = {
    # Slate (Sidebar collection) uses two colour variants of the same glyph set:
    #   * `slate`        — white glyphs meant to sit inside filled steel-blue
    #                      section-heading badges (white-on-accent).
    #   * `slate-accent` — steel-blue glyphs for bare contact rows and the
    #                      rectangular photo placeholder (accent-on-paper).
    # Both variants carry the full set so any section-heading key (white badge)
    # or contact/photo role (accent) always resolves to an existing asset.
    "slate": ("#FFFFFF", _SLATE_GLYPHS),
    "slate-accent": ("#3E5C76", _SLATE_GLYPHS),
    "slate-monochrome-accent": ("#242424", _SLATE_ACCENT_GLYPHS),
    "slate-copper-accent": ("#A14F2B", _SLATE_ACCENT_GLYPHS),
    "slate-forest-accent": ("#2F6A50", _SLATE_ACCENT_GLYPHS),
    "slate-plum-accent": ("#764466", _SLATE_ACCENT_GLYPHS),
    "slate-teal-accent": ("#007473", _SLATE_ACCENT_GLYPHS),
    "meridian": ("#3D5A80", _MERIDIAN_CONTACT_GLYPHS),
    "meridian-monochrome": ("#242424", _MERIDIAN_CONTACT_GLYPHS),
    "meridian-burgundy": ("#8A3F53", _MERIDIAN_CONTACT_GLYPHS),
    "meridian-forest": ("#2E6B52", _MERIDIAN_CONTACT_GLYPHS),
    "meridian-copper": ("#A35732", _MERIDIAN_CONTACT_GLYPHS),
    "meridian-teal": ("#0B6B70", _MERIDIAN_CONTACT_GLYPHS),
    # Three light and three strong Cadenza identities. Icons use the same
    # accent as the role line and page number; headings own a separate
    # field/text contrast pair in the template appearance contract.
    "cadenza-porcelain": ("#855C46", _CADENZA_CONTACT_GLYPHS),
    "cadenza-mist": ("#3F6F85", _CADENZA_CONTACT_GLYPHS),
    "cadenza-sage": ("#4B725C", _CADENZA_CONTACT_GLYPHS),
    "cadenza-cobalt": ("#245F91", _CADENZA_CONTACT_GLYPHS),
    "cadenza-burgundy": ("#85364F", _CADENZA_CONTACT_GLYPHS),
    "cadenza-emerald": ("#23664F", _CADENZA_CONTACT_GLYPHS),
    # Atrium (centered-axis editorial single column) uses graphite-sage contact
    # glyphs in the centered masthead only. Section headings are centered text
    # with a printer's-mark ornament (no icons), so just the contact set is
    # generated — nothing else references this theme.
    "atrium": (
        "#556158",
        ["email", "phone", "location", "linkedin", "github", "website"],
    ),
    # Sterling (institutional two-column layout) uses its own steel-blue accent
    # for the centered letterhead contact row only. Section headings stay plain
    # text + rule (no icons), so just the contact set is generated.
    "sterling": (
        "#4A6FA5",
        ["email", "phone", "location", "linkedin", "github", "website"],
    ),
    # Each Sterling appearance palette owns real raster assets rather than a
    # CSS filter. This keeps icon colour identical in the live canvas and PDF
    # export, including after a saved document is reopened.
    "sterling-graphite": (
        "#5B625E",
        ["email", "phone", "location", "linkedin", "github", "website"],
    ),
    "sterling-sage": (
        "#557565",
        ["email", "phone", "location", "linkedin", "github", "website"],
    ),
    "sterling-burgundy": (
        "#7A4650",
        ["email", "phone", "location", "linkedin", "github", "website"],
    ),
    "sterling-amber": (
        "#8A603F",
        ["email", "phone", "location", "linkedin", "github", "website"],
    ),
    "sterling-midnight": (
        "#315A70",
        ["email", "phone", "location", "linkedin", "github", "website"],
    ),
    # Linden pairs fine forest-green contact glyphs with a rectangular portrait
    # placeholder. Section headings remain typographic, so no unrelated glyphs
    # are generated for this restrained editorial system.
    "linden": (
        "#285548",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    # Linden's palettes share the same restrained glyph set. Each variant is
    # rendered in real palette ink so neither the browser nor PDF export needs
    # an approximate CSS filter.
    "linden-gallery": (
        "#0E6870",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "linden-carmine": (
        "#A2444E",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "linden-midnight": (
        "#C19752",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "linden-cobalt": (
        "#B44F38",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "linden-plum": (
        "#B07B68",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    # Monument needs masthead contact glyphs and the portrait placeholder;
    # numbered text plates replace section icons in this layout. Each curated
    # appearance owns real ink-coloured PNGs so editor and PDF export match.
    "monument": (
        "#111111",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "monument-blueprint": (
        "#223338",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "monument-olive": (
        "#30372C",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "monument-oxblood": (
        "#4B3034",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "monument-travertine": (
        "#493A2F",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
    "monument-midnight": (
        "#243141",
        ["email", "phone", "location", "linkedin", "github", "website", "portrait"],
    ),
}


def main() -> None:
    all_glyphs = {**ICONS, **EXTRA_ICONS}

    # Full-set Iconic themes (and variants) get every base glyph.
    for theme, color in {**THEMES, **THEME_VARIANTS}.items():
        out_dir = ROOT / theme
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, fn in ICONS.items():
            path = out_dir / f"{name}.png"
            if _save_png(fn(color), path):
                print("wrote", path.relative_to(ROOT.parent))
        for name in THEME_EXTRA_ICONS.get(theme, []):
            path = out_dir / f"{name}.png"
            if _save_png(EXTRA_ICONS[name](color), path):
                print("wrote", path.relative_to(ROOT.parent))

    # Curated subset themes (Harbor) get only the glyphs they reference.
    for theme, (color, names) in SUBSET_THEMES.items():
        out_dir = ROOT / theme
        out_dir.mkdir(parents=True, exist_ok=True)
        for name in names:
            path = out_dir / f"{name}.png"
            if _save_png(all_glyphs[name](color), path):
                print("wrote", path.relative_to(ROOT.parent))


if __name__ == "__main__":
    main()
