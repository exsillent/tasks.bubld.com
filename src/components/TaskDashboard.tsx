"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Badge from "./Badge";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  APP_AREA_LABELS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  TYPE_LABELS,
  TYPE_COLORS,
} from "@/lib/labels";
import type { listVisibleTasks, listActiveUsers } from "@/lib/tasks";
import type { Status } from "@prisma/client";

type Task = Awaited<ReturnType<typeof listVisibleTasks>>[number];
type ActiveUser = Awaited<ReturnType<typeof listActiveUsers>>[number];

const DASHBOARD_STATUSES: Status[] = [
  "OPEN",
  "IN_PROGRESS",
  "IN_REVIEW",
  "STAGING_REVIEW",
  "APPROVED",
];

function isOverdue(task: Task): boolean {
  return !!task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

export default function TaskDashboard({
  tasks,
  users,
  currentUserId,
}: {
  tasks: Task[];
  users: ActiveUser[];
  currentUserId: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL" | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showProdOnly, setShowProdOnly] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      STAGING_REVIEW: 0,
      APPROVED: 0,
      DONE: 0,
    };
    let prodCount = 0;
    for (const t of tasks) {
      c[t.status]++;
      if (t.foundInProduction) prodCount++;
    }
    return { ...c, prodCount };
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!showCompleted && t.status === "DONE" && statusFilter !== "DONE") return false;
      if (statusFilter && statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (assigneeFilter && t.assigneeId !== assigneeFilter) return false;
      if (showProdOnly && !t.foundInProduction) return false;
      if (myTasksOnly && t.assigneeId !== currentUserId) return false;
      if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [tasks, search, statusFilter, assigneeFilter, showCompleted, showProdOnly, myTasksOnly, currentUserId]);

  return (
    <div className="flex flex-col gap-5">
      {/* Dashboard summary strip */}
      <div className="flex flex-wrap gap-2">
        {DASHBOARD_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              statusFilter === s
                ? "border-brand bg-brand/5"
                : "border-neutral-200 hover:border-neutral-300"
            }`}
          >
            <span className="axiMed">{counts[s]}</span>
            <span className="text-neutral-500">{STATUS_LABELS[s]}</span>
          </button>
        ))}
        {counts.prodCount > 0 && (
          <button
            onClick={() => setShowProdOnly((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              showProdOnly ? "border-red-500 bg-red-50" : "border-red-200 hover:border-red-300"
            }`}
          >
            <span className="axiMed text-red-700">{counts.prodCount}</span>
            <span className="text-red-600">Found in production</span>
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand transition-colors flex-1 min-w-[180px]"
        />
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm outline-none"
        >
          <option value="">All assignees</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={myTasksOnly}
            onChange={(e) => setMyTasksOnly(e.target.checked)}
          />
          My tasks
        </label>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show completed
        </label>
      </div>

      {/* Task list */}
      <div className="flex flex-col divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">No tasks match.</p>
        )}
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-neutral-50 transition-colors"
          >
            {t.isDraft && (
              <Badge label="Draft" className="bg-neutral-800 text-white" />
            )}
            <span className="axiMed text-sm text-neutral-900 flex-1 min-w-[160px]">
              {t.title}
            </span>
            <Badge label={APP_AREA_LABELS[t.appArea]} className="bg-neutral-100 text-neutral-600" />
            <Badge label={TYPE_LABELS[t.type]} className={TYPE_COLORS[t.type]} />
            <Badge label={PRIORITY_LABELS[t.priority]} className={PRIORITY_COLORS[t.priority]} />
            <Badge label={STATUS_LABELS[t.status]} className={STATUS_COLORS[t.status]} />
            {t.foundInProduction && (
              <Badge label="Found in prod" className="bg-red-100 text-red-700" />
            )}
            {isOverdue(t) && <Badge label="Overdue" className="bg-red-600 text-white" />}
            <span className="text-xs text-neutral-400 min-w-[80px] text-right">
              {t.assignee?.name ?? "Unassigned"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
