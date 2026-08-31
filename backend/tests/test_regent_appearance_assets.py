"""Regression coverage for Regent's complete palette-specific icon assets."""

from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).parents[1] / "template_assets" / "iconic"
PALETTE_ICON_COLORS = {
    "regent": "#151515",
    "regent-ivory": "#765536",
    "regent-sapphire": "#E2BD72",
    "regent-burgundy": "#E6BE78",
}
REGENT_ICONS = tuple(path.stem for path in (ASSET_ROOT / "regent").glob("*.png"))


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Convert one six-digit CSS hexadecimal colour to an RGB tuple."""
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def test_each_regent_edition_has_complete_correctly_colored_icons() -> None:
    """Every selectable Regent edition resolves to complete, true-colour PNGs."""
    for theme, hex_color in PALETTE_ICON_COLORS.items():
        expected_rgb = _hex_to_rgb(hex_color)
        assert REGENT_ICONS
        for icon_name in REGENT_ICONS:
            icon_path = ASSET_ROOT / theme / f"{icon_name}.png"
            assert icon_path.exists(), f"Missing Regent icon: {icon_path}"
            pixels = Image.open(icon_path).convert("RGBA").get_flattened_data()
            visible_colors = {pixel[:3] for pixel in pixels if pixel[3] > 0}
            assert expected_rgb in visible_colors
