-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "appAreaId" TEXT NOT NULL,
    "dueDate" DATETIME,
    "priority" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "stage" TEXT NOT NULL DEFAULT 'DEVELOPMENT',
    "stageStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" DATETIME,
    "buildId" TEXT,
    "foundInProduction" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "commits" TEXT,
    "quotedHours" REAL,
    "approvedBy" TEXT,
    "autoReviewed" BOOLEAN NOT NULL DEFAULT false,
    "autoReviewNote" TEXT,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_appAreaId_fkey" FOREIGN KEY ("appAreaId") REFERENCES "AppArea" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("appAreaId", "approvedBy", "assigneeId", "autoReviewNote", "autoReviewed", "buildId", "commits", "createdAt", "createdById", "description", "dueDate", "foundInProduction", "id", "isDraft", "number", "priority", "quotedHours", "reviewNote", "status", "title", "type", "updatedAt") SELECT "appAreaId", "approvedBy", "assigneeId", "autoReviewNote", "autoReviewed", "buildId", "commits", "createdAt", "createdById", "description", "dueDate", "foundInProduction", "id", "isDraft", "number", "priority", "quotedHours", "reviewNote", "status", "title", "type", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_number_key" ON "Task"("number");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_stage_idx" ON "Task"("stage");
CREATE INDEX "Task_stageStatus_idx" ON "Task"("stageStatus");
CREATE INDEX "Task_closed_idx" ON "Task"("closed");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX "Task_appAreaId_idx" ON "Task"("appAreaId");
CREATE INDEX "Task_buildId_idx" ON "Task"("buildId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
