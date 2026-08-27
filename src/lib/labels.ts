import type { Priority, TaskType, Pipeline, ReleaseMode } from "@prisma/client";

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
