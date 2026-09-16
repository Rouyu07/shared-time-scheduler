"""Store every absolute instant as PostgreSQL timestamptz.

Existing Prisma timestamp values were written as UTC without an offset.  The
USING clauses preserve those instants by interpreting each old value as UTC.

Revision ID: 20260916_0002
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260916_0002"
down_revision = "20260916_0001"
branch_labels = None
depends_on = None


INSTANT_COLUMNS = {
    "schedules": ("voting_closed_at", "deadline", "created_at", "updated_at"),
    "participants": ("availability_submitted_at", "joined_at", "updated_at"),
    "availabilities": ("start_at", "created_at"),
    "candidate_times": ("start_at", "end_at", "created_at"),
    "votes": ("created_at", "updated_at"),
    "comments": ("created_at", "updated_at"),
    "meetings": ("start_at", "end_at", "confirmed_at"),
}


def upgrade():
    connection = op.get_bind()
    inspector = inspect(connection)
    existing_tables = set(inspector.get_table_names())
    for table, names in INSTANT_COLUMNS.items():
        if table not in existing_tables:
            raise RuntimeError(f"Required table is missing: {table}")
        columns = {column["name"]: column for column in inspector.get_columns(table)}
        for name in names:
            if name not in columns:
                raise RuntimeError(f"Required column is missing: {table}.{name}")
            column_type = columns[name]["type"]
            if getattr(column_type, "timezone", False):
                continue
            op.alter_column(
                table,
                name,
                existing_type=column_type,
                type_=sa.DateTime(timezone=True),
                postgresql_using=f"{name} AT TIME ZONE 'UTC'",
                existing_nullable=columns[name]["nullable"],
            )


def downgrade():
    raise RuntimeError(
        "Timezone-aware instant migration is intentionally irreversible to protect stored instants"
    )
