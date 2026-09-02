"""Securely resolve a public job-offer URL into prompt-ready text.

The resolver treats every remote byte as untrusted. It accepts HTTPS only,
rejects non-public DNS results before every request and redirect, limits the
response size, and extracts only text or JobPosting JSON-LD. Provider-specific
adapters use the public Greenhouse and Lever JSON endpoints when possible.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from html import unescape
from html.parser import HTMLParser
from http.client import HTTPSConnection
import ipaddress
import json
import re
import socket
from typing import Callable
from urllib.parse import urljoin, urlparse

MAX_JOB_OFFER_BYTES = 1_048_576
MAX_JOB_DESCRIPTION_CHARS = 20_000
MAX_REDIRECTS = 3
REQUEST_TIMEOUT_SECONDS = 8
ALLOWED_CONTENT_TYPES = (
    "text/html",
    "application/json",
    "application/ld+json",
    "text/plain",
)


class JobOfferError(ValueError):
    """A safe, user-facing failure raised before the model is called."""

    def __init__(self, code: str, user_message: str):
        super().__init__(user_message)
        self.code = code
        self.user_message = user_message


@dataclass(frozen=True)
class ResolvedJobOffer:
    """Normalized offer metadata returned to the route and UI."""

    source_url: str
    resolved_url: str
    source: str
    title: str
    company: str
    location: str
    description: str
    fetch_warning: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


class _PinnedHTTPSConnection(HTTPSConnection):
    """Connect TLS to a prevalidated IP while retaining hostname verification."""

    def __init__(self, hostname: str, address: str):
        super().__init__(hostname, port=443, timeout=REQUEST_TIMEOUT_SECONDS)
        self._validated_address = address

    def connect(self):
        # Pinning the socket to the validated DNS answer closes the usual gap
        # where a hostname changes to a private address between validation and
        # the HTTP client's independent DNS lookup.
        self.sock = socket.create_connection(
            (self._validated_address, self.port),
            timeout=self.timeout,
            source_address=self.source_address,
        )
        if self._tunnel_host:
            self._tunnel()
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class _JobHtmlParser(HTMLParser):
    """Collect visible copy and JobPosting JSON-LD without executing markup."""

    _SKIPPED = {"script", "style", "nav", "form", "footer", "svg", "noscript"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.h1_parts: list[str] = []
        self.visible_parts: list[str] = []
        self.json_ld_parts: list[str] = []
        self._skip_depth = 0
        self._in_title = False
        self._in_h1 = False
        self._in_json_ld = False

    def handle_starttag(self, tag: str, attrs):  # noqa: ANN001
        tag = tag.lower()
        attrs_map = {str(key).lower(): str(value or "") for key, value in attrs}
        if tag == "script" and "ld+json" in attrs_map.get("type", "").lower():
            self._in_json_ld = True
            return
        if tag in self._SKIPPED:
            self._skip_depth += 1
        self._in_title = self._in_title or tag == "title"
        self._in_h1 = self._in_h1 or tag == "h1"

    def handle_endtag(self, tag: str):
        tag = tag.lower()
        if tag == "script" and self._in_json_ld:
            self._in_json_ld = False
            return
        if tag in self._SKIPPED and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False
        if tag == "h1":
            self._in_h1 = False

    def handle_data(self, data: str):
        value = _clean_text(data)
        if not value:
            return
        if self._in_json_ld:
            self.json_ld_parts.append(data)
            return
        if self._skip_depth:
            return
        if self._in_title:
            self.title_parts.append(value)
        if self._in_h1:
            self.h1_parts.append(value)
        self.visible_parts.append(value)


def _clean_text(value: object) -> str:
    """Collapse control characters and whitespace in untrusted remote copy."""
    text = unescape(str(value or ""))
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _strip_html(value: object) -> str:
    parser = _JobHtmlParser()
    parser.feed(str(value or ""))
    return _clean_text(" ".join(parser.visible_parts))


def _is_public_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    return ip.is_global


def _resolve_public_addresses(hostname: str, resolver: Callable) -> list[str]:
    try:
        literal = ipaddress.ip_address(hostname)
        addresses = [str(literal)]
    except ValueError:
        try:
            addresses = list({item[4][0] for item in resolver(hostname, 443, type=socket.SOCK_STREAM)})
        except (OSError, socket.gaierror) as exc:
            raise JobOfferError(
                "job_offer_host_unavailable",
                "Nie udało się odnaleźć serwera z ofertą.",
            ) from exc
    if not addresses or any(not _is_public_address(address) for address in addresses):
        raise JobOfferError(
            "unsafe_job_offer_url",
            "Ze względów bezpieczeństwa można pobierać tylko publiczne strony z ofertami.",
        )
    return addresses


def validate_job_offer_url(
    value: str,
    *,
    resolver: Callable = socket.getaddrinfo,
) -> str:
    """Validate scheme, authority, port, credentials, and all DNS answers."""
    raw = str(value or "").strip()
    if not raw or len(raw) > 2_048:
        raise JobOfferError("invalid_job_offer_url", "Podaj prawidłowy link HTTPS do oferty.")
    parsed = urlparse(raw)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise JobOfferError("invalid_job_offer_url", "Link do oferty musi używać HTTPS.")
    try:
        port = parsed.port
    except ValueError as exc:
        raise JobOfferError(
            "unsafe_job_offer_url",
            "Link do oferty zawiera nieprawidłowy port.",
        ) from exc
    if parsed.username or parsed.password or port not in {None, 443}:
        raise JobOfferError(
            "unsafe_job_offer_url",
            "Link do oferty zawiera niedozwolone dane logowania lub port.",
        )
    hostname = parsed.hostname.rstrip(".")
    _resolve_public_addresses(hostname, resolver)
    return raw


def _default_fetch(url: str, *, resolver: Callable = socket.getaddrinfo) -> tuple[str, str, bytes]:
    """Fetch one public document with manual, revalidated redirects."""
    current = validate_job_offer_url(url, resolver=resolver)
    for redirect_count in range(MAX_REDIRECTS + 1):
        parsed = urlparse(current)
        hostname = parsed.hostname or ""
        addresses = _resolve_public_addresses(hostname, resolver)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        connection = _PinnedHTTPSConnection(hostname, addresses[0])
        try:
            connection.request(
                "GET",
                path,
                headers={
                    "Accept": "text/html,application/json;q=0.9,text/plain;q=0.8",
                    "User-Agent": "CV-Studio-Job-Offer-Resolver/1.0",
                },
            )
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308} and response.getheader("Location"):
                if redirect_count >= MAX_REDIRECTS:
                    raise JobOfferError("job_offer_redirect_limit", "Oferta przekierowuje zbyt wiele razy.")
                current = validate_job_offer_url(
                    urljoin(current, response.getheader("Location")),
                    resolver=resolver,
                )
                continue
            if response.status >= 400:
                raise JobOfferError("job_offer_fetch_failed", "Nie udało się pobrać tej oferty.")
            content_type = str(response.getheader("Content-Type") or "").split(";", 1)[0].lower()
            if not any(content_type.startswith(value) for value in ALLOWED_CONTENT_TYPES):
                raise JobOfferError("job_offer_content_type", "Link nie prowadzi do obsługiwanej strony z ofertą.")
            content_length = response.getheader("Content-Length")
            if content_length and content_length.isdigit() and int(content_length) > MAX_JOB_OFFER_BYTES:
                raise JobOfferError("job_offer_too_large", "Strona z ofertą jest zbyt duża do analizy.")
            body = response.read(MAX_JOB_OFFER_BYTES + 1)
            if len(body) > MAX_JOB_OFFER_BYTES:
                raise JobOfferError("job_offer_too_large", "Strona z ofertą jest zbyt duża do analizy.")
            return current, content_type, body
        except JobOfferError:
            raise
        except (TimeoutError, OSError) as exc:
            raise JobOfferError("job_offer_fetch_failed", "Nie udało się pobrać tej oferty.") from exc
        finally:
            connection.close()
    raise JobOfferError("job_offer_redirect_limit", "Oferta przekierowuje zbyt wiele razy.")


def _job_posting_from_json(value: object) -> dict | None:
    if isinstance(value, list):
        for item in value:
            if result := _job_posting_from_json(item):
                return result
        return None
    if not isinstance(value, dict):
        return None
    graph = value.get("@graph")
    if graph and (result := _job_posting_from_json(graph)):
        return result
    posting_type = value.get("@type")
    types = posting_type if isinstance(posting_type, list) else [posting_type]
    if any(str(item).lower() == "jobposting" for item in types):
        return value
    return None


def _location_from_posting(posting: dict) -> str:
    location = posting.get("jobLocation")
    if isinstance(location, list):
        location = location[0] if location else {}
    if not isinstance(location, dict):
        return _clean_text(location)
    address = location.get("address")
    if not isinstance(address, dict):
        return _clean_text(address)
    return _clean_text(", ".join(
        str(address.get(key) or "")
        for key in ("addressLocality", "addressRegion", "addressCountry")
        if address.get(key)
    ))


def _parse_html(body: bytes) -> tuple[str, str, str, str]:
    parser = _JobHtmlParser()
    parser.feed(body.decode("utf-8", errors="replace"))
    for block in parser.json_ld_parts:
        try:
            posting = _job_posting_from_json(json.loads(block))
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
        if posting:
            organization = posting.get("hiringOrganization")
            company = organization.get("name") if isinstance(organization, dict) else organization
            return (
                _clean_text(posting.get("title")),
                _clean_text(company),
                _location_from_posting(posting),
                _strip_html(posting.get("description")),
            )
    return (
        _clean_text(" ".join(parser.h1_parts) or " ".join(parser.title_parts)),
        "",
        "",
        _clean_text(" ".join(parser.visible_parts)),
    )


def _provider_api_url(url: str) -> tuple[str, str] | None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    parts = [part for part in parsed.path.split("/") if part]
    if host in {"boards.greenhouse.io", "job-boards.greenhouse.io"} and len(parts) >= 3:
        try:
            jobs_index = parts.index("jobs")
            board = parts[0]
            job_id = parts[jobs_index + 1]
        except (ValueError, IndexError):
            return None
        return "greenhouse", f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}"
    if host in {"jobs.lever.co", "jobs.eu.lever.co"} and len(parts) >= 2:
        api_host = "api.eu.lever.co" if host == "jobs.eu.lever.co" else "api.lever.co"
        return "lever", f"https://{api_host}/v0/postings/{parts[0]}/{parts[1]}?mode=json"
    return None


def _looks_like_access_block(value: str) -> bool:
    """Detect short interstitials that are not actual job descriptions."""
    folded = value.casefold()
    signals = (
        "verify you are human",
        "checking your browser",
        "enable javascript and cookies",
        "captcha",
        "zaloguj się, aby kontynuować",
        "sign in to continue",
    )
    return len(value) < 1_500 and any(signal in folded for signal in signals)


def _parse_provider_json(provider: str, body: bytes) -> tuple[str, str, str, str]:
    try:
        payload = json.loads(body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        raise JobOfferError("job_offer_parse_failed", "Nie udało się odczytać treści oferty.") from exc
    if not isinstance(payload, dict):
        raise JobOfferError("job_offer_parse_failed", "Nie udało się odczytać treści oferty.")
    if provider == "greenhouse":
        location = payload.get("location") or {}
        departments = payload.get("departments") or []
        company = departments[0].get("name", "") if departments and isinstance(departments[0], dict) else ""
        return (
            _clean_text(payload.get("title")),
            _clean_text(company),
            _clean_text(location.get("name") if isinstance(location, dict) else location),
            _strip_html(payload.get("content")),
        )
    categories = payload.get("categories") or {}
    lists = payload.get("lists") or []
    list_copy = " ".join(
        f"{_clean_text(item.get('text'))}: {_strip_html(item.get('content'))}"
        for item in lists if isinstance(item, dict)
    )
    return (
        _clean_text(payload.get("text")),
        _clean_text(payload.get("company")),
        _clean_text(categories.get("location") if isinstance(categories, dict) else ""),
        _clean_text(f"{_strip_html(payload.get('descriptionPlain') or payload.get('description'))} {list_copy}"),
    )


def resolve_job_offer(
    job_offer_url: str = "",
    fallback_description: str = "",
    *,
    fetcher: Callable[[str], tuple[str, str, bytes]] | None = None,
    resolver: Callable = socket.getaddrinfo,
) -> dict:
    """Resolve a URL, or return the pasted description when URL retrieval fails.

    The fallback is deliberately explicit: remote failures never turn into an
    empty prompt, and the UI receives a warning explaining which source won.
    """
    fallback = _clean_text(fallback_description)[:MAX_JOB_DESCRIPTION_CHARS]
    url = str(job_offer_url or "").strip()
    if not url:
        if not fallback:
            raise JobOfferError("job_offer_required", "Wklej link do oferty lub jej opis.")
        return ResolvedJobOffer("", "", "manual", "", "", "", fallback).as_dict()

    validate_job_offer_url(url, resolver=resolver)
    fetch = fetcher or (lambda target: _default_fetch(target, resolver=resolver))
    try:
        provider_info = _provider_api_url(url)
        if provider_info:
            provider, api_url = provider_info
            validate_job_offer_url(api_url, resolver=resolver)
            resolved_url, _content_type, body = fetch(api_url)
            title, company, location, description = _parse_provider_json(provider, body)
            source = provider
        else:
            resolved_url, content_type, body = fetch(url)
            if "json" in content_type:
                payload = json.loads(body.decode("utf-8", errors="replace"))
                posting = _job_posting_from_json(payload) or (payload if isinstance(payload, dict) else {})
                organization = posting.get("hiringOrganization") if isinstance(posting, dict) else {}
                title = _clean_text(posting.get("title") if isinstance(posting, dict) else "")
                company = _clean_text(organization.get("name") if isinstance(organization, dict) else organization)
                location = _location_from_posting(posting) if isinstance(posting, dict) else ""
                description = _strip_html(posting.get("description") if isinstance(posting, dict) else "")
            else:
                title, company, location, description = _parse_html(body)
            source = "json_ld" if "json" in content_type else "html"
        description = _clean_text(description)[:MAX_JOB_DESCRIPTION_CHARS]
        if _looks_like_access_block(description):
            raise JobOfferError(
                "job_offer_access_blocked",
                "Strona wymaga logowania lub weryfikacji. Wklej treść oferty ręcznie.",
            )
        if not description:
            raise JobOfferError("job_offer_empty", "Na stronie nie znaleziono treści oferty.")
        return ResolvedJobOffer(
            url,
            resolved_url,
            source,
            title,
            company,
            location,
            description,
        ).as_dict()
    except (JobOfferError, json.JSONDecodeError, TypeError, ValueError) as exc:
        if not fallback:
            if isinstance(exc, JobOfferError):
                raise
            raise JobOfferError("job_offer_parse_failed", "Nie udało się odczytać treści oferty.") from exc
        return ResolvedJobOffer(
            url,
            "",
            "manual_fallback",
            "",
            "",
            "",
            fallback,
            "Nie udało się pobrać linku, dlatego użyto wklejonego opisu.",
        ).as_dict()
