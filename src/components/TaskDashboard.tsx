"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import Badge from "./Badge";
import {
  STAGE_LABELS,
  STAGE_COLORS,
  STAGE_STATUS_LABELS,
  STAGE_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  TYPE_LABELS,
  TYPE_COLORS,
} from "@/lib/labels";
import { shipCurrentBuild } from "@/app/tasks/actions";
import type { listVisibleTasks, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import type { Stage, StageStatus, Priority, TaskType } from "@prisma/client";

type Task = Awaited<ReturnType<typeof listVisibleTasks>>[number];
type ActiveUser = Awaited<ReturnType<typeof listActiveUsers>>[number];
type AppAreaOption = Awaited<ReturnType<typeof listAllAppAreas>>[number];

// Stage and status are two independent clickable strips (2026-08-17) --
// pick a stage, a status, or both, in any combination.
const ALL_STAGES = Object.keys(STAGE_LABELS) as Stage[];
const ALL_STAGE_STATUSES = Object.keys(STAGE_STATUS_LABELS) as StageStatus[];
const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];
const TYPES = Object.keys(TYPE_LABELS) as TaskType[];

const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

type SortKey = "updated" | "number" | "priority" | "due";
const SORT_LABELS: Record<SortKey, string> = {
  updated: "Recently updated",
  number: "Task #",
  priority: "Priority (high first)",
  due: "Due date (soonest first)",
};
const DEFAULT_SORT: SortKey = "updated";

function isOverdue(task: Task): boolean {
  return !!task.dueDate && !task.closed && new Date(task.dueDate) < new Date();
}

// All filter/sort state lives in the URL (searchParams), not component
// state -- so opening a task and coming back (or hitting the browser back
// button at all) lands you on the exact same filtered, sorted view instead
// of resetting to defaults. Every param is optional; an empty/default value
// is simply omitted from the URL rather than written as "".
const PARAM_KEYS = [
  "q",
  "stage",
  "status",
  "assignee",
  "area",
  "priority",
  "type",
  "closed",
  "prod",
  "reviewed",
  "build",
  "mine",
  "sort",
] as const;

