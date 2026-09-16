-- Defense in depth: references must belong to the same schedule.
ALTER TABLE participants ADD CONSTRAINT participants_id_schedule_unique UNIQUE (id, schedule_id);
ALTER TABLE candidate_times ADD CONSTRAINT candidate_times_id_schedule_unique UNIQUE (id, schedule_id);
ALTER TABLE availabilities ADD CONSTRAINT availability_participant_schedule_fk FOREIGN KEY (participant_id, schedule_id) REFERENCES participants(id, schedule_id) ON DELETE CASCADE;
ALTER TABLE votes ADD CONSTRAINT vote_participant_schedule_fk FOREIGN KEY (participant_id, schedule_id) REFERENCES participants(id, schedule_id) ON DELETE CASCADE;
ALTER TABLE votes ADD CONSTRAINT vote_candidate_schedule_fk FOREIGN KEY (candidate_time_id, schedule_id) REFERENCES candidate_times(id, schedule_id) ON DELETE CASCADE;
ALTER TABLE comments ADD CONSTRAINT comment_participant_schedule_fk FOREIGN KEY (participant_id, schedule_id) REFERENCES participants(id, schedule_id) ON DELETE CASCADE;
ALTER TABLE schedules ADD CONSTRAINT schedule_valid_headcount CHECK (expected_participants BETWEEN 1 AND 100);
ALTER TABLE schedules ADD CONSTRAINT schedule_valid_dates CHECK (end_date >= start_date AND end_date - start_date <= 30);
ALTER TABLE schedules ADD CONSTRAINT schedule_valid_duration CHECK (slot_minutes = 30 AND duration_minutes >= 30 AND duration_minutes % 30 = 0 AND daily_end_time > daily_start_time AND EXTRACT(EPOCH FROM daily_end_time - daily_start_time) >= duration_minutes * 60);
ALTER TABLE candidate_times ADD CONSTRAINT candidate_positive_interval CHECK (end_at > start_at);
ALTER TABLE meetings ADD CONSTRAINT meeting_positive_interval CHECK (end_at > start_at);
ALTER TABLE meetings ADD CONSTRAINT meeting_valid_reminder CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 40320);
