from pydantic import BaseModel

#PYDANTIC MODEL FOR CREATING A USER VIA POST REQUEST
class UserCreateRequest(BaseModel):
    username: str
    password: str
    email: str




