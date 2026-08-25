"""Regression coverage for Sterling's palette-specific contact icon assets."""

from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).parents[1] / "template_assets" / "iconic"
PALETTE_ICON_COLORS = {
    "sterling": "#4A6FA5",
    "sterling-graphite": "#5B625E",
    "sterling-sage": "#557565",
    "sterling-burgundy": "#7A4650",
    "sterling-amber": "#8A603F",
    "sterling-midnight": "#315A70",
}
CONTACT_ICONS = ("email", "phone", "location", "linkedin", "github", "website")


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Convert the palette's six-digit CSS hexadecimal colour to RGB."""
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def test_each_sterling_palette_has_correctly_colored_contact_icons() -> None:
    """Every selectable palette must resolve to complete, truly coloured PNG assets."""
    for theme, hex_color in PALETTE_ICON_COLORS.items():
        expected_rgb = _hex_to_rgb(hex_color)
        for icon_name in CONTACT_ICONS:
            icon_path = ASSET_ROOT / theme / f"{icon_name}.png"
            assert icon_path.exists(), f"Missing Sterling icon: {icon_path}"
            pixels = Image.open(icon_path).convert("RGBA").get_flattened_data()
            visible_colors = {pixel[:3] for pixel in pixels if pixel[3] > 0}
            assert expected_rgb in visible_colors
