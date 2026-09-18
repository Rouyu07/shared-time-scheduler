"""Add schedule-scoped participant notifications.

Revision ID: 20260918_0003
"""
from alembic import op
import sqlalchemy as sa


revision = "20260918_0003"
down_revision = "20260916_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notifications",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("schedule_id", sa.Text(), nullable=False),
        sa.Column("participant_id", sa.Text(), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["schedule_id"], ["schedules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["participant_id", "schedule_id"],
            ["participants.id", "participants.schedule_id"],
            name="notification_participant_schedule_fk",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "schedule_id",
            "participant_id",
            "type",
            name="notifications_schedule_participant_type_key",
        ),
    )
    op.create_index(
        "notifications_participant_created_at_idx",
        "notifications",
        ["participant_id", "created_at"],
    )
    op.create_index(
        "notifications_participant_read_at_idx",
        "notifications",
        ["participant_id", "read_at"],
    )
    op.create_index("notifications_schedule_id_idx", "notifications", ["schedule_id"])


def downgrade():
    op.drop_table("notifications")
