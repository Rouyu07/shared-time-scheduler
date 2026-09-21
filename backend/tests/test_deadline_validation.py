import pytest
from pydantic import ValidationError
from backend.schemas import CreateSchedule


@pytest.mark.parametrize("deadline", [None, "", "missing", "2020-01-01T18:00"])
def test_creation_requires_a_future_deadline(deadline):
    value = dict(title="Validation", creatorName="Owner", expectedParticipants=2,
                 startDate="2027-09-16", endDate="2027-09-16",
                 dailyStartTime="19:00", dailyEndTime="21:00",
                 durationMinutes=60, timezone="Asia/Taipei")
    if deadline != "missing":
        value["deadline"] = deadline
    with pytest.raises(ValidationError):
        CreateSchedule(**value)
