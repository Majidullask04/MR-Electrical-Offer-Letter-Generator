import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models import User
from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(ORMModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_active: bool
    last_login_at: datetime | None
    roles: list[str]
    primary_role: str
    created_at: datetime

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            last_login_at=user.last_login_at,
            roles=sorted(user.role_keys),
            primary_role=user.primary_role,
            created_at=user.created_at,
        )


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    role_key: str


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    is_active: bool | None = None
    role_key: str | None = None
    password: str | None = Field(default=None, min_length=10, max_length=200)


class RoleOut(ORMModel):
    key: str
    name: str
    description: str | None
