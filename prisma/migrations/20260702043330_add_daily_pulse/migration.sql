-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_entity_id_fkey";

-- CreateTable
CREATE TABLE "daily_pulses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "general_note" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_pulses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_pulse_items" (
    "id" TEXT NOT NULL,
    "pulse_id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "progress_note" TEXT NOT NULL,
    "is_blocker" BOOLEAN NOT NULL DEFAULT false,
    "blocker_detail" TEXT,
    "dm_response" TEXT,
    "dm_responded_at" TIMESTAMP(3),
    "hours_logged" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_pulse_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_digests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ai_summary" TEXT,
    "blocker_count" INTEGER NOT NULL DEFAULT 0,
    "submission_count" INTEGER NOT NULL DEFAULT 0,
    "total_members" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_digests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_pulses_project_id_date_idx" ON "daily_pulses"("project_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_pulses_project_id_user_id_date_key" ON "daily_pulses"("project_id", "user_id", "date");

-- CreateIndex
CREATE INDEX "daily_pulse_items_pulse_id_idx" ON "daily_pulse_items"("pulse_id");

-- CreateIndex
CREATE INDEX "daily_pulse_items_work_item_id_idx" ON "daily_pulse_items"("work_item_id");

-- CreateIndex
CREATE INDEX "team_digests_project_id_date_idx" ON "team_digests"("project_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "team_digests_project_id_date_key" ON "team_digests"("project_id", "date");

-- AddForeignKey
ALTER TABLE "daily_pulses" ADD CONSTRAINT "daily_pulses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_pulses" ADD CONSTRAINT "daily_pulses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_pulse_items" ADD CONSTRAINT "daily_pulse_items_pulse_id_fkey" FOREIGN KEY ("pulse_id") REFERENCES "daily_pulses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_pulse_items" ADD CONSTRAINT "daily_pulse_items_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_digests" ADD CONSTRAINT "team_digests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
