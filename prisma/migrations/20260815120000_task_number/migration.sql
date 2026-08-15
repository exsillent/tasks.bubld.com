-- Add a human-readable sequential task number (distinct from the internal
-- cuid `id`, which is used in URLs/relations but isn't convenient to say
-- out loud or reference in conversation).
ALTER TABLE "Task" ADD COLUMN "number" INTEGER;

-- Backfill: number every existing task in creation order (oldest = #1).
-- Correlated subquery instead of window-function UPDATE...FROM for
-- broad SQLite version compatibility -- fine at this table's size.
UPDATE "Task" SET "number" = (
    SELECT COUNT(*) FROM "Task" AS t2 WHERE t2."createdAt" <= "Task"."createdAt"
);

-- Rebuild to enforce NOT NULL + UNIQUE (SQLite can't ALTER a column's
-- nullability in place; same table-rebuild pattern used for the AppArea
-- migration).
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

INSERT INTO "new_Task" ("id", "number", "title", "description", "appAreaId", "dueDate", "priority", "type", "status", "foundInProduction", "isDraft", "reviewNote", "createdById", "assigneeId", "createdAt", "updatedAt")
SELECT "id", "number", "title", "description", "appAreaId", "dueDate", "priority", "type", "status", "foundInProduction", "isDraft", "reviewNote", "createdById", "assigneeId", "createdAt", "updatedAt" FROM "Task";

DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";

CREATE UNIQUE INDEX "Task_number_key" ON "Task"("number");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX "Task_appAreaId_idx" ON "Task"("appAreaId");

PRAGMA foreign_keys=ON;
