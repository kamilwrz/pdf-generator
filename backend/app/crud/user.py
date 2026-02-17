from sqlalchemy.orm import Session
from app.models.models import User
from app.schemas.user_schema import UserCreateRequest
from datetime import datetime, timezone
from app.core.security import hash_password, verify_password

def get_user_by_username(db:Session, username: str):
    return db.query(User).filter(User.username == username).first()

def create_user(db:Session, user: UserCreateRequest):
    hashed_password = hash_password(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        created_at=datetime.now(timezone.utc),
        is_active=True
        )
    db.add(db_user)
    db.commit()
    return "user registration complete"

def authenticate_user(username: str, password: str, db: Session):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user