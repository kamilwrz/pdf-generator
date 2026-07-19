from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette import status
from app.schemas.user_schema import UserCreateRequest
from app.crud.user import get_user_by_username, create_user, authenticate_user
from fastapi.security import OAuth2PasswordRequestForm
from app.core.security import create_access_token, verify_token
import os
from datetime import timedelta
from app.dependencies import get_db

token_exp_min = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

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
    access_token_expires = timedelta(minutes=token_exp_min)
    access_token = create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/verify-token/{token}")
async def verify_user_token(token:str):
    verify_token(token=token)
    return {"message": "Token jest prawidłowy."}

