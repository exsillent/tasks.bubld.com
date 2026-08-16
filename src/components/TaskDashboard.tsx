"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Badge from "./Badge";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  TYPE_LABELS,
  TYPE_COLORS,
} from "@/lib/labels";
import type { listVisibleTasks, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import type { Status, Priority, TaskType } from "@prisma/client";

type Task = Awaited<ReturnType<typeof listVisibleTasks>>[number];
type ActiveUser = Awaited<ReturnType<typeof listActiveUsers>>[number];
type AppAreaOption = Awaited<ReturnType<typeof listAllAppAreas>>[number];

// Every status lives in this one clickable strip -- there is deliberately
// no second "status" dropdown duplicating it elsewhere on the page.
const ALL_STATUSES = Object.keys(STATUS_LABELS) as Status[];
const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];
const TYPES = Object.keys(TYPE_LABELS) as TaskType[];

function isOverdue(task: Task): boolean {
  return !!task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

export default function TaskDashboard({
  tasks,
  users,
  appAreas,
  currentUserId,
}: {
  tasks: Task[];
  users: ActiveUser[];
  appAreas: AppAreaOption[];
  currentUserId: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [appAreaFilter, setAppAreaFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [typeFilter, setTypeFilter] = useState<TaskType | "">("");
  const [includeComplete, setIncludeComplete] = useState(false);
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
    const qNumber = q.startsWith("#") ? q.slice(1) : q;
    return tasks.filter((t) => {
      // Status: pick one badge (e.g. Open) to see just that stage, or
      // check "+ Complete" to see that stage *and* Complete together (e.g.
      // Open + Complete, skipping everything in between). No badge at all
      // means "everything except Complete" by default, or truly everything
      // once "+ Complete" is checked. Complete itself stays reachable on
      // its own via its own badge either way.
      if (statusFilter) {
        if (t.status !== statusFilter && !(includeComplete && t.status === "DONE")) return false;
      } else if (t.status === "DONE" && !includeComplete) {
        return false;
      }
      if (assigneeFilter && t.assigneeId !== assigneeFilter) return false;
      if (appAreaFilter && t.appAreaId !== appAreaFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (typeFilter && t.type !== typeFilter) return false;
      if (showProdOnly && !t.foundInProduction) return false;
      if (myTasksOnly && t.assigneeId !== currentUserId) return false;
      if (
        q &&
        String(t.number) !== qNumber &&
        !t.title.toLowerCase().includes(q) &&
        !t.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    tasks,
    search,
    statusFilter,
    assigneeFilter,
    appAreaFilter,
    priorityFilter,
    typeFilter,
    includeComplete,
    showProdOnly,
    myTasksOnly,
    currentUserId,
  ]);

  const selectClass = "border border-neutral-300 rounded-lg px-2 py-1.5 text-sm outline-none";

  return (
    <div className="flex flex-col gap-5">
      {/* Status -- visually its own labeled section, and the only status filter on the page */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
        <span className="axiBold text-xs text-neutral-400 uppercase tracking-wide mr-1">
          Status
        </span>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors bg-white ${
              statusFilter === s
                ? "border-brand bg-brand/5"
                : "border-neutral-200 hover:border-neutral-300"
            }`}
          >
            <span className="axiMed">{counts[s]}</span>
            <span className="text-neutral-500">{STATUS_LABELS[s]}</span>
          </button>
        ))}
        <label
          className={`flex items-center gap-1.5 text-sm ml-1 ${
            statusFilter === "DONE" ? "text-neutral-300" : "text-neutral-600"
          }`}
          title={
            statusFilter === "DONE"
              ? "Already showing only Complete"
              : statusFilter
                ? `Also show Complete alongside ${STATUS_LABELS[statusFilter]}`
                : "Also show Complete tasks alongside everything else"
          }
        >
          <input
            type="checkbox"
            checked={includeComplete}
            disabled={statusFilter === "DONE"}
            onChange={(e) => setIncludeComplete(e.target.checked)}
          />
          + Complete
        </label>
      </div>

      {counts.prodCount > 0 && (
        <button
          onClick={() => setShowProdOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors w-fit ${
            showProdOnly ? "border-red-500 bg-red-50" : "border-red-200 hover:border-red-300"
          }`}
        >
          <span className="axiMed text-red-700">{counts.prodCount}</span>
          <span className="text-red-600">Found in production</span>
        </button>
      )}

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          placeholder="Search tasks or #number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand transition-colors flex-1 min-w-[180px]"
        />
        <select
          value={assigneeFilter}
          onChange={(e) => {
            // "My tasks" and picking a specific assignee both filter on the
            // same field -- combining them (e.g. My tasks + Assignee=Roland)
            // is a logically impossible AND that silently shows zero
            // results with no indication why. Picking a specific assignee
            // here takes over from "My tasks" instead of stacking with it.
            setAssigneeFilter(e.target.value);
            if (e.target.value) setMyTasksOnly(false);
          }}
          className={selectClass}
        >
          <option value="">All assignees</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={appAreaFilter}
          onChange={(e) => setAppAreaFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All app areas</option>
          {appAreas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | "")}
          className={selectClass}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TaskType | "")}
          className={selectClass}
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={myTasksOnly}
            onChange={(e) => {
              setMyTasksOnly(e.target.checked);
              if (e.target.checked) setAssigneeFilter("");
            }}
          />
          My tasks
        </label>
        {(statusFilter ||
          assigneeFilter ||
          appAreaFilter ||
          priorityFilter ||
          typeFilter ||
          includeComplete ||
          showProdOnly ||
          myTasksOnly ||
          search) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setAssigneeFilter("");
              setAppAreaFilter("");
              setIncludeComplete(false);
              setPriorityFilter("");
              setTypeFilter("");
              setShowProdOnly(false);
              setMyTasksOnly(false);
            }}
            className="text-sm text-neutral-400 hover:text-neutral-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex flex-col divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
        <p className="px-4 py-2 text-xs text-neutral-400 bg-neutral-50">
          {filtered.length} task{filtered.length === 1 ? "" : "s"}
        </p>
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">No tasks match.</p>
        )}
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-neutral-50 transition-colors"
          >
            <span className="text-xs text-neutral-400 min-w-[36px]">#{t.number}</span>
            {t.isDraft && (
              <Badge label="Draft" className="bg-neutral-800 text-white" />
            )}
            <span className="axiMed text-sm text-neutral-900 flex-1 min-w-[160px]">
              {t.title}
            </span>
            <Badge label={t.appArea.name} className="bg-neutral-100 text-neutral-600" />
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
