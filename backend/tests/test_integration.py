from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select
from backend.database import SessionLocal
from backend.models import Notification, Schedule
from backend.schemas import CreateSchedule, MeetingInput
from backend import service


pytestmark = pytest.mark.integration
CREATED: list[str] = []


def make_schedule(expected=2):
    with SessionLocal() as db:
        result = service.create(db, CreateSchedule(
            title="FastAPI integration fixture", creator_name="Owner",
            expected_participants=expected, start_date=date(2027, 9, 16),
            end_date=date(2027, 9, 16), daily_start_time=time(19),
            daily_end_time=time(21), duration_minutes=60,
            timezone="Asia/Taipei",
        ))
    CREATED.append(result[0])
    return result


@pytest.fixture(autouse=True, scope="module")
def cleanup():
    yield
    with SessionLocal() as db:
        db.execute(delete(Schedule).where(Schedule.public_id.in_(CREATED)))
        db.commit()


def test_capacity_cross_schedule_voting_and_concurrent_confirmation():
    public_id, admin, owner = make_schedule()
    foreign_id, foreign_admin, foreign_person = make_schedule(1)

    def join(name):
        with SessionLocal() as db:
            try:
                return service.join(db, public_id, name, None)
            except HTTPException:
                return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        tokens = list(pool.map(join, ["A", "B"]))
    guests = [token for token in tokens if token]
    assert len(guests) == 1

    with SessionLocal() as db:
        with pytest.raises(HTTPException):
            service.save_availability(db, public_id, [], foreign_person)
        schedule = service.get_schedule(db, public_id)
        slots = [entry["startAt"] for entry in service.slot_grid(service.rules_of(schedule))[0]["slots"]]

    from datetime import datetime
    selected = [datetime.fromisoformat(value.replace("Z", "+00:00")) for value in slots]
    with SessionLocal() as db:
        service.save_availability(db, public_id, selected, owner)
    with SessionLocal() as db:
        assert service.present(service.get_schedule(db, public_id), admin, owner)["results"] == []
    with SessionLocal() as db:
        service.save_availability(db, public_id, selected, guests[0])
    with SessionLocal() as db:
        view = service.present(service.get_schedule(db, public_id), admin, owner)
        assert view["status"] == "VOTING"
        assert len(view["candidates"]) == 3
        first, second = view["candidates"][:2]
        service.cast_vote(db, public_id, first["id"], guests[0])
    with SessionLocal() as db:
        service.cast_vote(db, public_id, second["id"], guests[0])
        service.close_voting(db, public_id, admin)
        service.add_comment(db, public_id, "確認前留言", owner)
    with SessionLocal() as db:
        comment_id = service.get_schedule(db, public_id).comments[0].id

    def confirm(start):
        with SessionLocal() as db:
            try:
                service.confirm(db, public_id, MeetingInput(start_at=start, reminder_minutes=30), admin)
                return True
            except HTTPException:
                return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(confirm, [first["startAt"], second["startAt"]]))
    assert results.count(True) == 1
    with SessionLocal() as db:
        final = service.get_schedule(db, public_id)
        assert final.status.value == "CONFIRMED"
        assert final.meeting is not None
        with pytest.raises(HTTPException):
            service.add_comment(db, public_id, "確認後不可留言", owner)
        with pytest.raises(HTTPException):
            service.delete_comment(db, public_id, comment_id, admin, owner)
        with pytest.raises(HTTPException):
            service.cancel(db, public_id, foreign_admin)


def test_concurrent_last_submissions_create_one_candidate_set():
    public_id, admin, owner = make_schedule()
    with SessionLocal() as db:
        guest = service.join(db, public_id, "Guest", None)
        schedule = service.get_schedule(db, public_id)
        slots = [
            datetime.fromisoformat(entry["startAt"].replace("Z", "+00:00"))
            for entry in service.slot_grid(service.rules_of(schedule))[0]["slots"]
        ]

    def submit(token):
        with SessionLocal() as db:
            service.save_availability(db, public_id, slots, token)

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(submit, [owner, guest]))

    with SessionLocal() as db:
        final = service.get_schedule(db, public_id)
        assert final.status.value == "VOTING"
        assert len(final.candidate_times) == 3
        assert len({(c.start_at, c.end_at) for c in final.candidate_times}) == 3
        assert all(p.availability_submitted_at is not None for p in final.participants)


def test_vote_and_close_race_stays_consistent():
    public_id, admin, owner = make_schedule()
    with SessionLocal() as db:
        guest = service.join(db, public_id, "Guest", None)
        schedule = service.get_schedule(db, public_id)
        slots = [
            datetime.fromisoformat(entry["startAt"].replace("Z", "+00:00"))
            for entry in service.slot_grid(service.rules_of(schedule))[0]["slots"]
        ]
    with SessionLocal() as db:
        service.save_availability(db, public_id, slots, owner)
    with SessionLocal() as db:
        service.save_availability(db, public_id, slots, guest)
    with SessionLocal() as db:
        candidate_id = service.get_schedule(db, public_id).candidate_times[0].id

    def vote():
        with SessionLocal() as db:
            try:
                service.cast_vote(db, public_id, candidate_id, guest)
                return True
            except HTTPException:
                return False

    def close():
        with SessionLocal() as db:
            service.close_voting(db, public_id, admin)
            return True

    with ThreadPoolExecutor(max_workers=2) as pool:
        vote_result = pool.submit(vote)
        close_result = pool.submit(close)
        assert close_result.result() is True
        assert vote_result.result() in (True, False)

    with SessionLocal() as db:
        final = service.get_schedule(db, public_id)
        assert final.voting_closed_at is not None
        assert len(final.votes) in (0, 1)


