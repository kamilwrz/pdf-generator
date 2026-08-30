"""Regression coverage for Slate's palette-specific accent icon assets."""

from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).parents[1] / "template_assets" / "iconic"
PALETTE_ICON_COLORS = {
    "slate-accent": "#3E5C76",
    "slate-monochrome-accent": "#242424",
    "slate-copper-accent": "#A14F2B",
    "slate-forest-accent": "#2F6A50",
    "slate-plum-accent": "#764466",
    "slate-teal-accent": "#007473",
}
ACCENT_ICONS = (
    "email", "phone", "location", "linkedin", "github", "website", "portrait",
    "contact",
)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Convert a six-digit CSS hexadecimal colour to an RGB tuple."""
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def test_each_slate_palette_has_correctly_colored_accent_icons() -> None:
    """Every selectable palette must resolve to complete, correctly inked PNGs."""
    for theme, hex_color in PALETTE_ICON_COLORS.items():
        expected_rgb = _hex_to_rgb(hex_color)
        for icon_name in ACCENT_ICONS:
            icon_path = ASSET_ROOT / theme / f"{icon_name}.png"
            assert icon_path.exists(), f"Missing Slate icon: {icon_path}"
            pixels = Image.open(icon_path).convert("RGBA").get_flattened_data()
            visible_colors = {pixel[:3] for pixel in pixels if pixel[3] > 0}
            assert expected_rgb in visible_colors
