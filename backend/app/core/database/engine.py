"""
Shared SQLAlchemy engine singletons.

- async_engine / AsyncSessionFactory → used by FastAPI routes (full async path)
- sync_engine                         → used by Alembic, seed scripts, Celery workers
"""

from __future__ import annotations

from sqlalchemy import create_engine as _create_sync_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import Session

from app.core.config import settings

# ---------------------------------------------------------------------------
# Derive URLs from the single SQLALCHEMY_DATABASE_URI setting
# ---------------------------------------------------------------------------

_SYNC_URL = str(settings.SQLALCHEMY_DATABASE_URI)
_ASYNC_URL = _SYNC_URL.replace("postgresql+psycopg", "postgresql+asyncpg")

# ---------------------------------------------------------------------------
# Async engine (FastAPI)
# ---------------------------------------------------------------------------

async_engine = create_async_engine(
    _ASYNC_URL,
    future=True,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# ---------------------------------------------------------------------------
# Sync engine (scripts / Celery workers / Alembic)
# ---------------------------------------------------------------------------

sync_engine = _create_sync_engine(
    _SYNC_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)


def get_sync_session() -> Session:
    """Return a new sync session bound to sync_engine (for scripts / Celery)."""
    return Session(sync_engine)
