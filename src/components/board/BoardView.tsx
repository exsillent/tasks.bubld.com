"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Pipeline, Role } from "@prisma/client";
import {
  PIPELINE_ORDER,
  PIPELINE_SHORT,
  PIPELINE_HINTS,
  PIPELINE_MARKER,
  PRIORITY_LABELS,
  TYPE_LABELS,
} from "@/lib/labels";
import type { listVisibleTasks, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { archiveAllDeployed } from "@/app/tasks/actions";
import TaskCard from "./TaskCard";
import TableView from "./TableView";

export type BoardTask = Awaited<ReturnType<typeof listVisibleTasks>>[number];
type ActiveUser = Awaited<ReturnType<typeof listActiveUsers>>[number];
type AppAreaOption = Awaited<ReturnType<typeof listAllAppAreas>>[number];
export type Me = { id: string; role: Role; name: string };

function isOverdue(t: BoardTask): boolean {
  return !!t.dueDate && !t.archived && new Date(t.dueDate) < new Date();
}

const selectClass =
  "h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-[0.8125rem] text-fg-muted outline-none focus:border-brand";

export default function BoardView({
  tasks,
  users,
  appAreas,
  openBuildNumber,
  me,
}: {
  tasks: BoardTask[];
  users: ActiveUser[];
  appAreas: AppAreaOption[];
  openBuildNumber: number | null;
  me: Me;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();

  const view = params.get("view") === "table" ? "table" : "board";
  const search = params.get("q") ?? "";
  const assignee = params.get("assignee") ?? "";
  const area = params.get("area") ?? "";
  const priority = params.get("priority") ?? "";
  const type = params.get("type") ?? "";
  const showArchived = params.get("archived") === "1";
  const focus = params.get("focus") ?? ""; // a "needs you" chip

  const [searchInput, setSearchInput] = useState(search);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const runAction = useCallback(
    (fn: () => Promise<unknown>, successMessage?: string) => {
      startTransition(async () => {
        try {
          await fn();
          router.refresh();
          if (successMessage) toast(successMessage, "success");
        } catch (err) {
          toast(err instanceof Error ? err.message : "Something went wrong.", "danger");
        }
      });
    },
    [router, toast],
  );

  // --- "Needs you" chips, role-aware -------------------------------------
  const needs = useMemo(() => {
    const mine = tasks.filter((t) => !t.archived);
    const chips: { key: string; label: string; count: number }[] = [];
    const reviewQueue = mine.filter((t) => t.pipeline === "IN_REVIEW");
    const toDeploy = mine.filter((t) => t.pipeline === "READY_TO_DEPLOY");
    const sentBack = mine.filter((t) => t.assigneeId === me.id && t.changesRequested);
    const onMyPlate = mine.filter(
      (t) => t.assigneeId === me.id && (t.pipeline === "BACKLOG" || t.pipeline === "IN_PROGRESS"),
    );
    const overdue = mine.filter((t) => t.assigneeId === me.id && isOverdue(t));

    if (me.role === "APPROVER" || me.role === "ADMIN") {
      if (reviewQueue.length) chips.push({ key: "review", label: "to review", count: reviewQueue.length });
    }
    if (me.role === "ADMIN") {
      if (toDeploy.length) chips.push({ key: "deploy", label: "to deploy", count: toDeploy.length });
    }
    if (sentBack.length) chips.push({ key: "sentback", label: "sent back to you", count: sentBack.length });
    if (onMyPlate.length && me.role !== "APPROVER")
      chips.push({ key: "mine", label: "on your plate", count: onMyPlate.length });
    if (overdue.length) chips.push({ key: "overdue", label: "overdue", count: overdue.length });
    return chips;
  }, [tasks, me]);

  function matchesFocus(t: BoardTask): boolean {
    switch (focus) {
      case "review":
        return t.pipeline === "IN_REVIEW";
      case "deploy":
        return t.pipeline === "READY_TO_DEPLOY";
      case "sentback":
        return t.assigneeId === me.id && t.changesRequested;
      case "mine":
        return t.assigneeId === me.id && (t.pipeline === "BACKLOG" || t.pipeline === "IN_PROGRESS");
      case "overdue":
        return t.assigneeId === me.id && isOverdue(t);
      default:
        return true;
    }
  }

  // --- Filtering --------------------------------------------------------
  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    const qNum = q.startsWith("#") ? q.slice(1) : q;
    return tasks.filter((t) => {
      if (!showArchived && t.archived) return false;
      if (assignee === "unassigned" ? t.assigneeId !== null : assignee && t.assigneeId !== assignee)
        return false;
      if (area && t.appAreaId !== area) return false;
      if (priority && t.priority !== priority) return false;
      if (type && t.type !== type) return false;
      if (!matchesFocus(t)) return false;
      if (
        q &&
        String(t.number) !== qNum &&
        !t.title.toLowerCase().includes(q) &&
        !t.description.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, searchInput, showArchived, assignee, area, priority, type, focus, me.id]);

  const byColumn = useMemo(() => {
    const cols: Record<Pipeline, BoardTask[]> = {
      BACKLOG: [],
      IN_PROGRESS: [],
      IN_REVIEW: [],
      READY_TO_DEPLOY: [],
      DEPLOYED: [],
    };
    for (const t of filtered) if (!t.archived) cols[t.pipeline].push(t);
    for (const key of PIPELINE_ORDER) {
      cols[key].sort((a, b) => {
        const ao = isOverdue(a) ? 1 : 0;
        const bo = isOverdue(b) ? 1 : 0;
        if (ao !== bo) return bo - ao;
        return b.number - a.number;
      });
    }
    return cols;
  }, [filtered]);

  const archivedCount = tasks.filter((t) => t.archived).length;
  const deployedCount = tasks.filter((t) => !t.archived && t.pipeline === "DEPLOYED").length;
  const hasFilters = !!(searchInput || assignee || area || priority || type || focus);

  async function handleArchiveDeployed() {
    if (
      !(await confirm({
        title: `Archive all ${deployedCount} deployed task${deployedCount === 1 ? "" : "s"}?`,
        body: "They stay searchable, just off the board.",
        confirmLabel: "Archive them",
      }))
    )
      return;
    runAction(async () => {
      const n = await archiveAllDeployed();
      toast(`Archived ${n} task${n === 1 ? "" : "s"}.`, "success");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {dialog}

      {/* Needs you */}
      {needs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-brand/25 bg-brand-wash px-3 py-2">
          <span className="text-sm font-bold text-brand-ink">Needs you</span>
          {needs.map((c) => {
            const active = focus === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setParams({ focus: active ? null : c.key, view: null })}
                className={`rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-medium transition-colors ${
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-brand/40 bg-surface text-brand-ink hover:border-brand"
                }`}
              >
                <span className="tabular-nums">{c.count}</span> {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setParams({ q: e.target.value || null });
          }}
          placeholder="Search or #number…"
          className="h-8 min-w-[160px] flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[0.8125rem] outline-none focus:border-brand"
        />
        <select value={assignee} onChange={(e) => setParams({ assignee: e.target.value || null })} className={selectClass}>
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={area} onChange={(e) => setParams({ area: e.target.value || null })} className={selectClass}>
          <option value="">All areas</option>
          {appAreas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setParams({ priority: e.target.value || null })} className={selectClass}>
          <option value="">Any priority</option>
          {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setParams({ type: e.target.value || null })} className={selectClass}>
          <option value="">Any type</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[0.8125rem] text-fg-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setParams({ archived: e.target.checked ? "1" : null })}
          />
          Archived ({archivedCount})
        </label>
        {hasFilters && (
          <button
            onClick={() => {
              setSearchInput("");
              router.replace(pathname, { scroll: false });
            }}
            className="text-[0.8125rem] text-fg-subtle hover:text-fg"
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {me.role === "ADMIN" && deployedCount > 0 && (
            <Button size="sm" variant="ghost" onClick={handleArchiveDeployed} disabled={isPending}>
              Archive {deployedCount} deployed
            </Button>
          )}
          <div className="flex overflow-hidden rounded-[var(--radius-sm)] border border-border-strong">
            {(["board", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setParams({ view: v === "board" ? null : v })}
                className={`px-2.5 py-1 text-[0.8125rem] font-medium capitalize transition-colors ${
                  view === v ? "bg-fg text-bg" : "bg-surface text-fg-muted hover:bg-surface-2"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "table" ? (
        <TableView tasks={filtered} me={me} runAction={runAction} isPending={isPending} openBuildNumber={openBuildNumber} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {PIPELINE_ORDER.map((col) => (
            <section key={col} className="flex flex-col rounded-[var(--radius)] bg-surface-2/60">
              <header className="flex items-baseline justify-between px-2.5 pt-2.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: PIPELINE_MARKER[col] }}
                  />
                  <h2 className="text-[0.8125rem] font-bold text-fg">{PIPELINE_SHORT[col]}</h2>
                  <span className="text-xs tabular-nums text-fg-subtle">{byColumn[col].length}</span>
                </div>
              </header>
              <p className="px-2.5 pb-1.5 pt-0.5 text-[0.6875rem] text-fg-subtle">{PIPELINE_HINTS[col]}</p>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {byColumn[col].length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-fg-subtle">—</p>
                ) : (
                  byColumn[col].map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      me={me}
                      runAction={runAction}
                      isPending={isPending}
                      openBuildNumber={openBuildNumber}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <EmptyState
          title={hasFilters ? "No tasks match those filters." : "Nothing here yet."}
          hint={hasFilters ? "Try clearing a filter." : undefined}
        />
      )}
    </div>
  );
}
