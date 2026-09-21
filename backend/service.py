from datetime import datetime, timezone
from sqlalchemy import delete, func, select, update
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


def creator_participant(s):
    return min(s.participants, key=lambda p: p.joined_at) if s.participants else None


def notify(db, s, notification_type, title, message, recipients=None):
    at = now()
    for recipient in recipients or s.participants:
        exists = db.scalar(
            select(m.Notification.id).where(
                m.Notification.schedule_id == s.id,
                m.Notification.participant_id == recipient.id,
                m.Notification.type == notification_type,
            )
        )
        if not exists:
            db.add(
                m.Notification(
                    id=new_id(),
                    schedule_id=s.id,
                    participant_id=recipient.id,
                    type=notification_type,
                    title=title,
                    message=message,
                    created_at=at,
                )
            )


def voting_finished_notifications(db, s, automatic):
    notify(
        db,
        s,
        "VOTING_COMPLETED",
        "投票已完成" if automatic else "投票已結束",
        f"「{s.title}」等待建立者確認會議時間。",
    )
    owner = creator_participant(s)
    if owner:
        notify(
            db,
            s,
            "CONFIRMATION_REQUIRED",
            "請確認正式時間",
            f"「{s.title}」投票已完成，請選擇並確認正式時間。",
            [owner],
        )


def get_schedule(db, public_id: str, lock=False):
    if not (16 <= len(public_id) <= 64) or not all(c.isalnum() or c in "_-" for c in public_id): fail("找不到排程。", 404)
    query = select(m.Schedule).where(m.Schedule.public_id == public_id).options(*LOAD)
    # Reads can settle expiry too; serialize them with all schedule mutations.
    query = query.with_for_update().execution_options(populate_existing=True)
    schedule = db.scalars(query).first()
    if not schedule: fail("找不到排程。", 404)
    if transition_deadline(db, schedule):
        # Persist expiry even if the requested mutation is subsequently rejected.
        db.commit()
        schedule = db.scalars(query).first()
    return schedule


def actor(s, token): return next((p for p in s.participants if matches(token, p.participant_token_hash)), None)
def participant(s, token):
    found = actor(s, token)
    if not found: fail("請先加入排程；若已清除 Cookie，無法辨識原身分。", 401)
    return found
def admin(s, token):
    if not matches(token, s.admin_token_hash): fail("需要有效的管理連結或管理 Cookie。", 403)
def collecting(s):
    if s.deadline and s.deadline <= now(): fail("填寫截止時間已過，可行時間已鎖定。", 409)
    if s.status != m.ScheduleStatus.COLLECTING: fail("已進入投票或排程結束，可行時間已鎖定。", 409)


def results_of(s):
    if s.status not in (m.ScheduleStatus.VOTING, m.ScheduleStatus.CONFIRMED) and (not s.deadline or s.deadline > now()):
        return []
    # At expiry, the latest saved slots of every joined participant are final.
    # Missing submissions have no slots; the scoring algorithm stays unchanged.
    return recommend(rules_of(s), [{"name": p.name, "submitted": True, "slots": [a.start_at for a in p.availabilities]} for p in s.participants], len(s.participants))


def transition_deadline(db, s):
    """Called with the schedule row locked; candidates also mark a single-best settlement."""
    if (s.status != m.ScheduleStatus.COLLECTING or not s.deadline
            or s.deadline > now() or s.candidate_times):
        return False
    best = best_of(results_of(s))
    if not best:
        return False
    at = now()
    for candidate in best:
        s.candidate_times.append(m.CandidateTime(
            id=new_id(), schedule_id=s.id,
            start_at=utc_aware(datetime.fromisoformat(candidate["startAt"].replace("Z", "+00:00"))),
            end_at=utc_aware(datetime.fromisoformat(candidate["endAt"].replace("Z", "+00:00"))), created_at=at))
    notify(db, s, "RECOMMENDATION_READY", "推薦結果已產生", f"「{s.title}」的共同時間已整理完成。")
    if len(best) > 1:
        s.status = m.ScheduleStatus.VOTING
        notify(db, s, "VOTING_STARTED", "投票已開始", f"「{s.title}」有多個最佳時段，現在可以投票。")
    else:
        owner = creator_participant(s)
        if owner:
            notify(db, s, "CONFIRMATION_REQUIRED", "請確認正式時間", f"「{s.title}」已找出最佳時段，請確認正式時間。", [owner])
    s.updated_at = at
    return True


def present(s, admin_token=None, participant_token=None):
    me = actor(s, participant_token); results = results_of(s); best = best_of(results)
    candidates = sorted(s.candidate_times, key=lambda c: c.start_at) if len(s.candidate_times) > 1 else []
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
    token = new_token(); at = now()
    joined = m.Participant(id=new_id(), schedule_id=s.id, name=name, normalized_name=normalized, participant_token_hash=hash_token(token), joined_at=at, updated_at=at)
    s.participants.append(joined)
    if len(s.participants) == s.expected_participants:
        notify(db, s, "HEADCOUNT_REACHED", "排程成員已到齊", f"「{s.title}」的參與成員已全數加入。")
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
    s = db.scalars(select(m.Schedule).where(m.Schedule.public_id == public_id).options(*LOAD).execution_options(populate_existing=True)).one()
    all_submitted = (
        len(s.participants) == s.expected_participants
        and all(p.availability_submitted_at is not None for p in s.participants)
    )
    if all_submitted:
        notify(db, s, "ALL_AVAILABILITY_SUBMITTED", "所有成員已提交時間", f"「{s.title}」已收齊所有人的可行時間，截止前仍可修改。")
    s.updated_at = at; db.commit()


