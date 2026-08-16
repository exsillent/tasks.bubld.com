-- A shippable batch of tasks. Exactly one Build has shippedAt IS NULL at a
-- time ("the next build"); shipping it archives it as permanent history.
CREATE TABLE "Build" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "shippedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Build_number_key" ON "Build"("number");

ALTER TABLE "Task" ADD COLUMN "buildId" TEXT REFERENCES "Build" ("id");

CREATE INDEX "Task_buildId_idx" ON "Task"("buildId");
