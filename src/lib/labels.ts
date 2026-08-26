import type { Priority, TaskType, Status, Stage, StageStatus } from "@prisma/client";

// Legacy, read-only -- only ever shown on tasks created before 2026-08-17
// that still carry their old single-track status. No longer written.
export const STATUS_LABELS: Record<Status, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Yasir's Review",
  STAGING_REVIEW: "At Staging, In Roland's Review",
  APPROVED: "Approved",
  DONE: "Complete",
};

export const STAGE_LABELS: Record<Stage, string> = {
  DEVELOPMENT: "Development",
  STAGING: "Staging",
  PRODUCTION: "Production",
};

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  CHANGES_REQUESTED: "Changes Requested",
  COMPLETE: "Complete",
};

export const STAGE_COLORS: Record<Stage, string> = {
  DEVELOPMENT: "bg-neutral-100 text-neutral-700",
  STAGING: "bg-amber-100 text-amber-800",
  PRODUCTION: "bg-emerald-100 text-emerald-700",
};

export const STAGE_STATUS_COLORS: Record<StageStatus, string> = {
  OPEN: "bg-neutral-100 text-neutral-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-800",
  COMPLETE: "bg-emerald-100 text-emerald-700",
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
