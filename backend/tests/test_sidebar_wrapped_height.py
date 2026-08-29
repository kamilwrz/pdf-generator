"""Regression test for the Sterling/Slate sidebar section gap bug.

`_fit_sidebar_sections` (backend/app/services/cv_templates/shared/extras.py)
positions every sidebar section's heading at a fixed absolute top computed from
the PREVIOUS section's reserved body height. If that reserved height diverges
from the real rendered height, the gap between sections becomes visibly uneven
once the client canvas corrects each body box down to its real height (see the
module docstring on `_sidebar_wrapped_height` for the full explanation).

This pins `_sidebar_wrapped_height` to the same authoritative ReportLab
measurement (`Builder.measure_block`) used for every other body block in the
generator (education, main-column records, the summary), so a fitted section's
reserved height always equals its real height and consecutive sections keep an
identical gap.
"""
from app.services.cv_generator_primitives import Builder
from app.services.cv_templates.shared.extras import _sidebar_wrapped_height

WIDTH = 152
FONT_SIZE, LINE_HEIGHT = 8.3, 12.04
FONT = "Montserrat"


def test_sidebar_wrapped_height_matches_the_authoritative_measurer_for_a_flat_bullet_list():
    # A realistic 14-item skill list, including a long line that wraps to two
    # rows — the exact shape that previously diverged from real ReportLab
    # wrapping under the character-count heuristic.
    content = (
        "• Analiza AML/KYC\n• Transaction Monitoring\n• CDD / EDD\n"
        "• Screening (PEP, Sanctions, Adverse Media)\n• SAR Reporting\n"
        "• Analityczne myślenie\n• Dbałość o szczegóły\n• Praca zespołowa\n"
        "• MS Office\n• SAP\n• SAP CIC\n• SQL\n• Python\n• LexisNexis"
    )
    got = _sidebar_wrapped_height(
        content, WIDTH, FONT_SIZE, LINE_HEIGHT, font=FONT, bulletList=True,
    )
    want = Builder.measure_block(
        content, WIDTH, FONT_SIZE, LINE_HEIGHT, FONT,
        bulletList=True, min_h=LINE_HEIGHT + 6,
    )
    assert got == want


def test_sidebar_wrapped_height_matches_the_authoritative_measurer_for_plain_lines():
    content = "Polski (C2)\nNiemiecki (C1)\nAngielski (B2)"
    got = _sidebar_wrapped_height(
        content, WIDTH, FONT_SIZE, LINE_HEIGHT, font=FONT, bulletList=False,
    )
    want = Builder.measure_block(
        content, WIDTH, FONT_SIZE, LINE_HEIGHT, FONT,
        bulletList=False, min_h=LINE_HEIGHT + 6,
    )
    assert got == want


def test_consecutive_fitted_sections_keep_an_identical_trailing_gap():
    """End-to-end: two very differently-shaped bodies still reserve exactly
    their real height, so the gap `_fit_sidebar_sections` leaves before the
    next section's kicker is identical regardless of content shape."""
    from app.services.cv_templates.shared.extras import _fit_sidebar_sections

    skills_content = (
        "• Analiza AML/KYC\n• Transaction Monitoring\n• CDD / EDD\n"
        "• Screening (PEP, Sanctions, Adverse Media)\n• SAR Reporting\n"
        "• Analityczne myślenie\n• Dbałość o szczegóły\n• Praca zespołowa\n"
        "• MS Office\n• SAP\n• SAP CIC\n• SQL\n• Python\n• LexisNexis"
    )
    languages_content = "Polski (C2)\nNiemiecki (C1)\nAngielski (B2)"
    candidates = [
        {"key": "skills", "kind": "skills", "title": "UMIEJĘTNOŚCI", "content": skills_content, "bulletList": True},
        {"key": "languages", "kind": "languages", "title": "JĘZYKI", "content": languages_content, "bulletList": False},
    ]
    fitted, _ = _fit_sidebar_sections(candidates, width=WIDTH, start_y=200.0, bottom_y=760.0, font=FONT)
    assert len(fitted) == 2
    skills, languages = fitted

    def trailing_gap(section: dict) -> float:
        # Real body bottom (using the section's own fitted font/line-height,
        # matching what `_fitted_sidebar_body_elements` renders) to the next
        # section's kicker top. Both must agree because the reserved height
        # now equals the real rendered height.
        real_body_h = Builder.measure_block(
            section["content"], WIDTH, section["fontSize"], section["lineHeight"],
            FONT, bulletList=bool(section["bulletList"]), min_h=section["lineHeight"] + 6,
        )
        assert real_body_h == section["body_height"]
        return real_body_h

    trailing_gap(skills)
    trailing_gap(languages)
    skills_gap = languages["top"] - (skills["body_top"] + skills["body_height"])
    assert skills_gap == 18.0


def test_fit_sidebar_sections_does_not_place_an_orphan_kicker_in_the_footer():
    """A heading with no room for two body lines must not occupy the leftover band.

    Sterling's multi-page rail previously emitted UMIEJĘTNOŚCI at the page-1
    footer while the skills list started page 2. `_fit_sidebar_sections` now
    requires kicker chrome plus two body lines before accepting a section.
    """
    from app.services.cv_templates.shared.extras import _fit_sidebar_sections

    long_skills = "\n".join(f"• Kompetencja numer {index}" for index in range(1, 16))
    candidates = [
        {
            "key": "skills",
            "kind": "skills",
            "title": "UMIEJĘTNOŚCI",
            "content": long_skills,
            "bulletList": True,
        },
    ]
    # ~40px leftover — enough for the kicker chrome, not for two body lines.
    fitted, placed_keys = _fit_sidebar_sections(
        candidates, width=WIDTH, start_y=720.0, bottom_y=760.0, font=FONT,
    )
    assert fitted == []
    assert placed_keys == set()
