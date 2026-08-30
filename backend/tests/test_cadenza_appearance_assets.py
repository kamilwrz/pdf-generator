"""Regression coverage for Cadenza's palette-specific contact icons."""

from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).parents[1] / "template_assets" / "iconic"
PALETTE_ICON_COLORS = {
    "cadenza-porcelain": "#855C46",
    "cadenza-mist": "#3F6F85",
    "cadenza-sage": "#4B725C",
    "cadenza-cobalt": "#245F91",
    "cadenza-burgundy": "#85364F",
    "cadenza-emerald": "#23664F",
}
CONTACT_ICONS = (
    "email", "phone", "location", "linkedin", "github", "website",
)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Convert a six-digit CSS hexadecimal colour to an RGB tuple."""
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def test_each_cadenza_palette_has_correctly_colored_contact_icons() -> None:
    """Every selectable palette must resolve to complete, correctly inked PNGs."""
    for theme, hex_color in PALETTE_ICON_COLORS.items():
        expected_rgb = _hex_to_rgb(hex_color)
        for icon_name in CONTACT_ICONS:
            icon_path = ASSET_ROOT / theme / f"{icon_name}.png"
            assert icon_path.exists(), f"Missing Cadenza icon: {icon_path}"
            pixels = Image.open(icon_path).convert("RGBA").get_flattened_data()
            visible_colors = {pixel[:3] for pixel in pixels if pixel[3] > 0}
            assert expected_rgb in visible_colors
