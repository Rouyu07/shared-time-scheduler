from datetime import date, datetime, time
from zoneinfo import ZoneInfo
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator
from .scheduling import Rules, slot_grid, wall_instant


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=lambda s: s.split("_")[0] + "".join(p.title() for p in s.split("_")[1:]), populate_by_name=True)


class CreateSchedule(CamelModel):
    title: str = Field(min_length=1, max_length=120)
    creator_name: str = Field(min_length=1, max_length=40)
    expected_participants: int = Field(ge=1, le=100)
    description: str = Field(default="", max_length=5000)
    start_date: date
    end_date: date
    daily_start_time: time
    daily_end_time: time
    duration_minutes: int = Field(ge=30, le=1410, multiple_of=30)
    timezone: str = Field(default="Asia/Taipei", max_length=64)
    deadline: datetime | None = None

    @field_validator("deadline", mode="before")
    @classmethod
    def empty_deadline(cls, value):
        return None if value == "" else value

    @field_validator("title", "creator_name")
    @classmethod
    def strip_required(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("請輸入內容")
        return value

    @model_validator(mode="after")
    def valid_rules(self):
        try:
            ZoneInfo(self.timezone)
        except Exception as exc:
            raise ValueError("IANA 時區無效") from exc
        if self.end_date < self.start_date or (self.end_date - self.start_date).days > 30:
            raise ValueError("日期需為連續 1～31 天")
        start = self.daily_start_time.hour * 60 + self.daily_start_time.minute
        end = self.daily_end_time.hour * 60 + self.daily_end_time.minute
        if end - start < self.duration_minutes:
            raise ValueError("每日範圍必須足夠容納會議，且不可跨午夜")
        rules = Rules(self.start_date, self.end_date, self.daily_start_time, self.daily_end_time, self.duration_minutes, self.timezone)
        if not any(len(day["slots"]) >= self.duration_minutes // 30 for day in slot_grid(rules)):
            raise ValueError("此時區與範圍沒有足夠的有效時間格")
        if self.deadline:
            local_deadline = wall_instant(self.deadline.date(), self.deadline.time(), self.timezone)
            if local_deadline <= datetime.now(local_deadline.tzinfo):
                raise ValueError("截止時間必須在未來")
        return self


class Join(CamelModel):
    name: str = Field(min_length=1, max_length=40)
    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("請輸入名稱")
        return value


class AvailabilityInput(CamelModel):
    slots: list[datetime] = Field(max_length=1488)


class VoteInput(CamelModel):
    candidate_id: str = Field(min_length=1, max_length=100)


class CommentInput(CamelModel):
    content: str = Field(min_length=1, max_length=500)
    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("請輸入留言")
        return value


class AdminSession(CamelModel):
    token: str = Field(min_length=1, max_length=256)


class MeetingInput(CamelModel):
    start_at: datetime
    location: str = Field(default="", max_length=200)
    meeting_url: HttpUrl | None = Field(default=None)
    description: str = Field(default="", max_length=5000)
    reminder_minutes: int | None = Field(default=None, ge=0, le=40320)

    @field_validator("meeting_url", mode="before")
    @classmethod
    def empty_meeting_url(cls, value):
        return None if value == "" else value
