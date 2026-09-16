from __future__ import annotations
from datetime import date, datetime, time
from enum import Enum
from sqlalchemy import CheckConstraint, Date, DateTime, Enum as PgEnum, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class ScheduleStatus(str, Enum):
    COLLECTING = "COLLECTING"
    VOTING = "VOTING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"


class Schedule(Base):
    __tablename__ = "schedules"
    __table_args__ = (
        CheckConstraint("expected_participants BETWEEN 1 AND 100", name="schedule_valid_headcount"),
        CheckConstraint("end_date >= start_date AND end_date - start_date <= 30", name="schedule_valid_dates"),
        CheckConstraint("slot_minutes = 30 AND duration_minutes >= 30 AND duration_minutes % 30 = 0 AND daily_end_time > daily_start_time AND EXTRACT(EPOCH FROM daily_end_time - daily_start_time) >= duration_minutes * 60", name="schedule_valid_duration"),
        Index("schedules_status_idx", "status"), Index("schedules_deadline_idx", "deadline"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(255), unique=True)
    title: Mapped[str] = mapped_column(String(120))
    creator_name: Mapped[str] = mapped_column(String(40))
    expected_participants: Mapped[int] = mapped_column(Integer)
    voting_closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    daily_start_time: Mapped[time] = mapped_column(Time)
    daily_end_time: Mapped[time] = mapped_column(Time)
    slot_minutes: Mapped[int] = mapped_column(Integer, default=30)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Taipei")
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    admin_token_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[ScheduleStatus] = mapped_column(PgEnum(ScheduleStatus, name="ScheduleStatus"), default=ScheduleStatus.COLLECTING)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    participants: Mapped[list[Participant]] = relationship(back_populates="schedule", cascade="all, delete-orphan", foreign_keys="Participant.schedule_id")
    availabilities: Mapped[list[Availability]] = relationship(back_populates="schedule", cascade="all, delete-orphan", foreign_keys="Availability.schedule_id")
    candidate_times: Mapped[list[CandidateTime]] = relationship(back_populates="schedule", cascade="all, delete-orphan", foreign_keys="CandidateTime.schedule_id")
    votes: Mapped[list[Vote]] = relationship(back_populates="schedule", cascade="all, delete-orphan", foreign_keys="Vote.schedule_id")
    comments: Mapped[list[Comment]] = relationship(back_populates="schedule", cascade="all, delete-orphan", foreign_keys="Comment.schedule_id")
    meeting: Mapped[Meeting | None] = relationship(back_populates="schedule", uselist=False, cascade="all, delete-orphan", foreign_keys="Meeting.schedule_id")


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("schedule_id", "normalized_name", name="participants_schedule_id_normalized_name_key"), UniqueConstraint("id", "schedule_id", name="participants_id_schedule_unique"), Index("participants_schedule_id_idx", "schedule_id"))
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    schedule_id: Mapped[str] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(40))
    normalized_name: Mapped[str] = mapped_column(String(40))
    participant_token_hash: Mapped[str] = mapped_column(String(255))
    availability_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    schedule: Mapped[Schedule] = relationship(back_populates="participants", foreign_keys=[schedule_id])
    availabilities: Mapped[list[Availability]] = relationship(back_populates="participant", cascade="all, delete-orphan", foreign_keys="Availability.participant_id")
    votes: Mapped[list[Vote]] = relationship(back_populates="participant", cascade="all, delete-orphan", foreign_keys="Vote.participant_id")
    comments: Mapped[list[Comment]] = relationship(back_populates="participant", cascade="all, delete-orphan", foreign_keys="Comment.participant_id")


class Availability(Base):
    __tablename__ = "availabilities"
    __table_args__ = (ForeignKeyConstraint(["participant_id", "schedule_id"], ["participants.id", "participants.schedule_id"], name="availability_participant_schedule_fk", ondelete="CASCADE"), UniqueConstraint("participant_id", "start_at", name="availabilities_participant_id_start_at_key"), Index("availabilities_schedule_id_start_at_idx", "schedule_id", "start_at"), Index("availabilities_participant_id_idx", "participant_id"))
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    schedule_id: Mapped[str] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"))
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    schedule: Mapped[Schedule] = relationship(back_populates="availabilities", foreign_keys=[schedule_id])
    participant: Mapped[Participant] = relationship(back_populates="availabilities", foreign_keys=[participant_id])


class CandidateTime(Base):
    __tablename__ = "candidate_times"
    __table_args__ = (UniqueConstraint("schedule_id", "start_at", "end_at", name="candidate_times_schedule_id_start_at_end_at_key"), UniqueConstraint("id", "schedule_id", name="candidate_times_id_schedule_unique"), CheckConstraint("end_at > start_at", name="candidate_positive_interval"), Index("candidate_times_schedule_id_start_at_idx", "schedule_id", "start_at"))
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    schedule_id: Mapped[str] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    schedule: Mapped[Schedule] = relationship(back_populates="candidate_times", foreign_keys=[schedule_id])
    votes: Mapped[list[Vote]] = relationship(back_populates="candidate_time", cascade="all, delete-orphan", foreign_keys="Vote.candidate_time_id")


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (ForeignKeyConstraint(["participant_id", "schedule_id"], ["participants.id", "participants.schedule_id"], name="vote_participant_schedule_fk", ondelete="CASCADE"), ForeignKeyConstraint(["candidate_time_id", "schedule_id"], ["candidate_times.id", "candidate_times.schedule_id"], name="vote_candidate_schedule_fk", ondelete="CASCADE"), UniqueConstraint("schedule_id", "participant_id", name="votes_schedule_id_participant_id_key"), Index("votes_candidate_time_id_idx", "candidate_time_id"), Index("votes_participant_id_idx", "participant_id"))
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    schedule_id: Mapped[str] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"))
    candidate_time_id: Mapped[str] = mapped_column(ForeignKey("candidate_times.id", ondelete="CASCADE"))
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    schedule: Mapped[Schedule] = relationship(back_populates="votes", foreign_keys=[schedule_id])
    candidate_time: Mapped[CandidateTime] = relationship(back_populates="votes", foreign_keys=[candidate_time_id])
    participant: Mapped[Participant] = relationship(back_populates="votes", foreign_keys=[participant_id])


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (ForeignKeyConstraint(["participant_id", "schedule_id"], ["participants.id", "participants.schedule_id"], name="comment_participant_schedule_fk", ondelete="CASCADE"), Index("comments_schedule_id_created_at_idx", "schedule_id", "created_at"), Index("comments_participant_id_idx", "participant_id"))
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    schedule_id: Mapped[str] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"))
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    schedule: Mapped[Schedule] = relationship(back_populates="comments", foreign_keys=[schedule_id])
    participant: Mapped[Participant] = relationship(back_populates="comments", foreign_keys=[participant_id])


class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (CheckConstraint("end_at > start_at", name="meeting_positive_interval"), CheckConstraint("reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 40320", name="meeting_valid_reminder"),)
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    schedule_id: Mapped[str] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"), unique=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    location: Mapped[str | None] = mapped_column(String(200))
    meeting_url: Mapped[str | None] = mapped_column(String(2048))
    description: Mapped[str | None] = mapped_column(Text)
    reminder_minutes: Mapped[int | None] = mapped_column(Integer)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    schedule: Mapped[Schedule] = relationship(back_populates="meeting", foreign_keys=[schedule_id])
