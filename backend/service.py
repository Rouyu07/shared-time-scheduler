from datetime import datetime, timezone
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from . import models as m
from .auth import hash_token, matches, new_id, new_token
from .scheduling import Rules, best_of, recommend, slot_grid, utc_aware, utc_iso, utc_naive, wall_instant


LOAD = (
    selectinload(m.Schedule.participants).selectinload(m.Participant.availabilities),
    selectinload(m.Schedule.candidate_times), selectinload(m.Schedule.votes),
    selectinload(m.Schedule.comments), selectinload(m.Schedule.meeting),
)


def now(): return datetime.now(timezone.utc)
def fail(message, status=400): raise HTTPException(status, message)


def rules_of(s): return Rules(s.start_date, s.end_date, s.daily_start_time, s.daily_end_time, s.duration_minutes, s.timezone)


def get_schedule(db, public_id: str, lock=False):
    if not (16 <= len(public_id) <= 64) or not all(c.isalnum() or c in "_-" for c in public_id): fail("找不到排程。", 404)
    query = select(m.Schedule).where(m.Schedule.public_id == public_id).options(*LOAD)
    if lock: query = query.with_for_update()
    schedule = db.scalars(query).first()
    if not schedule: fail("找不到排程。", 404)
    return schedule


def actor(s, token): return next((p for p in s.participants if matches(token, p.participant_token_hash)), None)
def participant(s, token):
    found = actor(s, token)
    if not found: fail("請先加入排程；若已清除 Cookie，無法辨識原身分。", 401)
    return found
def admin(s, token):
    if not matches(token, s.admin_token_hash): fail("需要有效的管理連結或管理 Cookie。", 403)
def collecting(s):
    if s.status != m.ScheduleStatus.COLLECTING: fail("已進入投票或排程結束，可行時間已鎖定。", 409)
    if s.deadline and s.deadline <= now(): fail("填寫截止時間已過。", 409)


def results_of(s):
    return recommend(rules_of(s), [{"name": p.name, "submitted": p.availability_submitted_at is not None, "slots": [a.start_at for a in p.availabilities]} for p in s.participants], s.expected_participants)


def present(s, admin_token=None, participant_token=None):
    me = actor(s, participant_token); results = results_of(s); best = best_of(results)
    candidates = sorted(s.candidate_times, key=lambda c: c.start_at)
    comments = sorted(s.comments, key=lambda c: c.created_at)
    creator_participant_id = min(s.participants, key=lambda p: p.joined_at).id if s.participants else None
    return {
      "publicId": s.public_id, "title": s.title, "creatorName": s.creator_name, "description": s.description,
      "startDate": s.start_date.isoformat(), "endDate": s.end_date.isoformat(), "dailyStartTime": s.daily_start_time.strftime("%H:%M"), "dailyEndTime": s.daily_end_time.strftime("%H:%M"), "durationMinutes": s.duration_minutes, "timezone": s.timezone,
      "expectedParticipants": s.expected_participants, "deadline": utc_iso(s.deadline) if s.deadline else None, "status": s.status.value, "votingClosedAt": utc_iso(s.voting_closed_at) if s.voting_closed_at else None,
      "isAdmin": matches(admin_token, s.admin_token_hash),
      "me": {"id": me.id, "name": me.name, "slots": [utc_iso(a.start_at) for a in me.availabilities], "submitted": me.availability_submitted_at is not None, "submittedAt": utc_iso(me.availability_submitted_at) if me.availability_submitted_at else None} if me else None,
      "participants": [{"id": p.id, "name": p.name, "submitted": p.availability_submitted_at is not None, "submittedAt": utc_iso(p.availability_submitted_at) if p.availability_submitted_at else None} for p in sorted(s.participants, key=lambda p: p.joined_at)],
      "grid": slot_grid(rules_of(s)), "results": results, "best": best,
      "candidates": [{"id": c.id, "startAt": utc_iso(c.start_at), "endAt": utc_iso(c.end_at), "votes": sum(v.candidate_time_id == c.id for v in s.votes)} for c in candidates],
      "myVote": next((v.candidate_time_id for v in s.votes if me and v.participant_id == me.id), None), "voted": len(s.votes),
      "comments": [{"id": c.id, "participantId": c.participant_id, "name": next((p.name for p in s.participants if p.id == c.participant_id), ""), "role": "建立者" if c.participant_id == creator_participant_id else "參與者", "content": c.content, "createdAt": utc_iso(c.created_at)} for c in comments],
      "meeting": {"startAt": utc_iso(s.meeting.start_at), "endAt": utc_iso(s.meeting.end_at), "location": s.meeting.location, "meetingUrl": s.meeting.meeting_url, "description": s.meeting.description, "reminderMinutes": s.meeting.reminder_minutes, "confirmedAt": utc_iso(s.meeting.confirmed_at)} if s.meeting else None,
    }


