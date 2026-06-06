"""User model — extends base template User with org/availability fields."""

import uuid
from datetime import datetime, timezone

from pydantic import EmailStr
from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Shared properties
# ---------------------------------------------------------------------------
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# ---------------------------------------------------------------------------
# DB Table
# ---------------------------------------------------------------------------
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    # --- NEW FIELDS (org & availability) ---
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id", index=True)
    department_id: uuid.UUID | None = Field(default=None, foreign_key="department.id", index=True)
    job_title: str | None = Field(default=None, max_length=100)
    # free | busy | away — computed direction, but also settable manually
    availability_status: str = Field(default="free", max_length=20)

    # Relationships
    global_roles: list["UserGlobalRole"] = Relationship(back_populates="user", cascade_delete=True)
    company_roles: list["UserCompanyRole"] = Relationship(back_populates="user", cascade_delete=True)
    project_roles: list["ProjectMemberRole"] = Relationship(back_populates="user", cascade_delete=True)
    assigned_tasks: list["Task"] = Relationship(
        back_populates="assignee",
        sa_relationship_kwargs={"foreign_keys": "[Task.assignee_id]"},
    )
    created_tasks: list["Task"] = Relationship(
        back_populates="assignor",
        sa_relationship_kwargs={"foreign_keys": "[Task.assignor_id]"},
    )
    comments: list["TaskComment"] = Relationship(back_populates="author", cascade_delete=True)
    audit_logs: list["AuditLog"] = Relationship(back_populates="actor", cascade_delete=True)



# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None
    company_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    job_title: str | None = None
    availability_status: str = "free"


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# ---------------------------------------------------------------------------
# Login history (admin tracking)
# ---------------------------------------------------------------------------
class LoginHistory(SQLModel, table=True):
    __tablename__ = "loginhistory"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", index=True)
    email: str = Field(max_length=255, index=True)
    login_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
        index=True,
    )
    success: bool = Field(default=True, index=True)
    session_id: str | None = Field(default=None, max_length=64)
    ip_address: str | None = Field(default=None, max_length=64)
    user_agent: str | None = Field(default=None, max_length=512)


class LoginHistoryPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    email: str
    login_at: datetime
    success: bool
    session_id: str | None
    ip_address: str | None
    user_agent: str | None
