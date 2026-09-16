-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('COLLECTING', 'VOTING', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "creator_name" VARCHAR(40) NOT NULL,
    "expected_participants" INTEGER NOT NULL,
    "voting_closed_at" TIMESTAMPTZ(3),
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "daily_start_time" TIME(0) NOT NULL,
    "daily_end_time" TIME(0) NOT NULL,
    "slot_minutes" INTEGER NOT NULL DEFAULT 30,
    "duration_minutes" INTEGER NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Taipei',
    "deadline" TIMESTAMP(3),
    "admin_token_hash" VARCHAR(255) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'COLLECTING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "normalized_name" VARCHAR(40) NOT NULL,
    "participant_token_hash" VARCHAR(255) NOT NULL,
    "availability_submitted_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availabilities" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_times" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "candidate_time_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "location" VARCHAR(200),
    "meeting_url" VARCHAR(2048),
    "description" TEXT,
    "reminder_minutes" INTEGER,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedules_public_id_key" ON "schedules"("public_id");

-- CreateIndex
CREATE INDEX "schedules_status_idx" ON "schedules"("status");

-- CreateIndex
CREATE INDEX "schedules_deadline_idx" ON "schedules"("deadline");

-- CreateIndex
CREATE INDEX "participants_schedule_id_idx" ON "participants"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "participants_schedule_id_normalized_name_key" ON "participants"("schedule_id", "normalized_name");

-- CreateIndex
CREATE INDEX "availabilities_schedule_id_start_at_idx" ON "availabilities"("schedule_id", "start_at");

-- CreateIndex
CREATE INDEX "availabilities_participant_id_idx" ON "availabilities"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "availabilities_participant_id_start_at_key" ON "availabilities"("participant_id", "start_at");

-- CreateIndex
CREATE INDEX "candidate_times_schedule_id_start_at_idx" ON "candidate_times"("schedule_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_times_schedule_id_start_at_end_at_key" ON "candidate_times"("schedule_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "votes_candidate_time_id_idx" ON "votes"("candidate_time_id");

-- CreateIndex
CREATE INDEX "votes_participant_id_idx" ON "votes"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_schedule_id_participant_id_key" ON "votes"("schedule_id", "participant_id");

-- CreateIndex
CREATE INDEX "comments_schedule_id_created_at_idx" ON "comments"("schedule_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_participant_id_idx" ON "comments"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_schedule_id_key" ON "meetings"("schedule_id");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_times" ADD CONSTRAINT "candidate_times_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_candidate_time_id_fkey" FOREIGN KEY ("candidate_time_id") REFERENCES "candidate_times"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