def create(db, value):
    at = now(); public_id = new_token()[:22]; admin_token = new_token(); participant_token = new_token()
    deadline = wall_instant(value.deadline.date(), value.deadline.time(), value.timezone) if value.deadline else None
    s = m.Schedule(id=new_id(), public_id=public_id, title=value.title, creator_name=value.creator_name, expected_participants=value.expected_participants, description=value.description, start_date=value.start_date, end_date=value.end_date, daily_start_time=value.daily_start_time, daily_end_time=value.daily_end_time, slot_minutes=30, duration_minutes=value.duration_minutes, timezone=value.timezone, deadline=utc_aware(deadline) if deadline else None, admin_token_hash=hash_token(admin_token), status=m.ScheduleStatus.COLLECTING, created_at=at, updated_at=at)
    s.participants.append(m.Participant(id=new_id(), name=value.creator_name, normalized_name=value.creator_name.casefold(), participant_token_hash=hash_token(participant_token), joined_at=at, updated_at=at))
    db.add(s); db.commit()
    return public_id, admin_token, participant_token


def join(db, public_id, name, participant_token):
    s = get_schedule(db, public_id, True); collecting(s)
    if actor(s, participant_token): fail("你已加入此排程。", 409)
    if len(s.participants) >= s.expected_participants: fail("參與人數已額滿。", 409)
    normalized = name.casefold()
    if any(p.normalized_name == normalized for p in s.participants): fail("此名稱已有人使用，請換一個名稱。", 409)
    token = new_token(); at = now(); db.add(m.Participant(id=new_id(), schedule_id=s.id, name=name, normalized_name=normalized, participant_token_hash=hash_token(token), joined_at=at, updated_at=at))
    try: db.commit()
    except IntegrityError: db.rollback(); fail("此名稱已有人使用或參與人數已額滿。", 409)
    return token


def save_availability(db, public_id, slots, token):
    s = get_schedule(db, public_id, True); p = participant(s, token); collecting(s)
    legal = {utc_naive(datetime.fromisoformat(x["startAt"].replace("Z", "+00:00"))) for day in slot_grid(rules_of(s)) for x in day["slots"]}
    chosen = {utc_naive(v) for v in slots}
    if not chosen <= legal: fail("可行時間包含範圍外或無效的時間格。")
    db.execute(delete(m.Availability).where(m.Availability.schedule_id == s.id, m.Availability.participant_id == p.id))
    at = now()
    for value in chosen: db.add(m.Availability(id=new_id(), schedule_id=s.id, participant_id=p.id, start_at=utc_aware(value), created_at=at))
    p.availability_submitted_at = at; p.updated_at = at; db.flush(); db.expire(s)
    s = get_schedule(db, public_id, True); best = best_of(results_of(s))
    if len(best) > 1:
        for candidate in best: db.add(m.CandidateTime(id=new_id(), schedule_id=s.id, start_at=utc_aware(datetime.fromisoformat(candidate["startAt"].replace("Z", "+00:00"))), end_at=utc_aware(datetime.fromisoformat(candidate["endAt"].replace("Z", "+00:00"))), created_at=at))
        s.status = m.ScheduleStatus.VOTING
    s.updated_at = at; db.commit()


