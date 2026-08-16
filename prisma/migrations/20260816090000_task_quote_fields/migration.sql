-- Budget tracking: hours Techaliance quoted, and who approved that budget.
-- Nullable, purely additive.
ALTER TABLE "Task" ADD COLUMN "quotedHours" REAL;
ALTER TABLE "Task" ADD COLUMN "approvedBy" TEXT;
