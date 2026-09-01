"""Threadpool contract for blocking PDF and CV-processing route handlers."""
from __future__ import annotations

import inspect

from app.api.routes import ai, pdf


def test_blocking_pdf_and_cv_routes_are_regular_functions() -> None:
    """Keep SQLAlchemy sessions and blocking provider/render work in one worker."""

    blocking_handlers = (
        pdf.create_user_pdf,
        pdf.render_user_pdf,
        pdf.update_user_pdf,
        pdf.download_pdf,
        ai.extract_cv,
        ai.fill_template,
    )

    assert all(
        not inspect.iscoroutinefunction(handler)
        for handler in blocking_handlers
    )
