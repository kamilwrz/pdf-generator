"""Regression coverage for Atrium's palette-specific contact and portrait icons."""

from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).parents[1] / "template_assets" / "iconic"
PALETTE_ICON_COLORS = {
    "atrium-sage": "#556158",
    "atrium-carrara": "#765640",
    "atrium-nocturne": "#D7B66D",
    "atrium-cobalt": "#F2CB78",
    "atrium-burgundy": "#F2C986",
    "atrium-emerald": "#E4C777",
}
ATRIUM_ICONS = (
    "email", "phone", "location", "linkedin", "github", "website", "portrait",
)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Convert a six-digit CSS hexadecimal colour to an RGB tuple."""
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def test_each_atrium_palette_has_complete_correctly_colored_line_art() -> None:
    """All six selectable editions must resolve to seven truly inked PNGs."""
    assert len(PALETTE_ICON_COLORS) * len(ATRIUM_ICONS) == 42
    for theme, hex_color in PALETTE_ICON_COLORS.items():
        expected_rgb = _hex_to_rgb(hex_color)
        for icon_name in ATRIUM_ICONS:
            icon_path = ASSET_ROOT / theme / f"{icon_name}.png"
            assert icon_path.exists(), f"Missing Atrium icon: {icon_path}"
            with Image.open(icon_path) as image:
                rgba = image.convert("RGBA")
                assert rgba.size == (128, 128)
                visible_colors = {
                    pixel[:3]
                    for pixel in rgba.get_flattened_data()
                    if pixel[3] > 0
                }
            assert expected_rgb in visible_colors, (
                f"{icon_path} does not contain expected ink {expected_rgb}"
            )