def cast_vote(db, public_id, candidate_id, token):
    s = get_schedule(db, public_id, True); p = participant(s, token)
    if s.status != m.ScheduleStatus.VOTING or s.voting_closed_at: fail("目前不開放投票。", 409)
    if not any(c.id == candidate_id for c in s.candidate_times): fail("候選時間不屬於此排程。")
    existing = next((v for v in s.votes if v.participant_id == p.id), None); at = now()
    if existing: existing.candidate_time_id = candidate_id; existing.updated_at = at
    else: db.add(m.Vote(id=new_id(), schedule_id=s.id, candidate_time_id=candidate_id, participant_id=p.id, created_at=at, updated_at=at))
    db.commit()


def close_voting(db, public_id, token):
    s = get_schedule(db, public_id, True); admin(s, token)
    if s.status != m.ScheduleStatus.VOTING or s.voting_closed_at: fail("投票尚未開啟或已結束。", 409)
    s.voting_closed_at = now(); s.updated_at = now(); db.commit()


def confirm(db, public_id, value, token):
    s = get_schedule(db, public_id, True); admin(s, token)
    if s.status in (m.ScheduleStatus.CONFIRMED, m.ScheduleStatus.CANCELLED): fail("此排程已鎖定，無法再修改。", 409)
    best = best_of(results_of(s))
    if not best: fail("需等待全員提交後才能確認會議。", 409)
    if s.status == m.ScheduleStatus.VOTING and not s.voting_closed_at: fail("請先結束投票。", 409)
    start = utc_aware(value.start_at); chosen = next((b for b in best if utc_aware(datetime.fromisoformat(b["startAt"].replace("Z", "+00:00"))) == start), None)
    if not chosen: fail("請從最佳時段中選擇。")
    if len(best) > 1 and s.status != m.ScheduleStatus.VOTING: fail("並列時段必須先進行投票。", 409)
    at = now(); db.add(m.Meeting(id=new_id(), schedule_id=s.id, start_at=start, end_at=utc_aware(datetime.fromisoformat(chosen["endAt"].replace("Z", "+00:00"))), location=value.location, meeting_url=str(value.meeting_url) if value.meeting_url else "", description=value.description, reminder_minutes=value.reminder_minutes, confirmed_at=at)); s.status=m.ScheduleStatus.CONFIRMED; s.updated_at=at; db.commit()


def cancel(db, public_id, token):
    s=get_schedule(db, public_id, True); admin(s, token)
    if s.status == m.ScheduleStatus.CANCELLED: fail("排程已取消。", 409)
    s.status=m.ScheduleStatus.CANCELLED; s.updated_at=now(); db.commit()


def add_comment(db, public_id, content, token):
    s=get_schedule(db, public_id, True); p=participant(s, token)
    if s.status in (m.ScheduleStatus.CONFIRMED, m.ScheduleStatus.CANCELLED): fail("已完成或取消的排程為唯讀。", 409)
    at=now(); db.add(m.Comment(id=new_id(), schedule_id=s.id, participant_id=p.id, content=content, created_at=at, updated_at=at)); db.commit()


def delete_comment(db, public_id, comment_id, admin_token, participant_token):
    s=get_schedule(db, public_id, True)
    if s.status in (m.ScheduleStatus.CONFIRMED, m.ScheduleStatus.CANCELLED): fail("已完成或取消的排程為唯讀。", 409)
    comment=next((c for c in s.comments if c.id == comment_id), None)
    if not comment: fail("留言不存在。", 404)
    me=actor(s, participant_token)
    if not matches(admin_token, s.admin_token_hash) and (not me or me.id != comment.participant_id): fail("不能刪除其他人的留言。", 403)
    db.delete(comment); db.commit()
