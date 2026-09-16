from concurrent.futures import ThreadPoolExecutor
from datetime import date, time
import pytest
from fastapi import HTTPException
from sqlalchemy import delete
from backend.database import SessionLocal
from backend.models import Schedule
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
