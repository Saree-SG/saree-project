#! /usr/bin/env bash

set -e
set -x

# Let the DB start
python app/backend_pre_start.py

# Run migrations
# 0001_initial_schema is the single squashed migration.
# It uses SQLModel.metadata.create_all(checkfirst=True) which is fully
# idempotent: safe on fresh DBs (creates all tables) and existing DBs
# (skips tables that already exist). alembic upgrade head handles both cases.
alembic upgrade head

# Create initial data in DB
python app/initial_data.py

# One-off: nudge everyone with an open (un-checked-out) shift to check out now.
# Self-contained and best-effort — it always exits 0, but guard with `|| true`
# anyway so a notification hiccup can never abort the deploy (set -e is on).
python app/jobs/deploy_attendance_notice.py || true
