"""Regression coverage for Vellum's palette-specific line-art icons."""

from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).parents[1] / "template_assets" / "iconic"
PALETTE_ICON_COLORS = {
    "vellum-sage": "#8A5E47",
    "vellum-mist": "#3F7086",
    "vellum-rose": "#805064",
    "vellum-ink": "#345F7B",
    "vellum-burgundy": "#843E51",
    "vellum-emerald": "#2D6A57",
}
VELLUM_ICONS = (
    "email", "phone", "location", "linkedin", "github", "website", "portrait",
)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Convert a six-digit CSS hexadecimal colour to an RGB tuple."""
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def test_each_vellum_palette_has_correctly_colored_line_art() -> None:
    """Every selectable palette must resolve to complete, correctly inked PNGs."""
    for theme, hex_color in PALETTE_ICON_COLORS.items():
        expected_rgb = _hex_to_rgb(hex_color)
        for icon_name in VELLUM_ICONS:
            icon_path = ASSET_ROOT / theme / f"{icon_name}.png"
            assert icon_path.exists(), f"Missing Vellum icon: {icon_path}"
            pixels = Image.open(icon_path).convert("RGBA").get_flattened_data()
            visible_colors = {pixel[:3] for pixel in pixels if pixel[3] > 0}
            assert expected_rgb in visible_colors
