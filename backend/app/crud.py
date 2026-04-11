"""
CRUD helpers — thin wrappers kept for backward compatibility with scripts,
initial_data.py, and seed scripts that still use sync Session.

New code should use the service/repository layer.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models.user import User, UserCreate, UserUpdate

# Dummy hash for constant-time verification on missed lookups (timing attack prevention)
DUMMY_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4"
    "$MjQyZWE1MzBjYjJlZTI0Yw$YTU4NGM5ZTZmYjE2NzZlZjY0ZWY3ZGRkY2U2OWFjNjk"
)


def create_user(*, session: Session, user_create: UserCreate) -> User:
    """Create a user using sync session (for scripts/initial_data)."""
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> User:
    """Update a user using sync session (for scripts)."""
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data: dict = {}
    if "password" in user_data:
        extra_data["hashed_password"] = get_password_hash(user_data.pop("password"))
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    """Fetch user by email using sync session."""
    return session.exec(select(User).where(User.email == email)).first()


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    """Verify credentials using sync session (for scripts)."""
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        verify_password(password, DUMMY_HASH)
        return None
    verified, updated_hash = verify_password(password, db_user.hashed_password)
    if not verified:
        return None
    if updated_hash:
        db_user.hashed_password = updated_hash
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
    return db_user
