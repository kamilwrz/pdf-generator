"""Regression coverage for Monument's palette-specific icon assets."""

from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).parents[1] / "template_assets" / "iconic"
PALETTE_ICON_COLORS = {
    "monument": "#111111",
    "monument-blueprint": "#223338",
    "monument-olive": "#30372C",
    "monument-oxblood": "#4B3034",
    "monument-travertine": "#493A2F",
    "monument-midnight": "#243141",
}
MONUMENT_ICONS = (
    "email", "phone", "location", "linkedin", "github", "website", "portrait",
)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Convert a six-digit CSS hexadecimal colour to an RGB tuple."""
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def test_each_monument_palette_has_correctly_colored_icons() -> None:
    """Every palette must resolve to complete, truly coloured PNG assets."""
    for theme, hex_color in PALETTE_ICON_COLORS.items():
        expected_rgb = _hex_to_rgb(hex_color)
        for icon_name in MONUMENT_ICONS:
            icon_path = ASSET_ROOT / theme / f"{icon_name}.png"
            assert icon_path.exists(), f"Missing Monument icon: {icon_path}"
            pixels = Image.open(icon_path).convert("RGBA").get_flattened_data()
            visible_colors = {pixel[:3] for pixel in pixels if pixel[3] > 0}
            assert expected_rgb in visible_colors
