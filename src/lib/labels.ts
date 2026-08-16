import type { Priority, TaskType, Status } from "@prisma/client";

// Wording names the actual person at each review step, not just internal
// shorthand -- IN_REVIEW is Yasir's own check before anything reaches the
// business approval step; STAGING_REVIEW is that approval step itself, run
// against staging, which Roland/Danielle act on.
export const STATUS_LABELS: Record<Status, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Yasir's Review",
  STAGING_REVIEW: "At Staging, In Roland's Review",
  APPROVED: "Approved",
  DONE: "Complete",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const TYPE_LABELS: Record<TaskType, string> = {
  ERROR: "Error",
  FEATURE: "Feature",
  IDEA: "Idea",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: "bg-neutral-100 text-neutral-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-800",
  CRITICAL: "bg-red-100 text-red-700",
};

export const STATUS_COLORS: Record<Status, string> = {
  OPEN: "bg-neutral-100 text-neutral-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-purple-100 text-purple-700",
  STAGING_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  DONE: "bg-neutral-200 text-neutral-600",
};

export const TYPE_COLORS: Record<TaskType, string> = {
  ERROR: "bg-red-100 text-red-700",
  FEATURE: "bg-brand/10 text-brand",
  IDEA: "bg-violet-100 text-violet-700",
};
