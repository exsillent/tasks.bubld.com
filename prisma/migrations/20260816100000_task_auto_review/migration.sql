-- Claude's own review pass: flag + comprehensive note, ADMIN-only.
-- Nullable/defaulted, purely additive.
ALTER TABLE "Task" ADD COLUMN "autoReviewed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "autoReviewNote" TEXT;
