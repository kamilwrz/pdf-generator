from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette import status
from app.schemas.user_schema import UserCreateRequest
from app.crud.user import get_user_by_username, create_user, authenticate_user
from fastapi.security import OAuth2PasswordRequestForm
from app.core.security import create_access_token, get_access_token_expire_minutes, verify_token
from datetime import timedelta
from app.dependencies import get_db
from app.services.entitlements import get_entitlements

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
);


@router.post("/register")
async def register_user(user:UserCreateRequest, db: Session = Depends(get_db)):
    db_user = get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Nazwa użytkownika jest już zarejestrowana.")
    return create_user(db=db, user=user)


@router.post("/token")
async def login_for_acess_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowa nazwa użytkownika lub hasło.",
            headers={"WWW-Authenticate" : "Bearer"},
        )
    access_token_expires = timedelta(minutes=get_access_token_expire_minutes())
    access_token = create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/verify-token/{token}")
async def verify_user_token(token:str):
    verify_token(token=token)
    return {"message": "Token jest prawidłowy."}


@router.get("/me/entitlements")
async def me_entitlements(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    username = payload.get("sub")
    user = get_user_by_username(db, username=username)
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    return get_entitlements(db, user)

