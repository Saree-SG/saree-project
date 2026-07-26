"""
Backward-compatible sync DB access.

Scripts (seed_defaults, reset_saree_process_demo, initial_data…) and Celery
workers import `engine` and `Session` from here.
FastAPI routes use AsyncSession from `app.api.deps` instead.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.core.database.engine import sync_engine

engine = sync_engine


def init_db(session: Session) -> None:
    """Create the first superuser + seed default skills if not exist (called by initial_data.py)."""
    from app import crud
    from app.core.config import settings
    from app.models.user import User, UserCreate

    user = session.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
        )
        crud.create_user(session=session, user_create=user_in)

    # Seed default skills for every company that has none yet
    from app.scripts.seed_skills import seed_skills_for_company
    from app.models.org import Company

    companies = session.exec(select(Company)).all()
    for company in companies:
        created = seed_skills_for_company(session, company)
        if created:
            import logging
            logging.getLogger(__name__).info("Seeded %d default skills for company %s", created, company.name)
