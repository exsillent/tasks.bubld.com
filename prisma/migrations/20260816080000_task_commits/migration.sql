-- Free-text commit references, one per line -- nullable, purely additive.
ALTER TABLE "Task" ADD COLUMN "commits" TEXT;
