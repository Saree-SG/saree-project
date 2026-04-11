"""
Wipe projects/tasks/chat data but keep accounts/roles/departments.

Use-case: reset the DB to an "empty execution" state while preserving users and RBAC.

This script deletes:
- Chat rooms/members/messages/attachments
- Task progress/proofs/comments/observers/dependencies/audit logs
- Tasks + task level configs
- Project memberships + projects

It does NOT delete:
- Users
- Companies
- Departments
- Roles/permissions
"""

from __future__ import annotations

import argparse
import os
import sys

from sqlmodel import Session, delete

from app.core.config import settings
from app.core.db import engine
from app.models.chat import ChatAttachment, ChatMember, ChatMessage, ChatRoom
from app.models.org import ProjectMemberRole
from app.models.project import Project, TaskLevelConfig
from app.models.task import (
    AuditLog,
    Task,
    TaskComment,
    TaskDependency,
    TaskObserver,
    TaskProgressReport,
    TaskProof,
)


def parse_args() -> argparse.Namespace:
    """Parse CLI flags for the wipe script."""

    parser = argparse.ArgumentParser(
        description="Wipe tasks/projects/chat but keep accounts/RBAC."
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required acknowledgement that this will delete tenant execution data.",
    )
    return parser.parse_args()


def assert_wipe_allowed() -> None:
    """Abort when production would be affected without explicit override."""

    if settings.ENVIRONMENT == "production" and os.environ.get("ALLOW_RESET") != "1":
        print(
            "Refused: ENVIRONMENT=production. Set ALLOW_RESET=1 only if you intend to wipe this DB.",
            file=sys.stderr,
        )
        sys.exit(1)


def wipe_execution_data(session: Session) -> None:
    """Delete execution-scoped rows in FK-safe order (keep accounts + RBAC)."""

    session.exec(delete(ChatAttachment))
    session.exec(delete(ChatMessage))
    session.exec(delete(ChatMember))
    session.exec(delete(ChatRoom))

    session.exec(delete(TaskProgressReport))
    session.exec(delete(TaskProof))
    session.exec(delete(TaskComment))
    session.exec(delete(TaskObserver))
    session.exec(delete(TaskDependency))
    session.exec(delete(AuditLog))
    session.exec(delete(Task))
    session.exec(delete(TaskLevelConfig))

    session.exec(delete(ProjectMemberRole))
    session.exec(delete(Project))
    session.commit()


def main() -> None:
    """CLI entrypoint."""

    args = parse_args()
    if not args.confirm:
        print("Refused: pass --confirm to wipe tasks/projects/chat.", file=sys.stderr)
        sys.exit(1)
    assert_wipe_allowed()

    with Session(engine) as session:
        print("▶ Wiping tasks/projects/chat (keeping accounts/RBAC)…")
        wipe_execution_data(session)
        print("  ✓ Wipe complete")


if __name__ == "__main__":
    main()

