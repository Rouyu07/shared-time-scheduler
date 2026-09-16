"""Adopt the existing Prisma schema without rewriting existing data.

Revision ID: 20260916_0001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from backend.database import Base
from backend import models  # noqa: F401

revision = "20260916_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    existing = set(inspect(connection).get_table_names())
    expected = {"schedules", "participants", "availabilities", "candidate_times", "votes", "comments", "meetings"}
    if "schedules" in existing:
        missing = expected - existing
        if missing:
            raise RuntimeError(f"Existing schema is incomplete; refusing automatic migration. Missing: {sorted(missing)}")
        return
    Base.metadata.create_all(connection)


def downgrade():
    raise RuntimeError("This adoption migration is intentionally irreversible to protect schedule data")
