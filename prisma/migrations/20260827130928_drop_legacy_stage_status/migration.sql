/*
  Warnings:

  - You are about to drop the column `closed` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `closedAt` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `reviewNote` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `stage` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `stageStatus` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Task` table. All the data in the column will be lost.

*/
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
    "pipeline" TEXT NOT NULL DEFAULT 'BACKLOG',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "changesRequested" BOOLEAN NOT NULL DEFAULT false,
    "buildId" TEXT,
    "foundInProduction" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
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
INSERT INTO "new_Task" ("appAreaId", "approvedBy", "archived", "archivedAt", "assigneeId", "autoReviewNote", "autoReviewed", "buildId", "changesRequested", "commits", "createdAt", "createdById", "description", "dueDate", "foundInProduction", "id", "isDraft", "number", "pipeline", "priority", "quotedHours", "title", "type", "updatedAt") SELECT "appAreaId", "approvedBy", "archived", "archivedAt", "assigneeId", "autoReviewNote", "autoReviewed", "buildId", "changesRequested", "commits", "createdAt", "createdById", "description", "dueDate", "foundInProduction", "id", "isDraft", "number", "pipeline", "priority", "quotedHours", "title", "type", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_number_key" ON "Task"("number");
CREATE INDEX "Task_pipeline_idx" ON "Task"("pipeline");
CREATE INDEX "Task_archived_idx" ON "Task"("archived");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX "Task_appAreaId_idx" ON "Task"("appAreaId");
CREATE INDEX "Task_buildId_idx" ON "Task"("buildId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
