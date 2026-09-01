"""Atomic database-backed fixed-window throttles for auth endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import ipaddress
import os

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.models import AuthRateLimit


class AuthRateLimitExceeded(HTTPException):
    """Stable 429 response with the fixed window's remaining wait time."""

    def __init__(self, retry_after: int):
        super().__init__(
            status_code=429,
            detail={
                "code": "auth_rate_limited",
                "message": "Zbyt wiele prób. Spróbuj ponownie później.",
            },
            headers={"Retry-After": str(max(1, retry_after))},
        )


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _window(moment: datetime, seconds: int) -> tuple[datetime, datetime]:
    epoch = int(moment.timestamp())
    start = datetime.fromtimestamp(epoch - (epoch % seconds), tz=timezone.utc)
    return start, start + timedelta(seconds=seconds)


def _key_hash(scope: str, raw_key: str) -> str:
    """HMAC account/IP identifiers so the throttle table retains no raw PII."""
    secret = (os.getenv("SECRET_KEY") or "local-rate-limit-key").encode("utf-8")
    return hmac.new(secret, f"{scope}:{raw_key}".encode("utf-8"), hashlib.sha256).hexdigest()


def client_ip(request: Request) -> str:
    """Return a normalized client address through an explicitly trusted proxy.

    ``X-Forwarded-For`` is attacker-controlled on direct connections. It is
    read only when proxy-header support is enabled *and* the socket peer falls
    inside ``TRUSTED_PROXY_CIDRS``. Invalid or absent allowlists fail closed to
    the peer address, keeping registration/login buckets non-spoofable.
    """
    peer = request.client.host if request.client else "unknown"
    try:
        peer_address = ipaddress.ip_address(peer)
    except ValueError:
        return "unknown"

    trust_headers = os.getenv("TRUST_PROXY_HEADERS", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    trusted_networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    if trust_headers:
        for raw_network in os.getenv("TRUSTED_PROXY_CIDRS", "").split(","):
            raw_network = raw_network.strip()
            if not raw_network:
                continue
            try:
                trusted_networks.append(ipaddress.ip_network(raw_network, strict=False))
            except ValueError:
                # A malformed allowlist entry never broadens trust.
                continue

    trusted_peer = any(peer_address in network for network in trusted_networks)

    if trusted_peer:
        # Walk from the trusted edge toward the client. Trusted proxy hops are
        # skipped; the first untrusted address is the client bucket. Reading
        # the leftmost value would let an attacker prepend a spoofed address
        # when an edge appends (rather than overwrites) X-Forwarded-For.
        forwarded_chain = request.headers.get("x-forwarded-for", "").split(",")
        for forwarded in reversed(forwarded_chain):
            forwarded = forwarded.strip()
            if not forwarded:
                continue
            try:
                forwarded_address = ipaddress.ip_address(forwarded)
            except ValueError:
                continue
            if any(forwarded_address in network for network in trusted_networks):
                continue
            return forwarded_address.compressed
    return peer_address.compressed


def _retry_after(window_end: datetime, now: datetime) -> int:
    end = window_end if window_end.tzinfo else window_end.replace(tzinfo=timezone.utc)
    return max(1, int((end - now).total_seconds()))


def assert_not_rate_limited(
    db: Session,
    *,
    scope: str,
    raw_key: str,
    limit: int,
    window_seconds: int,
    now: datetime | None = None,
) -> None:
    """Reject a key whose current fixed-window counter already reached limit."""
    moment = now or _utcnow()
    start, _end = _window(moment, window_seconds)
    row = db.query(AuthRateLimit).filter(
        AuthRateLimit.scope == scope,
        AuthRateLimit.key_hash == _key_hash(scope, raw_key),
        AuthRateLimit.window_start == start,
    ).first()
    if row is not None and int(row.attempts or 0) >= limit:
        raise AuthRateLimitExceeded(_retry_after(row.window_end, moment))


def claim_rate_limit(
    db: Session,
    *,
    scope: str,
    raw_key: str,
    limit: int,
    window_seconds: int,
    now: datetime | None = None,
) -> int:
    """Atomically increment a fixed-window counter or raise at its ceiling."""
    moment = now or _utcnow()
    start, end = _window(moment, window_seconds)
    digest = _key_hash(scope, raw_key)
    db.commit()
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
    values = {
        "scope": scope,
        "key_hash": digest,
        "window_start": start,
        "window_end": end,
        "attempts": 1,
    }
    try:
        if dialect == "postgresql":
            statement = postgresql_insert(AuthRateLimit).values(**values)
        elif dialect == "sqlite":
            statement = sqlite_insert(AuthRateLimit).values(**values)
        else:
            query = db.query(AuthRateLimit).filter(
                AuthRateLimit.scope == scope,
                AuthRateLimit.key_hash == digest,
                AuthRateLimit.window_start == start,
            ).with_for_update()
            row = query.first()
            if row is None:
                row = AuthRateLimit(**values)
                db.add(row)
            elif row.attempts >= limit:
                raise AuthRateLimitExceeded(_retry_after(row.window_end, moment))
            else:
                row.attempts += 1
            db.commit()
            return int(row.attempts)

        statement = statement.on_conflict_do_update(
            index_elements=["scope", "key_hash", "window_start"],
            set_={"attempts": AuthRateLimit.attempts + 1},
            where=AuthRateLimit.attempts < limit,
        ).returning(AuthRateLimit.attempts)
        attempts = db.execute(statement).scalar_one_or_none()
        if attempts is None:
            db.rollback()
            raise AuthRateLimitExceeded(_retry_after(end, moment))
        db.commit()
        return int(attempts)
    except AuthRateLimitExceeded:
        db.rollback()
        raise


def clear_rate_limit(db: Session, *, scope: str, raw_key: str) -> None:
    """Clear account failures after a successful login; IP history remains."""
    db.query(AuthRateLimit).filter(
        AuthRateLimit.scope == scope,
        AuthRateLimit.key_hash == _key_hash(scope, raw_key),
    ).delete(synchronize_session=False)
    db.commit()


def release_rate_limit_claim(
    db: Session,
    *,
    scope: str,
    raw_key: str,
    window_seconds: int,
    now: datetime | None = None,
) -> None:
    """Atomically refund one admission claim that did not become a failure.

    Login claims are acquired before Argon2 verification so concurrent invalid
    requests cannot all allocate the password hasher's memory. A successful
    login or a local authentication error refunds its IP admission; if the
    second (IP) claim fails, the already-acquired account claim is refunded too.
    """

    moment = now or _utcnow()
    start, _end = _window(moment, window_seconds)
    digest = _key_hash(scope, raw_key)
    db.commit()
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
    query = db.query(AuthRateLimit).filter(
        AuthRateLimit.scope == scope,
        AuthRateLimit.key_hash == digest,
        AuthRateLimit.window_start == start,
    )
    if dialect == "postgresql":
        query = query.with_for_update()
    row = query.first()
    if row is None:
        db.commit()
        return
    if int(row.attempts or 0) <= 1:
        db.delete(row)
    else:
        row.attempts -= 1
    db.commit()
