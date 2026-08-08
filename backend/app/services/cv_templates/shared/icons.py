"""Icon asset helpers for templates that use template_assets/iconic/<id>/."""
from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_data import fold_section_label

def _icon(theme: str, name: str, left: float, top: float, size: float = 12, *,
          zIndex: int = 3, page: int = 1) -> dict:
    return {
        "category": "image",
        "src": f"{BACKEND_URL}/template-assets/iconic/{theme}/{name}.png",
        "left": left,
        "top": top,
        "width": size,
        "height": size,
        "zIndex": zIndex,
        "page": page,
        # `top` is the companion label's CSS top; PDF/canvas centre the glyph.
        "alignWithText": True,
        # Default layout ownership for contact/masthead glyphs. Section
        # headings overwrite this with flowRole="section-chrome".
        "flowRole": "masthead",
    }


def _icon_beside(theme: str, name: str, left: float, text_top: float,
                 text_fs: float, size: float = 11, *, page: int = 1) -> dict:
    """Place an icon on the same row as a text label (shared logical top)."""
    del text_fs  # kept for call-site compatibility with older generators
    return _icon(theme, name, left, text_top, size, page=page)


def _icon_key_for_label(label: str) -> str:
    folded = fold_section_label(label)
    mapping = (
        (("podsumow", "summary", "profil"), "summary"),
        (("doswiadcz", "experience", "praca"), "experience"),
        (("wyksztal", "education", "edukac"), "education"),
        (("umiejet", "kompetenc", "skill"), "skills"),
        (("jezyk", "language"), "languages"),
        (("zainteres", "hobby", "interest"), "interests"),
        (("referenc", "reference"), "references"),
        (("certyfik", "kurs", "szkolen", "licenc", "certif"), "certifications"),
    )
    for tokens, key in mapping:
        if any(token in folded for token in tokens):
            return key
    return "other"
