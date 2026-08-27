"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PIPELINE_ORDER,
  PIPELINE_LABELS,
  PIPELINE_MARKER,
  PRIORITY_LABELS,
} from "@/lib/labels";
import Avatar from "@/components/ui/Avatar";
import Menu from "@/components/ui/Menu";
import { Button } from "@/components/ui/Button";
import {
  startTask,
  sendForReview,
  approveTask,
  markDeployed,
  toggleNextBuild,
  archiveTask,
  unarchiveTask,
  setPipeline,
} from "@/app/tasks/actions";
import type { BoardTask, Me } from "./BoardView";

const PRIORITY_DOT: Record<string, string> = {
  LOW: "var(--pipe-backlog)",
  MEDIUM: "var(--info)",
  HIGH: "var(--warning)",
  CRITICAL: "var(--danger)",
};

function isOverdue(t: BoardTask): boolean {
  return !!t.dueDate && !t.archived && new Date(t.dueDate) < new Date();
}

export default function TaskCard({
  task,
  me,
  runAction,
  isPending,
  openBuildNumber,
}: {
  task: BoardTask;
  me: Me;
  runAction: (fn: () => Promise<unknown>, msg?: string) => void;
  isPending: boolean;
  openBuildNumber: number | null;
}) {
  const router = useRouter();
  const isReviewer = me.role === "ADMIN" || me.role === "APPROVER";
  const inOpenBuild = !!task.build && !task.build.shippedAt;
  const isBuildArea = task.appArea.releaseMode === "BUILD";

  let primary: { label: string; run: () => Promise<unknown>; msg: string } | null = null;
  if (!task.archived) {
    if (task.pipeline === "BACKLOG")
      primary = { label: "Start", run: () => startTask(task.id), msg: "Moved to Being fixed." };
    else if (task.pipeline === "IN_PROGRESS")
      primary = { label: "Send for review", run: () => sendForReview(task.id), msg: "Sent for review." };
    else if (task.pipeline === "IN_REVIEW" && isReviewer)
      primary = { label: "Approve", run: () => approveTask(task.id), msg: "Approved." };
    else if (task.pipeline === "READY_TO_DEPLOY") {
      if (isBuildArea && !inOpenBuild)
        primary = { label: "Add to build", run: () => toggleNextBuild(task.id, true), msg: "Added to the next build." };
      else if (!isBuildArea)
        primary = { label: "Mark deployed", run: () => markDeployed(task.id), msg: "Marked deployed." };
    } else if (task.pipeline === "DEPLOYED")
      primary = { label: "Archive", run: () => archiveTask(task.id), msg: "Archived." };
  }

  const menuOptions = [
    { value: "open", label: "Open" },
    ...PIPELINE_ORDER.filter((p) => p !== task.pipeline).map((p) => ({
      value: `move:${p}`,
      label: `Move to ${PIPELINE_LABELS[p]}`,
    })),
    task.archived
      ? { value: "unarchive", label: "Bring back from archive" }
      : { value: "archive", label: "Archive" },
  ];

  function onSelect(value: string) {
    if (value === "open") {
      router.push(`/tasks/${task.id}`);
      return;
    }
    if (value === "archive") return runAction(() => archiveTask(task.id), "Archived.");
    if (value === "unarchive") return runAction(() => unarchiveTask(task.id), "Brought back.");
    if (value.startsWith("move:")) {
      const p = value.slice(5) as (typeof PIPELINE_ORDER)[number];
      return runAction(() => setPipeline(task.id, p), `Moved to ${PIPELINE_LABELS[p]}.`);
    }
  }

  const overdue = isOverdue(task);

  return (
    <div
      className={`group relative rounded-[var(--radius-sm)] border border-border bg-surface p-2.5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow)] ${
        task.archived ? "opacity-60" : ""
      }`}
      style={{ borderLeft: `3px solid ${task.archived ? "var(--border-strong)" : PIPELINE_MARKER[task.pipeline]}` }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 size-2 shrink-0 rounded-full"
          style={{ background: PRIORITY_DOT[task.priority] }}
          title={`${PRIORITY_LABELS[task.priority]} priority`}
        />
        <Link
          href={`/tasks/${task.id}`}
          className="flex-1 text-[0.8125rem] font-medium leading-snug text-fg hover:text-brand-ink"
        >
          {task.title}
        </Link>
        <Menu
          trigger={() => (
            <span className="rounded-[var(--radius-sm)] px-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-fg group-hover:opacity-100">
              ⋯
            </span>
          )}
          options={menuOptions}
          onSelect={onSelect}
          align="end"
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-4 text-[0.6875rem] text-fg-subtle">
        <span className="tabular-nums">#{task.number}</span>
        <span className="text-border-strong">·</span>
        <span>{task.appArea.name}</span>
        {task.changesRequested && (
          <span className="rounded bg-danger-wash px-1 font-medium text-danger-ink">changes requested</span>
        )}
        {task.foundInProduction && (
          <span className="rounded bg-danger-wash px-1 font-medium text-danger-ink">in prod</span>
        )}
        {overdue && <span className="rounded bg-danger px-1 font-medium text-white">overdue</span>}
        {inOpenBuild && openBuildNumber != null && (
          <span className="rounded bg-info-wash px-1 font-medium text-info">build #{openBuildNumber}</span>
        )}
        <span className="ml-auto">
          <Avatar name={task.assignee?.name} size={18} />
        </span>
      </div>

      {primary && (
        <div className="mt-2 pl-4">
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => runAction(primary.run, primary.msg)}
            className="h-7 w-full text-[0.75rem]"
          >
            {primary.label}
          </Button>
        </div>
      )}
    </div>
  );
}
