from collections.abc import Generator
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
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


def build_main_engine():
    """Create engine for configured database."""
    main_url = (
        f"postgresql+psycopg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )
    return create_engine(main_url)


def build_test_engine():
    """Create engine bound to dedicated test schema."""
    schema_name = build_test_schema_name()
    main_url = (
        f"postgresql+psycopg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )
    return create_engine(
        main_url,
        connect_args={"options": f"-csearch_path={schema_name},public"},
    )


@pytest.fixture(scope="session")
def test_engine():
    """Provide isolated test engine for all test modules."""
    schema_name = build_test_schema_name()
    main_engine = build_main_engine()
    with main_engine.connect() as connection:
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
        connection.commit()
    main_engine.dispose()

    engine = build_test_engine()
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)
    main_engine = build_main_engine()
    with main_engine.connect() as connection:
        connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
        connection.commit()
    main_engine.dispose()
    engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def db(test_engine) -> Generator[Session, None, None]:
    with Session(test_engine) as session:
        init_db(session)
        yield session


@pytest.fixture(scope="module")
def client(test_engine) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[deps.get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(deps.get_db, None)


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
