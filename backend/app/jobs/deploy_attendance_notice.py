"""
One-off deploy hook: notify every account with an OPEN (un-checked-out) shift to
check out now.

Run once per deploy from ``scripts/prestart.sh`` (after migrations + seed). This
clears the backlog of forgotten check-outs accumulated before the new check-out
policy. It MUST NEVER fail the deploy — every error is swallowed and logged, and
the process always exits 0.
"""

from __future__ import annotations

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> int:
    try:
        from sqlmodel import Session

        from app.core.database.engine import sync_engine
        from app.jobs.attendance_reminder_job import notify_all_open_now

        with Session(sync_engine) as session:
            count = notify_all_open_now(session)
        logger.info("Deploy attendance notice: notified %d open shift(s)", count)
    except Exception:
        # Never abort the deploy because of a notification failure.
        logger.exception("Deploy attendance notice failed — ignored")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
