import type {
  Priority,
  TaskType,
  Status,
  Stage,
  StageStatus,
  Pipeline,
  ReleaseMode,
} from "@prisma/client";

// --- Single-pipeline model (2026-08-27). The board's columns, in order. ---
export const PIPELINE_ORDER: Pipeline[] = [
  "BACKLOG",
  "IN_PROGRESS",
  "IN_REVIEW",
  "READY_TO_DEPLOY",
  "DEPLOYED",
];

export const PIPELINE_LABELS: Record<Pipeline, string> = {
  BACKLOG: "To do",
  IN_PROGRESS: "Being fixed",
  IN_REVIEW: "For review",
  READY_TO_DEPLOY: "To deploy",
  DEPLOYED: "Deployed",
};

// Short column headers for the board.
export const PIPELINE_SHORT: Record<Pipeline, string> = {
  BACKLOG: "To do",
  IN_PROGRESS: "Being fixed",
  IN_REVIEW: "For review",
  READY_TO_DEPLOY: "To deploy",
  DEPLOYED: "Deployed",
};

// One-line "what this column means", shown under the header / in menus.
export const PIPELINE_HINTS: Record<Pipeline, string> = {
  BACKLOG: "Not started yet",
  IN_PROGRESS: "A developer is working on it",
  IN_REVIEW: "Waiting for Roland / Danielle to test",
  READY_TO_DEPLOY: "Approved — waiting to be deployed or built",
  DEPLOYED: "Live in production, or shipped in an app build",
};

// Thin left-edge marker colour per column (CSS var from globals).
export const PIPELINE_MARKER: Record<Pipeline, string> = {
  BACKLOG: "var(--pipe-backlog)",
  IN_PROGRESS: "var(--pipe-progress)",
  IN_REVIEW: "var(--pipe-review)",
  READY_TO_DEPLOY: "var(--pipe-deploy)",
  DEPLOYED: "var(--pipe-deployed)",
};

export const RELEASE_MODE_LABELS: Record<ReleaseMode, string> = {
  CONTINUOUS: "Continuous — deployed directly",
  BUILD: "App build — batched into a numbered build",
};

export function nextPipeline(p: Pipeline): Pipeline | null {
  const i = PIPELINE_ORDER.indexOf(p);
  return i >= 0 && i < PIPELINE_ORDER.length - 1 ? PIPELINE_ORDER[i + 1] : null;
}

export function prevPipeline(p: Pipeline): Pipeline | null {
  const i = PIPELINE_ORDER.indexOf(p);
  return i > 0 ? PIPELINE_ORDER[i - 1] : null;
}

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
