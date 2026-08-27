-- Expand step for the single-pipeline model (2026-08-27).
--
-- Adds the new columns alongside the old stage/stageStatus/closed fields,
-- which are kept until the final cleanup pass so the current UI keeps
-- working. `pipeline` and `archived` are derived here from the existing
-- data; nothing is deleted.
--
-- Mapping stage + stageStatus -> pipeline (verified against the 125 live
-- tasks on 2026-08-27; no task is in CHANGES_REQUESTED today):
--
--   DEVELOPMENT / OPEN         -> BACKLOG
--   DEVELOPMENT / IN_PROGRESS  -> IN_PROGRESS
--   DEVELOPMENT / COMPLETE     -> IN_REVIEW
--   STAGING     / OPEN         -> IN_REVIEW
--   STAGING     / IN_PROGRESS  -> IN_REVIEW
--   STAGING     / COMPLETE     -> READY_TO_DEPLOY
--   PRODUCTION  / OPEN         -> READY_TO_DEPLOY
--   PRODUCTION  / IN_PROGRESS  -> READY_TO_DEPLOY
--   PRODUCTION  / COMPLETE     -> DEPLOYED
--   any         / CHANGES_REQUESTED -> IN_PROGRESS  (+ changesRequested = 1)
--
-- `closed` -> `archived` one-for-one, keeping `closedAt` as `archivedAt`.

-- AlterTable: Task
ALTER TABLE "Task" ADD COLUMN "pipeline" TEXT NOT NULL DEFAULT 'BACKLOG';
ALTER TABLE "Task" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "changesRequested" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: AppArea
ALTER TABLE "AppArea" ADD COLUMN "releaseMode" TEXT NOT NULL DEFAULT 'CONTINUOUS';

-- Data: stage + stageStatus -> pipeline
UPDATE "Task" SET "pipeline" = CASE
  WHEN "stageStatus" = 'CHANGES_REQUESTED'                        THEN 'IN_PROGRESS'
  WHEN "stage" = 'DEVELOPMENT' AND "stageStatus" = 'OPEN'         THEN 'BACKLOG'
  WHEN "stage" = 'DEVELOPMENT' AND "stageStatus" = 'IN_PROGRESS'  THEN 'IN_PROGRESS'
  WHEN "stage" = 'DEVELOPMENT' AND "stageStatus" = 'COMPLETE'     THEN 'IN_REVIEW'
  WHEN "stage" = 'STAGING'     AND "stageStatus" = 'OPEN'         THEN 'IN_REVIEW'
  WHEN "stage" = 'STAGING'     AND "stageStatus" = 'IN_PROGRESS'  THEN 'IN_REVIEW'
  WHEN "stage" = 'STAGING'     AND "stageStatus" = 'COMPLETE'     THEN 'READY_TO_DEPLOY'
  WHEN "stage" = 'PRODUCTION'  AND "stageStatus" = 'OPEN'         THEN 'READY_TO_DEPLOY'
  WHEN "stage" = 'PRODUCTION'  AND "stageStatus" = 'IN_PROGRESS'  THEN 'READY_TO_DEPLOY'
  WHEN "stage" = 'PRODUCTION'  AND "stageStatus" = 'COMPLETE'     THEN 'DEPLOYED'
  ELSE 'BACKLOG'
END;

-- Data: closed -> archived
UPDATE "Task" SET "archived" = "closed", "archivedAt" = "closedAt";

-- Data: carry a stuck CHANGES_REQUESTED onto the new flag (0 rows today)
UPDATE "Task" SET "changesRequested" = true WHERE "stageStatus" = 'CHANGES_REQUESTED';

-- Data: the two app-store apps ship as batched builds; everything else is
-- continuous deploy (already the column default).
UPDATE "AppArea" SET "releaseMode" = 'BUILD' WHERE "name" IN ('Customer App', 'Technician App');

-- CreateIndex
CREATE INDEX "Task_pipeline_idx" ON "Task"("pipeline");
CREATE INDEX "Task_archived_idx" ON "Task"("archived");
