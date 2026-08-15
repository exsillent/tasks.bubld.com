import type { AppArea, Priority, TaskType, Status } from "@prisma/client";

export const STATUS_LABELS: Record<Status, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  STAGING_REVIEW: "Staging Review",
  APPROVED: "Approved",
  DONE: "Done",
};

export const APP_AREA_LABELS: Record<AppArea, string> = {
  CUSTOMER_APP: "Customer App",
  TECHNICIAN_APP: "Technician App",
  BUBLD_COM: "bubld.com",
  BUBLR_BUBLD_COM: "bublr.bubld.com",
  ADMIN_PANEL: "Admin Panel",
  INFRASTRUCTURE: "Infrastructure",
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
