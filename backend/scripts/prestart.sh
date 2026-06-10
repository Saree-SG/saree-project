#! /usr/bin/env bash

set -e
set -x

# Let the DB start
python app/backend_pre_start.py

# Run migrations
# 0001 uses SQLModel.metadata.create_all() — it creates the FULL current schema.
# On a fresh DB this means all tables are already created, so running the
# subsequent individual migrations (0002-0022) would fail with duplicate errors.
# Solution: if no migration has ever run (fresh DB), run only 0001 then stamp
# head so Alembic considers everything applied. On an existing DB that already
# has partial migrations, do a normal upgrade head.
CURRENT=$(alembic current 2>&1 | grep -E "[0-9a-f]" | head -1 || true)
if [ -z "$CURRENT" ]; then
  echo "Fresh database detected — creating schema and stamping head"
  alembic upgrade 0001_initial_schema
  alembic stamp head
else
  alembic upgrade head
fi

# Create initial data in DB
python app/initial_data.py

# One-off: nudge everyone with an open (un-checked-out) shift to check out now.
# Self-contained and best-effort — it always exits 0, but guard with `|| true`
# anyway so a notification hiccup can never abort the deploy (set -e is on).
python app/jobs/deploy_attendance_notice.py || true
