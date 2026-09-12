"""Read interview charges from the durable ledger without invoking or settling AI."""
from app.models.models import AiCreditReservation


def interview_credit_usage(db, row):
    """Return owned request totals and stage charges, including failed attempts.

    The caller must resolve an owned interview first. Historical and versioned
    reservation keys identify the request revision that incurred each charge.
    Replayed stages retain their original ledger row, so recovery never counts
    them twice. Reserved credits are deliberately excluded from charged totals.
    No provider payload, request hash or idempotency key leaves this boundary.
    """
    prefix = f"interview:{row.id}:"
    reservations = db.query(
        AiCreditReservation.id, AiCreditReservation.idempotency_key,
        AiCreditReservation.charged_credits, AiCreditReservation.status,
        AiCreditReservation.created_at,
    ).filter(
        AiCreditReservation.user_id == row.owner_id,
        AiCreditReservation.action == "interview",
        AiCreditReservation.idempotency_key.startswith(prefix, autoescape=True),
    ).order_by(AiCreditReservation.created_at, AiCreditReservation.id).all()
    requests = {}
    for reservation in reservations:
        parts = reservation.idempotency_key[len(prefix):].split(":")
        # Discovery/legacy: revision:profile_revision:operation.
        # Generation: vN:attempt_id:operation:revision. A resumed stage belongs
        # to the request that actually paid for it, not the request reusing it.
        if len(parts) == 4 and parts[0].startswith("v"):
            stage, revision = parts[2], parts[3]
        elif len(parts) == 3:
            revision, stage = parts[0], parts[2]
        else:
            revision, stage = reservation.id, "other"
        fit_stage = 'shorten' if stage.startswith('fit-shorten-') else 'fit_verify' if stage.startswith('fit-verify-') else None
        operation = "next" if stage in {"next", "analysis"} else "preview" if stage in {"preview", "editorial", "verify"} or fit_stage else "other"
        key = (operation, revision)
        item = requests.setdefault(key, {
            "id": reservation.id, "operation": operation,
            "created_at": reservation.created_at.isoformat() + "Z",
            "credits_charged": 0, "pending": False, "stages": [],
        })
        charged = reservation.charged_credits
        item["credits_charged"] += charged
        item["pending"] = item["pending"] or reservation.status == "pending"
        item["stages"].append({
            "operation": fit_stage or (stage if stage in {"next", "analysis", "preview", "editorial", "verify"} else "other"),
            "credits_charged": charged, "status": reservation.status,
        })
    items = list(reversed(requests.values()))
    return {"credits_charged": sum(item["credits_charged"] for item in items), "requests": items}