export default function TaskDashboard({
  tasks,
  users,
  appAreas,
  currentUserId,
  isAdmin,
}: {
  tasks: Task[];
  users: ActiveUser[];
  appAreas: AppAreaOption[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isShipping, startShipTransition] = useTransition();
  const [shipError, setShipError] = useState<string | null>(null);

  const search = searchParams.get("q") ?? "";
  const stageFilter = (searchParams.get("stage") as Stage | null) ?? "";
  const stageStatusFilter = (searchParams.get("status") as StageStatus | null) ?? "";
  const assigneeFilter = searchParams.get("assignee") ?? "";
  const appAreaFilter = searchParams.get("area") ?? "";
  const priorityFilter = (searchParams.get("priority") as Priority | null) ?? "";
  const typeFilter = (searchParams.get("type") as TaskType | null) ?? "";
  const sort = (searchParams.get("sort") as SortKey | null) ?? DEFAULT_SORT;

  // Checkbox-driven filters get a local optimistic mirror of their URL
  // value, same reasoning as search: router.replace() -> useSearchParams()
  // updating isn't necessarily inside the same paint as the click, so a
  // checkbox whose `checked` prop is derived directly from searchParams can
  // visibly lag a real click (and fails Playwright's stricter .check(),
  // which expects the DOM property to flip immediately). Local state
  // updates synchronously in the same event; the URL write rides along
  // un-debounced right after.
  // Returns only the local mirror + its raw setter -- deliberately does NOT
  // also call setParams internally. Two separate setParams calls in the
  // same event (one from this hook, one from the caller for a companion
  // param like "assignee") race: each builds its new URLSearchParams from
  // whatever searchParams currently is, and router.replace() hasn't landed
  // yet when the second call reads it, so it silently reverts the first.
  // Every handler below makes exactly one combined setParams call instead.
  function useUrlBoolean(param: (typeof PARAM_KEYS)[number]) {
    const urlValue = searchParams.get(param) === "1";
    const [local, setLocal] = useState(urlValue);
    useEffect(() => setLocal(urlValue), [urlValue]);
    return [local, setLocal] as const;
  }

  const [includeClosed, setIncludeClosed] = useUrlBoolean("closed");
  const [showProdOnly, setShowProdOnly] = useUrlBoolean("prod");
  const [showAutoReviewedOnly, setShowAutoReviewedOnly] = useUrlBoolean("reviewed");
  const [showNextBuildOnly, setShowNextBuildOnly] = useUrlBoolean("build");
  const [myTasksOnly, setMyTasksOnly] = useUrlBoolean("mine");

  // Updates one or more params at once (e.g. setting "assignee" while
  // clearing "mine") and pushes the result with replace + no scroll, so
  // filtering never grows browser history or jumps the page -- only
  // actually navigating to a task does that.
  const setParams = useCallback(
    (updates: Partial<Record<(typeof PARAM_KEYS)[number], string | null>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue; // leave this param exactly as-is
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Search gets its own local echo of the URL value: typing needs to feel
  // instant (no per-keystroke history churn), but the URL still needs to
  // reflect it for persistence, and stay in sync when it changes from
  // outside this input (Clear filters, browser back/forward).
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => setParams({ q: searchInput || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // The open build (shippedAt: null) is "the next build" everyone tags
  // tasks onto -- derived from each task's own build relation rather than
  // a separate fetch, since listVisibleTasks already includes it.
  const nextBuild = useMemo(() => {
    const members = tasks.filter((t) => t.build && !t.build.shippedAt);
    if (members.length === 0) return null;
    const ready = members.every((t) => t.closed);
    return { number: members[0].build!.number, count: members.length, ready };
  }, [tasks]);

  function handleShip() {
    if (!nextBuild) return;
    if (!window.confirm(`Ship build #${nextBuild.number}? This archives it as shipped history.`)) return;
    setShipError(null);
    startShipTransition(async () => {
      try {
        await shipCurrentBuild();
        router.refresh();
      } catch (err) {
        setShipError(err instanceof Error ? err.message : "Failed to ship build.");
      }
    });
  }

  const counts = useMemo(() => {
    // Stage/status counts reflect what you'd actually see by default (closed
    // tasks excluded) -- so a badge's number always matches its own list
    // once clicked, unless "+ Closed" is also checked.
    //
    // Stage is the first filter layer: Status's counts (and by extension
    // its options) are scoped to the currently selected Stage, if any --
    // picking Staging then looking at Status should only ever reflect
    // Staging tasks, not the whole board.
    const stage: Record<Stage, number> = { DEVELOPMENT: 0, STAGING: 0, PRODUCTION: 0 };
    const stageStatus: Record<StageStatus, number> = { OPEN: 0, IN_PROGRESS: 0, CHANGES_REQUESTED: 0, COMPLETE: 0 };
    // Full Stage x StageStatus cross-tab, independent of the current stage/
    // status filters (unlike stageStatus above) -- this is what answers
    // "what's where, right now" at a glance instead of one axis at a time.
    const matrix: Record<Stage, Record<StageStatus, number>> = {
      DEVELOPMENT: { OPEN: 0, IN_PROGRESS: 0, CHANGES_REQUESTED: 0, COMPLETE: 0 },
      STAGING: { OPEN: 0, IN_PROGRESS: 0, CHANGES_REQUESTED: 0, COMPLETE: 0 },
      PRODUCTION: { OPEN: 0, IN_PROGRESS: 0, CHANGES_REQUESTED: 0, COMPLETE: 0 },
    };
    let closedCount = 0;
    let prodCount = 0;
    let autoReviewedCount = 0;
    for (const t of tasks) {
      if (t.closed) {
        closedCount++;
      } else {
        stage[t.stage]++;
        if (!stageFilter || t.stage === stageFilter) {
          stageStatus[t.stageStatus]++;
        }
        matrix[t.stage][t.stageStatus]++;
      }
      if (t.foundInProduction) prodCount++;
      if (t.autoReviewed) autoReviewedCount++;
    }
    return { stage, stageStatus, matrix, closedCount, prodCount, autoReviewedCount };
  }, [tasks, stageFilter]);

  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    const qNumber = q.startsWith("#") ? q.slice(1) : q;
    const result = tasks.filter((t) => {
      // Closed tasks are hidden by default, independent of stage/status --
      // "+ Closed" brings them back into whatever stage/status filter (if
      // any) is active.
      if (!includeClosed && t.closed) return false;
      if (stageFilter && t.stage !== stageFilter) return false;
      if (stageStatusFilter && t.stageStatus !== stageStatusFilter) return false;
      if (assigneeFilter && t.assigneeId !== assigneeFilter) return false;
      if (appAreaFilter && t.appAreaId !== appAreaFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (typeFilter && t.type !== typeFilter) return false;
      if (showProdOnly && !t.foundInProduction) return false;
      if (showAutoReviewedOnly && !t.autoReviewed) return false;
      if (showNextBuildOnly && !(t.build && !t.build.shippedAt)) return false;
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

    // tasks arrives pre-sorted by updatedAt desc from the query, which is
    // exactly what "updated" wants -- only actually re-sort for the other
    // three options.
    if (sort === "number") {
      result.sort((a, b) => b.number - a.number);
    } else if (sort === "priority") {
      result.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
    } else if (sort === "due") {
      result.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1; // no due date sorts last
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    }
    return result;
  }, [
    tasks,
    searchInput,
    stageFilter,
    stageStatusFilter,
    assigneeFilter,
    appAreaFilter,
    priorityFilter,
    typeFilter,
    includeClosed,
    showProdOnly,
    showAutoReviewedOnly,
    showNextBuildOnly,
    myTasksOnly,
    currentUserId,
    sort,
  ]);

  const selectClass = "border border-neutral-300 rounded-lg px-2 py-1.5 text-sm outline-none";

  const hasActiveFilters =
    stageFilter ||
    stageStatusFilter ||
    assigneeFilter ||
    appAreaFilter ||
    priorityFilter ||
    typeFilter ||
    includeClosed ||
    showProdOnly ||
    showAutoReviewedOnly ||
    showNextBuildOnly ||
    myTasksOnly ||
    searchInput;

  return (
    <div className="flex flex-col gap-5">
      {/* Stage x Status at a glance -- the two strips below let you filter
          one axis at a time, but with both independent (no gating between
          them) there's no way to see the full picture from either alone.
          This grid answers "what's where, right now" in one look; each cell
          jumps straight to that exact stage+status combination. */}
      <div className="rounded-xl border border-neutral-200 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-xs text-neutral-400 uppercase tracking-wide bg-neutral-50 border-b border-neutral-200">
                Stage \ Status
              </th>
              {ALL_STAGE_STATUSES.map((st) => (
                <th
                  key={st}
                  className="text-center px-3 py-2 text-xs text-neutral-400 uppercase tracking-wide bg-neutral-50 border-b border-neutral-200"
                >
                  {STAGE_STATUS_LABELS[st]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_STAGES.map((s) => (
              <tr key={s} className="border-t border-neutral-100 first:border-t-0">
                <th className="text-left px-3 py-2 axiMed text-neutral-700 bg-neutral-50">
                  {STAGE_LABELS[s]}
                </th>
                {ALL_STAGE_STATUSES.map((st) => {
                  const count = counts.matrix[s][st];
                  const isActive = stageFilter === s && stageStatusFilter === st;
                  return (
                    <td key={st} className="p-1">
                      <button
                        onClick={() => setParams({ stage: s, status: st })}
                        disabled={count === 0}
                        className={`w-full rounded-lg px-3 py-2 text-center transition-colors ${
                          isActive
                            ? "border border-brand bg-brand/5"
                            : count === 0
                              ? "border border-transparent text-neutral-300 cursor-default"
                              : "border border-neutral-200 hover:border-neutral-300"
                        }`}
                      >
                        <span className={count === 0 ? "" : "axiMed"}>{count}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stage and status -- two independent clickable strips, combine freely */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
        <span className="axiBold text-xs text-neutral-400 uppercase tracking-wide mr-1">
          Stage
        </span>
        {ALL_STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setParams({ stage: stageFilter === s ? null : s })}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors bg-white ${
              stageFilter === s
                ? "border-brand bg-brand/5"
                : "border-neutral-200 hover:border-neutral-300"
            }`}
          >
            <span className="axiMed">{counts.stage[s]}</span>
            <span className="text-neutral-500">{STAGE_LABELS[s]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
        <span className="axiBold text-xs text-neutral-400 uppercase tracking-wide mr-1">
          Status
        </span>
        {ALL_STAGE_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setParams({ status: stageStatusFilter === s ? null : s })}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors bg-white ${
              stageStatusFilter === s
                ? "border-brand bg-brand/5"
                : "border-neutral-200 hover:border-neutral-300"
            }`}
          >
            <span className="axiMed">{counts.stageStatus[s]}</span>
            <span className="text-neutral-500">{STAGE_STATUS_LABELS[s]}</span>
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-sm ml-1 text-neutral-600">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => {
              setIncludeClosed(e.target.checked);
              setParams({ closed: e.target.checked ? "1" : null });
            }}
          />
          + Closed ({counts.closedCount})
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {counts.prodCount > 0 && (
          <button
            onClick={() => {
              setShowProdOnly(!showProdOnly);
              setParams({ prod: !showProdOnly ? "1" : null });
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors w-fit ${
              showProdOnly ? "border-red-500 bg-red-50" : "border-red-200 hover:border-red-300"
            }`}
          >
            <span className="axiMed text-red-700">{counts.prodCount}</span>
            <span className="text-red-600">Found in production</span>
          </button>
        )}
        {/* Only ever non-zero for ADMIN -- autoReviewed is redacted to false
            for everyone else at the query layer, so this button (and the
            count) naturally disappears for non-admin sessions. */}
        {counts.autoReviewedCount > 0 && (
          <button
            onClick={() => {
              setShowAutoReviewedOnly(!showAutoReviewedOnly);
              setParams({ reviewed: !showAutoReviewedOnly ? "1" : null });
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors w-fit ${
              showAutoReviewedOnly
                ? "border-indigo-500 bg-indigo-50"
                : "border-indigo-200 hover:border-indigo-300"
            }`}
            title="Tasks Claude has reviewed and left a note on -- your call is still needed"
          >
            <span className="axiMed text-indigo-700">{counts.autoReviewedCount}</span>
            <span className="text-indigo-600">yp-review1, needs your review</span>
          </button>
        )}
        {nextBuild && (
          <button
            onClick={() => {
              setShowNextBuildOnly(!showNextBuildOnly);
              setParams({ build: !showNextBuildOnly ? "1" : null });
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors w-fit ${
              showNextBuildOnly
                ? nextBuild.ready
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-blue-500 bg-blue-50"
                : nextBuild.ready
                  ? "border-emerald-200 hover:border-emerald-300"
                  : "border-blue-200 hover:border-blue-300"
            }`}
          >
            <span className={`axiMed ${nextBuild.ready ? "text-emerald-700" : "text-blue-700"}`}>
              {nextBuild.count}
            </span>
            <span className={nextBuild.ready ? "text-emerald-600" : "text-blue-600"}>
              {nextBuild.ready ? "Next build is ready" : "Included in next build"}
            </span>
          </button>
        )}
        {isAdmin && nextBuild && (
          <button
            onClick={handleShip}
            disabled={isShipping}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-brand transition-colors disabled:opacity-50"
          >
            Ship build #{nextBuild.number}
          </button>
        )}
      </div>
      {shipError && (
        <p className="text-sm text-red-600" role="alert">
          {shipError}
        </p>
      )}

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          placeholder="Search tasks or #number..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
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
            // One setParams call carrying both changes -- two separate
            // calls would race (see useUrlBoolean's comment above).
            if (e.target.value) setMyTasksOnly(false);
            setParams({ assignee: e.target.value || null, mine: e.target.value ? null : undefined });
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
          onChange={(e) => setParams({ area: e.target.value || null })}
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
          onChange={(e) => setParams({ priority: e.target.value || null })}
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
          onChange={(e) => setParams({ type: e.target.value || null })}
          className={selectClass}
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setParams({ sort: e.target.value === DEFAULT_SORT ? null : e.target.value })}
          className={selectClass}
          aria-label="Sort by"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              Sort: {SORT_LABELS[key]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={myTasksOnly}
            onChange={(e) => {
              setMyTasksOnly(e.target.checked);
              setParams({ mine: e.target.checked ? "1" : null, assignee: e.target.checked ? null : undefined });
            }}
          />
          My tasks
        </label>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearchInput("");
              router.replace(pathname, { scroll: false });
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
            <Badge label={STAGE_LABELS[t.stage]} className={STAGE_COLORS[t.stage]} />
            <Badge label={STAGE_STATUS_LABELS[t.stageStatus]} className={STAGE_STATUS_COLORS[t.stageStatus]} />
            {t.closed && <Badge label="Closed" className="bg-neutral-800 text-white" />}
            {t.foundInProduction && (
              <Badge label="Found in prod" className="bg-red-100 text-red-700" />
            )}
            {t.autoReviewed && (
              <Badge label="yp-review1" className="bg-indigo-100 text-indigo-700" />
            )}
            {t.build && !t.build.shippedAt && (
              <Badge label="Next build" className="bg-blue-100 text-blue-700" />
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
