"""Request body for user registration."""

from pydantic import BaseModel


class UserCreateRequest(BaseModel):
    """Credentials and optional plan slug chosen at signup.

    `plan` defaults to free. Paid values are only honoured when unpaid plan
    selection is enabled; otherwise registration forces Free.
    """

    username: str
    password: str
    email: str
    plan: str = "free"
