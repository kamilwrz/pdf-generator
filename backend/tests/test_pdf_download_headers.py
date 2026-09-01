"""Response-header hardening for user-visible PDF titles."""

from app.api.routes.pdf import _content_disposition


def test_content_disposition_cannot_inject_headers_from_legacy_title() -> None:
    """Legacy titles with CR/LF remain one safe attachment header value."""
    header = _content_disposition('resume\r\nX-Injected: yes\x00.pdf')

    assert "\r" not in header
    assert "\n" not in header
    assert "\x00" not in header
    assert "X-Injected%3A%20yes" in header
    assert header.startswith("attachment; filename=")
