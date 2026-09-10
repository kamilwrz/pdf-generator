"""Coverage for self-service data export and complete account erasure."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.database import Base
from app.models.models import (
    AiCreditReservation,
    BioCvDraft,
    CvImportSnapshot,
    EmailVerificationToken,
    Image,
    Payment,
    Pdf,
    PdfElements,
    Plan,
    UsageCounter,
    User,
    UserSubscription,
)
from app.services.account_data_service import build_account_export, delete_account_data


def _session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _seed_account(db):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user = User(
        username="privacy-user",
        email="privacy@example.com",
        hashed_password="legacy-secret-hash",
        argon2_password_hash="argon-secret-hash",
        google_sub="google-secret-subject",
        email_verified_at=now,
        created_at=now,
        is_active=True,
        image_slots_used=1,
    )
    db.add(user)
    db.flush()
    plan = Plan(
        slug="free",
        name="Darmowy",
        ai_assistant=False,
        extract_cv=True,
        template_tier="starter",
        is_active=True,
    )
    db.add(plan)
    db.flush()
    imported = CvImportSnapshot(
        owner_id=user.id,
        source_filename="cv.pdf",
        source_size_bytes=123,
        status="succeeded",
        cv_data={"name": "Jan Testowy"},
        created_at=now,
        completed_at=now,
    )
    image = Image(
        filename="portrait.png",
        file_path=None,
        file_size=42,
        mime_type="image/png",
        uploaded_at=now,
        owner_id=user.id,
    )
    db.add_all([imported, image])
    db.flush()
    document = Pdf(
        title="CV",
        owner_id=user.id,
        source_import_id=imported.id,
        created_at=now,
        updated_at=now,
        pages=1,
        revision=1,
        cv_data={"email": "privacy@example.com"},
        watermarked=False,
    )
    db.add(document)
    db.flush()
    db.add_all(
        [
            PdfElements(pdf_id=document.id, img_id=image.id, element_id="name", category="text", content="Jan Testowy"),
            BioCvDraft(owner_id=user.id, cv_data={"name": "Jan Testowy"}, created_at=now, updated_at=now),
            UserSubscription(user_id=user.id, plan_slug="free", status="active", updated_at=now),
            UsageCounter(user_id=user.id, period_key="2026-09"),
        ]
    )
    return user, now


def test_export_includes_user_content_but_excludes_authentication_secrets():
    db = _session()
    user, now = _seed_account(db)
    db.add_all(
        [
            EmailVerificationToken(
                user_id=user.id,
                token_hash="verification-secret",
                created_at=now,
                expires_at=now + timedelta(hours=24),
            ),
            AiCreditReservation(
                id="00000000-0000-0000-0000-000000000001",
                user_id=user.id,
                period_key="2026-09",
                action="rewrite",
                idempotency_key="private-idempotency-key",
                request_hash="private-request-hash",
                reserved_credits=1,
                charged_credits=1,
                status="settled",
                response_json={"text": "Lepszy opis"},
                created_at=now,
                expires_at=now + timedelta(minutes=10),
                settled_at=now,
            ),
            Payment(
                user_id=user.id,
                provider="stripe",
                provider_ref="cs_test_123",
                plan_slug="pro",
                amount_cents=5900,
                currency="pln",
                status="succeeded",
                raw={"customer_email": "privacy@example.com"},
                created_at=now,
                paid_at=now,
            ),
        ]
    )
    db.commit()

    exported = build_account_export(db, user=user)
    serialized = str(exported)

    assert exported["account"]["email"] == "privacy@example.com"
    assert exported["documents"][0]["elements"][0]["content"] == "Jan Testowy"
    assert exported["ai_operations"][0]["response_json"] == {"text": "Lepszy opis"}
    assert exported["payments"][0]["raw"]["customer_email"] == "privacy@example.com"
    assert "argon-secret-hash" not in serialized
    assert "legacy-secret-hash" not in serialized
    assert "google-secret-subject" not in serialized
    assert "verification-secret" not in serialized
    assert "private-idempotency-key" not in serialized
    assert "private-request-hash" not in serialized


def test_delete_account_removes_every_user_owned_database_record(monkeypatch):
    db = _session()
    user, now = _seed_account(db)
    db.add_all(
        [
            EmailVerificationToken(user_id=user.id, token_hash="token", created_at=now, expires_at=now + timedelta(hours=24)),
            AiCreditReservation(
                id="00000000-0000-0000-0000-000000000002",
                user_id=user.id,
                period_key="2026-09",
                action="rewrite",
                idempotency_key="delete-key",
                request_hash="delete-hash",
                reserved_credits=1,
                charged_credits=0,
                status="failed",
                created_at=now,
                expires_at=now + timedelta(minutes=10),
            ),
            Payment(user_id=user.id, provider="stripe", provider_ref="cs_delete", currency="pln", status="pending", created_at=now),
        ]
    )
    db.commit()
    user_id = int(user.id)
    monkeypatch.setattr("app.services.account_data_service.process_cleanup_jobs", lambda *args, **kwargs: 0)

    delete_account_data(db, user_id=user_id)

    assert db.query(User).filter(User.id == user_id).count() == 0
    for model, owner_field in [
        (Pdf, Pdf.owner_id),
        (Image, Image.owner_id),
        (BioCvDraft, BioCvDraft.owner_id),
        (CvImportSnapshot, CvImportSnapshot.owner_id),
        (UserSubscription, UserSubscription.user_id),
        (UsageCounter, UsageCounter.user_id),
        (AiCreditReservation, AiCreditReservation.user_id),
        (Payment, Payment.user_id),
        (EmailVerificationToken, EmailVerificationToken.user_id),
    ]:
        assert db.query(model).filter(owner_field == user_id).count() == 0
    assert db.query(PdfElements).count() == 0
