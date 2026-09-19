"""Regression coverage for Amaranth's palette-specific line-art icons."""

from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).parents[1] / "template_assets" / "iconic"
# Each Amaranth appearance edition owns a real-ink icon theme tinted to its
# accent, so contact icons and the portrait glyph match the selected palette in
# both the canvas and the ReportLab export. These hexes mirror the accents in
# ``frontend/src/utils/amaranthAppearance.js``.
PALETTE_ICON_COLORS = {
    "amaranth-claret": "#78304A",
    "amaranth-ink": "#2E4A63",
    "amaranth-forest": "#2F5C43",
    "amaranth-copper": "#9E5230",
    "amaranth-plum": "#593F6B",
    "amaranth-graphite": "#3A3E42",
}
AMARANTH_ICONS = (
    "email", "phone", "location", "linkedin", "github", "website", "portrait",
)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Convert a six-digit CSS hexadecimal colour to an RGB tuple."""
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def test_each_amaranth_palette_has_correctly_colored_line_art() -> None:
    """Every selectable palette must resolve to complete, correctly inked PNGs."""
    for theme, hex_color in PALETTE_ICON_COLORS.items():
        expected_rgb = _hex_to_rgb(hex_color)
        for icon_name in AMARANTH_ICONS:
            icon_path = ASSET_ROOT / theme / f"{icon_name}.png"
            assert icon_path.exists(), f"Missing Amaranth icon: {icon_path}"
            pixels = Image.open(icon_path).convert("RGBA").get_flattened_data()
            visible_colors = {pixel[:3] for pixel in pixels if pixel[3] > 0}
            assert expected_rgb in visible_colors


def test_palette_contact_ink_is_centred_in_identical_transparent_canvases() -> None:
    """Geometric box centring must also centre visible ink in every colourway."""
    for icon_name in AMARANTH_ICONS:
        reference_alpha = None
        for theme in PALETTE_ICON_COLORS:
            alpha = Image.open(ASSET_ROOT / theme / f"{icon_name}.png").convert("RGBA").getchannel("A")
            left, top, right, bottom = alpha.getbbox()
            assert abs(top + bottom - alpha.height) <= 1
            assert abs(left + right - alpha.width) <= 1
            if reference_alpha is None:
                reference_alpha = alpha.tobytes()
            assert alpha.tobytes() == reference_alpha