def cast_vote(db, public_id, candidate_id, token):
    s = get_schedule(db, public_id, True); p = participant(s, token)
    if s.status != m.ScheduleStatus.VOTING or s.voting_closed_at: fail("目前不開放投票。", 409)
    if not any(c.id == candidate_id for c in s.candidate_times): fail("候選時間不屬於此排程。")
    existing = next((v for v in s.votes if v.participant_id == p.id), None); at = now()
    if existing: existing.candidate_time_id = candidate_id; existing.updated_at = at
    else: db.add(m.Vote(id=new_id(), schedule_id=s.id, candidate_time_id=candidate_id, participant_id=p.id, created_at=at, updated_at=at))
    db.flush()
    vote_count = db.scalar(select(func.count(m.Vote.id)).where(m.Vote.schedule_id == s.id)) or 0
    if vote_count == len(s.participants):
        s.voting_closed_at = at
        s.updated_at = at
        voting_finished_notifications(db, s, True)
    db.commit()


def close_voting(db, public_id, token):
    s = get_schedule(db, public_id, True); admin(s, token)
    if s.status != m.ScheduleStatus.VOTING or s.voting_closed_at: fail("投票尚未開啟或已結束。", 409)
    s.voting_closed_at = now(); s.updated_at = now()
    voting_finished_notifications(db, s, False)
    db.commit()


def confirm(db, public_id, value, token):
    s = get_schedule(db, public_id, True); admin(s, token)
    if s.status in (m.ScheduleStatus.CONFIRMED, m.ScheduleStatus.CANCELLED): fail("此排程已鎖定，無法再修改。", 409)
    best = best_of(results_of(s))
    if not best: fail("需等待填寫截止並產生推薦後才能確認會議。", 409)
    if s.status == m.ScheduleStatus.VOTING and not s.voting_closed_at: fail("請先結束投票。", 409)
    start = utc_aware(value.start_at); chosen = next((b for b in best if utc_aware(datetime.fromisoformat(b["startAt"].replace("Z", "+00:00"))) == start), None)
    if not chosen: fail("請從最佳時段中選擇。")
    if len(best) > 1 and s.status != m.ScheduleStatus.VOTING: fail("並列時段必須先進行投票。", 409)
    at = now(); db.add(m.Meeting(id=new_id(), schedule_id=s.id, start_at=start, end_at=utc_aware(datetime.fromisoformat(chosen["endAt"].replace("Z", "+00:00"))), location=value.location, meeting_url=str(value.meeting_url) if value.meeting_url else "", description=value.description, reminder_minutes=value.reminder_minutes, confirmed_at=at)); s.status=m.ScheduleStatus.CONFIRMED; s.updated_at=at
    notify(db, s, "MEETING_CONFIRMED", "會議已成立", f"「{s.title}」的正式會議時間已確認。")
    db.commit()


def cancel(db, public_id, token):
    s=get_schedule(db, public_id, True); admin(s, token)
    if s.status == m.ScheduleStatus.CANCELLED: fail("排程已取消。", 409)
    s.status=m.ScheduleStatus.CANCELLED; s.updated_at=now()
    notify(db, s, "SCHEDULE_CANCELLED", "排程已取消", f"「{s.title}」已由建立者取消。")
    db.commit()


def list_notifications(db, public_id, token):
    s = get_schedule(db, public_id)
    p = participant(s, token)
    rows = db.scalars(
        select(m.Notification)
        .where(m.Notification.schedule_id == s.id, m.Notification.participant_id == p.id)
        .order_by(m.Notification.created_at.desc())
    ).all()
    return [
        {
            "id": item.id,
            "type": item.type,
            "title": item.title,
            "message": item.message,
            "createdAt": utc_iso(item.created_at),
            "readAt": utc_iso(item.read_at) if item.read_at else None,
        }
        for item in rows
    ]


def mark_notification_read(db, public_id, notification_id, token):
    s = get_schedule(db, public_id, True)
    p = participant(s, token)
    item = db.scalar(
        select(m.Notification).where(
            m.Notification.id == notification_id,
            m.Notification.schedule_id == s.id,
            m.Notification.participant_id == p.id,
        )
    )
    if not item:
        fail("通知不存在。", 404)
    if not item.read_at:
        item.read_at = now()
        db.commit()


def mark_all_notifications_read(db, public_id, token):
    s = get_schedule(db, public_id, True)
    p = participant(s, token)
    db.execute(
        update(m.Notification)
        .where(
            m.Notification.schedule_id == s.id,
            m.Notification.participant_id == p.id,
            m.Notification.read_at.is_(None),
        )
        .values(read_at=now())
    )
    db.commit()


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
