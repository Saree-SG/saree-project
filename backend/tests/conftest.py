from collections.abc import Generator
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, Session, create_engine

from app.core.config import settings
from app.core.db import init_db
from app.api import deps
from app.main import app
from app import models as app_models  # noqa: F401
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers


def build_test_schema_name() -> str:
    """Build isolated schema name for test tables only."""
    raw_name = f"test_{settings.POSTGRES_DB}"
    return re.sub(r"[^a-zA-Z0-9_]", "_", raw_name)


def _pg_sync_url() -> str:
    """Return psycopg sync connection URL for the configured database."""
    return (
        f"postgresql+psycopg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )


def build_main_engine():
    """Create engine for configured database (default public schema)."""
    return create_engine(_pg_sync_url())


def build_ddl_engine(schema_name: str):
    """Create engine scoped to ONLY the test schema — used for CREATE/DROP TABLE.

    Deliberately excludes 'public' from search_path so that:
    - CREATE TABLE … IF NOT EXISTS never resolves an existing production table
      and skips creation in the test schema.
    - DROP TABLE … never falls through to the production public schema.
    """
    return create_engine(
        _pg_sync_url(),
        connect_args={"options": f"-csearch_path={schema_name}"},
    )


def build_test_engine():
    """Create engine bound to dedicated test schema (public also in path for built-ins)."""
    schema_name = build_test_schema_name()
    return create_engine(
        _pg_sync_url(),
        connect_args={"options": f"-csearch_path={schema_name},public"},
    )


def build_test_async_session_factory():
    """Create AsyncSession factory bound to the dedicated test schema.

    Our API routes are async and depend on `deps.get_async_db`, but the legacy
    test harness overrides only `deps.get_db`. This factory lets tests exercise
    async routes while still using the isolated test schema.
    """

    schema_name = build_test_schema_name()
    async_url = (
        f"postgresql+asyncpg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )
    engine = create_async_engine(
        async_url,
        connect_args={"server_settings": {"search_path": f"{schema_name},public"}},
        pool_pre_ping=True,
    )
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def test_engine():
    """Provide isolated test engine for all test modules.

    Lifecycle:
    - Setup:   create the test schema, then create all tables inside it using
               a DDL-only engine whose search_path has ONLY the test schema.
               This prevents 'IF NOT EXISTS' from resolving production tables
               in the public schema and silently skipping test-schema creation.
    - Yield:   the regular test engine (search_path = test_schema, public) for
               use by test fixtures that need public built-in functions.
    - Teardown: drop the entire test schema with CASCADE — no need to call
               drop_all because CASCADE removes every table atomically and
               never touches the public (production) schema.
    """
    schema_name = build_test_schema_name()

    main_engine = build_main_engine()
    with main_engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
        conn.commit()
    main_engine.dispose()

    ddl_engine = build_ddl_engine(schema_name)
    SQLModel.metadata.create_all(ddl_engine)
    ddl_engine.dispose()

    engine = build_test_engine()
    yield engine
    engine.dispose()

    main_engine = build_main_engine()
    with main_engine.connect() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
        conn.commit()
    main_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _init_test_db(test_engine) -> None:
    """Initialize seed data once per test session."""

    from app.scripts.seed_defaults import seed as seed_defaults
    with Session(test_engine) as session:
        init_db(session)
        # Seed a bootstrap company + permissions/roles so permission checks work in tests
        from app.models.org import Company
        from sqlmodel import select as _select
        bootstrap = session.exec(_select(Company).where(Company.slug == "__test_bootstrap__")).first()
        if bootstrap is None:
            bootstrap = Company(name="Bootstrap", slug="__test_bootstrap__")
            session.add(bootstrap)
            session.commit()
            session.refresh(bootstrap)
        seed_defaults(session, bootstrap.id)


@pytest.fixture(scope="function")
def db(test_engine) -> Generator[Session, None, None]:
    """Provide a fresh Session per test to avoid stale identity map caching."""

    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def client(test_engine) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        with Session(test_engine) as session:
            yield session

    async_session_factory = build_test_async_session_factory()

    async def override_get_async_db():
        """Mirror production get_async_db — one transaction per request."""

        async with async_session_factory() as session:
            async with session.begin():
                yield session

    def override_get_ws_session_factory():
        """Return the test-schema session factory for WebSocket per-message sessions."""
        return async_session_factory

    app.dependency_overrides[deps.get_db] = override_get_db
    app.dependency_overrides[deps.get_async_db] = override_get_async_db
    app.dependency_overrides[deps.get_ws_session_factory] = override_get_ws_session_factory
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(deps.get_db, None)
    app.dependency_overrides.pop(deps.get_async_db, None)
    app.dependency_overrides.pop(deps.get_ws_session_factory, None)


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="function")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
