-- AlterTable: per-user email notification preference
ALTER TABLE "User" ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: AppArea replaces the old fixed enum so it's admin-manageable
CREATE TABLE "AppArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AppArea_name_key" ON "AppArea"("name");

-- Seed the app areas that previously existed as fixed enum values, using
-- deterministic ids so the backfill below can map old Task.appArea text
-- values onto them reliably.
INSERT INTO "AppArea" ("id", "name", "isActive") VALUES
    ('customer_app', 'Customer App', true),
    ('technician_app', 'Technician App', true),
    ('bubld_com', 'bubld.com', true),
    ('bublr_bubld_com', 'bublr.bubld.com', true),
    ('admin_panel', 'Admin Panel', true),
    ('infrastructure', 'Infrastructure', true);

-- Add the new FK column (nullable for now -- backfilled next, then the
-- table rebuild below makes it NOT NULL).
ALTER TABLE "Task" ADD COLUMN "appAreaId" TEXT REFERENCES "AppArea" ("id");

-- Backfill every existing task's new appAreaId from its old appArea enum
-- text value.
UPDATE "Task" SET "appAreaId" = CASE "appArea"
    WHEN 'CUSTOMER_APP' THEN 'customer_app'
    WHEN 'TECHNICIAN_APP' THEN 'technician_app'
    WHEN 'BUBLD_COM' THEN 'bubld_com'
    WHEN 'BUBLR_BUBLD_COM' THEN 'bublr_bubld_com'
    WHEN 'ADMIN_PANEL' THEN 'admin_panel'
    WHEN 'INFRASTRUCTURE' THEN 'infrastructure'
END;

-- Rebuild Task: SQLite can't drop a column or change nullability in place.
-- This drops the old appArea text column and makes appAreaId NOT NULL,
-- carrying every existing row's data across untouched.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "appAreaId" TEXT NOT NULL,
    "dueDate" DATETIME,
    "priority" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "foundInProduction" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_appAreaId_fkey" FOREIGN KEY ("appAreaId") REFERENCES "AppArea" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Task" ("id", "title", "description", "appAreaId", "dueDate", "priority", "type", "status", "foundInProduction", "isDraft", "reviewNote", "createdById", "assigneeId", "createdAt", "updatedAt")
SELECT "id", "title", "description", "appAreaId", "dueDate", "priority", "type", "status", "foundInProduction", "isDraft", "reviewNote", "createdById", "assigneeId", "createdAt", "updatedAt" FROM "Task";

DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";

CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX "Task_appAreaId_idx" ON "Task"("appAreaId");

PRAGMA foreign_keys=ON;