def test_deadline_blocks_join_and_availability_changes():
    public_id, _, owner = make_schedule()
    with SessionLocal() as db:
        schedule = service.get_schedule(db, public_id, True)
        schedule.deadline = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    with SessionLocal() as db:
        with pytest.raises(HTTPException, match="截止時間"):
            service.join(db, public_id, "Late guest", None)
    with SessionLocal() as db:
        with pytest.raises(HTTPException, match="截止時間"):
            service.save_availability(db, public_id, [], owner)


def prepare_voting(expected=3):
    public_id, admin, owner = make_schedule(expected)
    guests = []
    with SessionLocal() as db:
        for index in range(expected - 1):
            guests.append(service.join(db, public_id, f"Voter {index + 1}", None))
    with SessionLocal() as db:
        schedule = service.get_schedule(db, public_id)
        slots = [
            datetime.fromisoformat(entry["startAt"].replace("Z", "+00:00"))
            for entry in service.slot_grid(service.rules_of(schedule))[0]["slots"]
        ]
    for token in [owner, *guests]:
        with SessionLocal() as db:
            service.save_availability(db, public_id, slots, token)
    with SessionLocal() as db:
        candidates = service.present(service.get_schedule(db, public_id), admin, owner)["candidates"]
    return public_id, admin, owner, guests, candidates


def test_all_participants_voting_auto_closes_and_requires_creator_confirmation():
    public_id, admin, owner, guests, candidates = prepare_voting()
    first = candidates[0]
    with SessionLocal() as db:
        service.cast_vote(db, public_id, first["id"], owner)
    with SessionLocal() as db:
        assert service.get_schedule(db, public_id).voting_closed_at is None
        service.cast_vote(db, public_id, first["id"], guests[0])
    with SessionLocal() as db:
        assert service.get_schedule(db, public_id).voting_closed_at is None
        service.cast_vote(db, public_id, first["id"], guests[1])
    with SessionLocal() as db:
        closed = service.get_schedule(db, public_id)
        assert closed.voting_closed_at is not None
        assert closed.meeting is None
        with pytest.raises(HTTPException, match="不開放投票"):
            service.cast_vote(db, public_id, candidates[1]["id"], guests[1])
        owner_types = {item["type"] for item in service.list_notifications(db, public_id, owner)}
        guest_types = {item["type"] for item in service.list_notifications(db, public_id, guests[0])}
        assert {"HEADCOUNT_REACHED", "ALL_AVAILABILITY_SUBMITTED", "RECOMMENDATION_READY", "VOTING_STARTED", "VOTING_COMPLETED", "CONFIRMATION_REQUIRED"} <= owner_types
        assert "CONFIRMATION_REQUIRED" not in guest_types
        assert "VOTING_COMPLETED" in guest_types
    with SessionLocal() as db:
        service.confirm(db, public_id, MeetingInput(start_at=first["startAt"]), admin)
    with SessionLocal() as db:
        assert service.get_schedule(db, public_id).meeting is not None
        assert "MEETING_CONFIRMED" in {
            item["type"] for item in service.list_notifications(db, public_id, guests[0])
        }


def test_concurrent_last_votes_close_once_and_notification_access_is_isolated():
    public_id, _, owner, guests, candidates = prepare_voting()
    foreign_id, _, foreign_owner = make_schedule(1)
    with SessionLocal() as db:
        service.cast_vote(db, public_id, candidates[0]["id"], owner)

    def vote(token, candidate_id):
        with SessionLocal() as db:
            service.cast_vote(db, public_id, candidate_id, token)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(vote, guests[0], candidates[0]["id"]),
            pool.submit(vote, guests[1], candidates[1]["id"]),
        ]
        for future in futures:
            future.result()

    with SessionLocal() as db:
        final = service.get_schedule(db, public_id)
        assert final.voting_closed_at is not None
        assert len(final.votes) == 3
        completion_notifications = db.scalars(
            select(Notification).where(
                Notification.schedule_id == final.id,
                Notification.type == "VOTING_COMPLETED",
            )
        ).all()
        assert len(completion_notifications) == 3
        with pytest.raises(HTTPException):
            service.list_notifications(db, public_id, foreign_owner)
        with pytest.raises(HTTPException):
            service.mark_notification_read(
                db, public_id, completion_notifications[0].id, foreign_owner
            )


def test_notification_read_and_read_all_persist():
    public_id, _, owner, guests, _ = prepare_voting()
    with SessionLocal() as db:
        notifications = service.list_notifications(db, public_id, owner)
        assert notifications
        first_id = notifications[0]["id"]
        service.mark_notification_read(db, public_id, first_id, owner)
    with SessionLocal() as db:
        refreshed = service.list_notifications(db, public_id, owner)
        assert next(item for item in refreshed if item["id"] == first_id)["readAt"]
        service.mark_all_notifications_read(db, public_id, owner)
    with SessionLocal() as db:
        assert all(item["readAt"] for item in service.list_notifications(db, public_id, owner))
        assert any(not item["readAt"] for item in service.list_notifications(db, public_id, guests[0]))
