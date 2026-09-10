"""Authenticated self-service data access and account erasure routes."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.dependencies import get_db
from app.models.models import User
from app.schemas.account_schema import AccountDeletionRequest
from app.services.account_data_service import build_account_export, delete_account_data

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/export")
def export_account_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a JSON copy of the authenticated user's stored data."""

    payload = build_account_export(db, user=current_user)
    filename = f"cv-studio-data-{datetime.now(timezone.utc).date().isoformat()}.json"
    return JSONResponse(
        content=jsonable_encoder(payload),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("")
def delete_account(
    request: AccountDeletionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently erase the authenticated account after exact confirmation."""

    if request.confirmation.strip() != current_user.username:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "confirmation_mismatch",
                "message": "Wpisz dokładną nazwę użytkownika, aby usunąć konto.",
            },
        )
    try:
        delete_account_data(db, user_id=int(current_user.id))
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Konto nie istnieje.",
        ) from exc
    return {"deleted": True}
